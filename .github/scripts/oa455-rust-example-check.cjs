"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { Worker } = require("node:worker_threads");

const [baselinePath, candidatePath, workerArg] = process.argv.slice(2);
const workerPath = path.resolve(workerArg);
const inputJson = JSON.stringify({
  id: "0000001-0000000001",
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M",
  topics: ["7472616e73666572"],
  data: "0000000000000000",
  ledger: 5000000,
  timestamp: 1720000000,
  txHash: "a".repeat(64),
});

async function execute(label, wasmPath, maxMemoryPages) {
  const bytes = readFileSync(wasmPath);
  const module = await WebAssembly.compile(bytes);
  const started = performance.now();
  const worker = new Worker(workerPath, {
    workerData: { wasmBytes: bytes, inputJson, maxMemoryPages, maxOutputBytes: 65536 },
  });
  let timer;
  try {
    const result = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", (code) => reject(new Error(`Worker exited before reply (${code})`)));
      timer = setTimeout(() => reject(new Error("Worker exceeded 1000 ms")), 1000);
    });
    return {
      label,
      byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      imports: WebAssembly.Module.imports(module),
      exports: WebAssembly.Module.exports(module),
      maxMemoryPages,
      elapsedMs: Number((performance.now() - started).toFixed(3)),
      result,
    };
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}

(async () => {
  const baseline = await execute("original documented build", baselinePath, 256);
  const candidate = await execute("build with imported memory", candidatePath, 256);
  const constrained = await execute("same candidate with one-page host cap", candidatePath, 1);
  console.log(JSON.stringify({
    sourceCommit: "9befa56850ecb7bbe901119eeb6e916867cd8c4a",
    validationCommit: process.env.GITHUB_SHA ?? null,
    node: process.version,
    workerSha256: createHash("sha256").update(readFileSync(workerPath)).digest("hex"),
    cases: [baseline, candidate, constrained],
  }, null, 2));
  assert.deepEqual(baseline.imports, []);
  assert.equal(baseline.result.success, false);
  assert.equal(baseline.result.errorType, "FORBIDDEN_IMPORTS");
  assert.deepEqual(candidate.imports, [{ module: "env", name: "memory", kind: "memory" }]);
  assert.equal(candidate.result.success, true);
  assert.deepEqual(candidate.result.output, {
    description: "Community parser: sample transfer on CAAA…HK3M",
    eventType: "transfer",
  });
  assert.ok(candidate.result.peakMemoryBytes <= 256 * 65536);
  assert.equal(constrained.result.success, false);
  assert.equal(constrained.result.errorType, "MEMORY_LIMIT_EXCEEDED");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
