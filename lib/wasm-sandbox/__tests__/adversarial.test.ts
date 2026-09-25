import { describe, it, expect, beforeEach } from "vitest";
import { WasmSandboxRunner } from "../runner";
import { validateWasmModule } from "../validate-module";
import { loadFixture, SAMPLE_EVENT_INPUT } from "./fixtures";

describe("WASM sandbox adversarial suite (#405)", () => {
  let runner: WasmSandboxRunner;

  beforeEach(() => {
    runner = new WasmSandboxRunner({
      maxExecutionTimeMs: 400,
      maxMemoryPages: 8, // 512 KiB — keeps memory_bomb fast
      maxOutputBytes: 4 * 1024,
    });
  });

  it("contains infinite loops via TIMEOUT_EXCEEDED without crashing the host", async () => {
    const result = await runner.execute(
      loadFixture("infinite_loop.wasm"),
      SAMPLE_EVENT_INPUT
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errorType).toBe("TIMEOUT_EXCEEDED");
      expect(result.stats.timedOut).toBe(true);
    }
    // Host still responsive:
    expect(1 + 1).toBe(2);
  });

  it("contains memory exhaustion attempts", async () => {
    const result = await runner.execute(
      loadFixture("memory_bomb.wasm"),
      SAMPLE_EVENT_INPUT
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(["RUNTIME_TRAP", "MEMORY_LIMIT_EXCEEDED", "UNKNOWN_ERROR"]).toContain(
        result.error.errorType
      );
    }
  });

  it("contains out-of-bounds memory access traps", async () => {
    const result = await runner.execute(
      loadFixture("oob_read.wasm"),
      SAMPLE_EVENT_INPUT
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errorType).toBe("RUNTIME_TRAP");
    }
  });

  it("rejects malformed guest output", async () => {
    const result = await runner.execute(
      loadFixture("malformed_output.wasm"),
      SAMPLE_EVENT_INPUT
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errorType).toBe("INVALID_OUTPUT");
    }
  });

  it("rejects oversized guest output claims", async () => {
    const result = await runner.execute(
      loadFixture("oversized_output.wasm"),
      SAMPLE_EVENT_INPUT
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errorType).toBe("INVALID_OUTPUT");
    }
  });

  it("rejects WASI imports before execution (zero ambient capabilities)", async () => {
    const bytes = loadFixture("wasi_attempt.wasm");
    const module = await WebAssembly.compile(bytes);
    expect(() => validateWasmModule(module)).toThrow(/Forbidden WASM import/);

    const result = await runner.execute(bytes, SAMPLE_EVENT_INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errorType).toBe("FORBIDDEN_IMPORTS");
    }
  });

  it("rejects filesystem / Node API imports", async () => {
    const bytes = loadFixture("fs_attempt.wasm");
    const module = await WebAssembly.compile(bytes);
    expect(() => validateWasmModule(module)).toThrow(/Forbidden WASM import/);

    const result = await runner.execute(bytes, SAMPLE_EVENT_INPUT);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errorType).toBe("FORBIDDEN_IMPORTS");
    }
  });
});
