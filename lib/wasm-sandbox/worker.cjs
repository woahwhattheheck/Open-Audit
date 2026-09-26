/**
 * WASM sandbox worker (CommonJS for worker_threads reliability).
 *
 * Instantiates the guest with ONLY env.memory (host-capped).
 * No WASI, no fs, no network, no Node builtins exposed to the guest.
 *
 * Guest ABI:
 *   alloc(size: i32) -> i32
 *   dealloc(ptr: i32, size: i32)?  // optional
 *   translate(in_ptr: i32, in_len: i32) -> i32  // out_ptr
 *   get_output_len() -> i32
 */
"use strict";

const { parentPort, workerData } = require("worker_threads");

async function main() {
  if (!parentPort) {
    throw new Error("wasm-sandbox worker must run as a Worker thread");
  }

  const { wasmBytes, inputJson, maxMemoryPages, maxOutputBytes } = workerData;
  if (!wasmBytes || typeof inputJson !== "string" || !maxMemoryPages) {
    throw new Error("Missing required workerData fields");
  }

  const bytes =
    wasmBytes instanceof Uint8Array
      ? wasmBytes
      : Buffer.isBuffer(wasmBytes)
        ? new Uint8Array(wasmBytes)
        : new Uint8Array(wasmBytes);

  const module = await WebAssembly.compile(bytes);

  // Require exactly the one host-capped memory. A module with no imports
  // could otherwise instantiate with its own private, unbounded memory.
  const moduleImports = WebAssembly.Module.imports(module);
  if (
    moduleImports.length !== 1 ||
    moduleImports[0].module !== "env" ||
    moduleImports[0].name !== "memory" ||
    moduleImports[0].kind !== "memory"
  ) {
    throw new Error("Forbidden imports in worker: expected only env.memory");
  }

  const memory = new WebAssembly.Memory({
    initial: 1,
    maximum: maxMemoryPages,
  });

  const imports = {
    env: {
      memory,
    },
  };

  const instance = await WebAssembly.instantiate(module, imports);
  const exports = instance.exports;

  if (
    typeof exports.alloc !== "function" ||
    typeof exports.translate !== "function" ||
    typeof exports.get_output_len !== "function"
  ) {
    throw new Error("Missing required exports: alloc, translate, get_output_len");
  }

  const inputBytes = Buffer.from(inputJson, "utf8");
  const inPtr = exports.alloc(inputBytes.length);
  if (!inPtr) {
    throw new Error("alloc returned null pointer for input");
  }

  // memory.buffer may detach after grow; always re-read.
  new Uint8Array(memory.buffer).set(inputBytes, inPtr);

  let outPtr;
  try {
    outPtr = exports.translate(inPtr, inputBytes.length);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`RUNTIME_TRAP: ${msg}`);
  }

  if (typeof exports.dealloc === "function") {
    try {
      exports.dealloc(inPtr, inputBytes.length);
    } catch {
      // ignore dealloc failures after translate
    }
  }

  if (!outPtr) {
    throw new Error("translate returned null pointer");
  }

  const outLen = exports.get_output_len() | 0;
  if (outLen <= 0) {
    throw new Error(`Invalid output length: ${outLen}`);
  }
  if (outLen > maxOutputBytes) {
    throw new Error(
      `OUTPUT_TOO_LARGE: ${outLen} bytes exceeds max ${maxOutputBytes}`
    );
  }
  if (outPtr + outLen > memory.buffer.byteLength) {
    throw new Error(
      `RUNTIME_TRAP: output range [${outPtr}, ${outPtr + outLen}) exceeds memory`
    );
  }

  const outBytes = Buffer.from(memory.buffer).subarray(outPtr, outPtr + outLen);
  const outStr = outBytes.toString("utf8");

  let output;
  try {
    output = JSON.parse(outStr);
  } catch (err) {
    throw new Error(
      `INVALID_OUTPUT_JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  parentPort.postMessage({
    success: true,
    output,
    peakMemoryBytes: memory.buffer.byteLength,
  });
}

main().catch((err) => {
  if (parentPort) {
    parentPort.postMessage({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      errorType: classifyError(err),
    });
  }
});

function classifyError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Forbidden import")) return "FORBIDDEN_IMPORTS";
  if (msg.includes("OUTPUT_TOO_LARGE")) return "INVALID_OUTPUT";
  if (msg.includes("INVALID_OUTPUT")) return "INVALID_OUTPUT";
  if (msg.includes("RUNTIME_TRAP") || msg.includes("unreachable") || msg.includes("out of bounds")) {
    return "RUNTIME_TRAP";
  }
  if (msg.includes("memory") && msg.includes("Maximum")) return "MEMORY_LIMIT_EXCEEDED";
  return "RUNTIME_TRAP";
}
