import { describe, it, expect, beforeEach } from "vitest";
import { WasmSandboxRunner } from "../runner";
import { hasOnlyMemoryImport, validateWasmModule } from "../validate-module";
import { loadFixture, SAMPLE_EVENT_INPUT } from "./fixtures";

describe("WasmSandboxRunner happy path", () => {
  let runner: WasmSandboxRunner;

  beforeEach(() => {
    runner = new WasmSandboxRunner({ maxExecutionTimeMs: 2000, maxMemoryPages: 16 });
  });

  it("translates a sample event via the echo community parser", async () => {
    const bytes = loadFixture("echo_parser.wasm");
    const module = await WebAssembly.compile(bytes);
    validateWasmModule(module);
    expect(hasOnlyMemoryImport(module)).toBe(true);

    const result = await runner.execute(bytes, SAMPLE_EVENT_INPUT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.eventType).toBe("transfer");
      expect(result.output.description).toContain("Community parser");
      expect(result.stats.timedOut).toBe(false);
      expect(result.stats.peakMemoryBytes).toBeGreaterThan(0);
      expect(result.stats.peakMemoryBytes).toBeLessThanOrEqual(16 * 64 * 1024);
    }
  });

  it("rejects oversized input before spawning a worker", async () => {
    const big = {
      ...SAMPLE_EVENT_INPUT,
      data: "x".repeat(300 * 1024),
    };
    const result = await runner.execute(loadFixture("echo_parser.wasm"), big);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errorType).toBe("INVALID_INPUT");
    }
  });

  it("rejects missing contractId", async () => {
    const result = await runner.execute(loadFixture("echo_parser.wasm"), {
      ...SAMPLE_EVENT_INPUT,
      contractId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errorType).toBe("INVALID_INPUT");
    }
  });
});
