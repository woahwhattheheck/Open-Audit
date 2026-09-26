# WASM Sandbox Architecture & Threat Model

**Issue:** [#405 — Build the WASM sandbox for community-contributed parsers](https://github.com/Open-audit-foundation/Open-Audit/issues/405)

This document is a **deliverable**, not an afterthought. It defines what a
malicious community parser can attempt, and how each attempt is mitigated and
tested.

## 1. Goal

Allow community-authored contract parsers to run **alongside** reviewed native
TypeScript blueprints, without granting those parsers any ability to:

- execute host code (RCE),
- read host files / env / secrets,
- open network connections,
- exhaust host memory or CPU unboundedly,
- crash the Node.js process,
- return attacker-controlled output that bypasses host validation.

## 2. Runtime choice

| Choice | Rationale |
|--------|-----------|
| **Node.js built-in `WebAssembly`** | No third-party native addon; available everywhere we already run. |
| **`worker_threads` Worker** | Guest compilation and execution happen inside a killable worker. Wall-clock timeout → `worker.terminate()`; the caller does not compile untrusted bytes on the main thread. |
| **Host-provided `env.memory`** | Worker requires exactly one memory import and rejects any defined memory section, including unexported private memory. Host sets `Memory({ maximum })`. |
| **No WASI** | WASI is ambient capability (fd, path, clock, random, …). Forbidden. |

We deliberately do **not** use Wasmtime/Wasmer Node bindings in this revision:
the built-in engine plus a killable worker meets the acceptance bar with a
smaller supply-chain and ops footprint. A future issue may swap the engine if
fuel metering is required without workers.

## 3. Host ↔ guest ABI

Guest **must**:

1. `import "env" "memory" (memory 1)` — only allowed import.
2. Export `alloc(size) -> ptr`.
3. Export `translate(in_ptr, in_len) -> out_ptr`.
4. Export `get_output_len() -> len`.
5. Optionally export `dealloc(ptr, size)`.

Input / output are UTF-8 JSON in linear memory:

```jsonc
// input (WasmParserInput)
{ "id", "contractId", "topics", "data", "ledger", "timestamp", "txHash" }

// output (WasmParserOutput / TranslationResult)
{ "description": "...", "eventType": "..." }
```

Anything else (missing fields, non-JSON, oversized) is rejected by the host.

## 4. Threat model

| # | Attacker goal | Mitigation | Test |
|---|---------------|------------|------|
| T1 | **RCE / call Node APIs** (`fs`, `net`, `child_process`, `eval`) | Guest has **no** JS function imports. Worker validates the exact `env.memory` import before instantiation. | `fs_attempt.wasm` → `FORBIDDEN_IMPORTS` |
| T2 | **WASI ambient caps** (fs, sockets, env) | Any import other than `env.memory` rejected. | `wasi_attempt.wasm` → `FORBIDDEN_IMPORTS` |
| T3 | **Infinite loop / CPU exhaustion** | Worker wall-clock timeout; `worker.terminate()`. | `infinite_loop.wasm` → `TIMEOUT_EXCEEDED`; host process stays alive |
| T4 | **Memory exhaustion** | Host `Memory({ maximum: maxMemoryPages })`; worker also rejects a hidden guest-defined memory section. | `memory_bomb.wasm` and a valid dual-memory module → rejected/contained |
| T5 | **Out-of-bounds memory access** | WASM traps on OOB; worker catches and reports `RUNTIME_TRAP`. | `oob_read.wasm` |
| T6 | **Malformed / weaponized output** | Host JSON-parses and schema-checks `description` + `eventType`; size cap. | `malformed_output.wasm`, `oversized_output.wasm` → `INVALID_OUTPUT` |
| T7 | **Exfiltrate host data via imports** | No host functions that read host state are imported. Linear memory is guest-only scratch. | Capability tests assert import allow-list size === 1 |
| T8 | **Crash the host process** | Compilation and execution happen in a Worker, with an 8 MiB module-size cap before worker spawn; traps/panics return typed errors. | Adversarial cases assert errors do not escape into the caller |
| T9 | **Confused deputy via sync API** | Sync `translate()` on community blueprints returns `null`; only `translateEventAsync` / `translateWithCache` run WASM. | Registry integration test |
| T10 | **UI confusion (native vs community)** | `TranslatedEvent.parserProvenance = "community-wasm"` when sandboxed. | Registry integration test |

## 5. Limits (host-enforced defaults)

| Resource | Default | Config |
|----------|---------|--------|
| Module bytes | 8 MiB | Fixed pre-worker cap |\n| Memory | 256 pages (16 MiB) | `SandboxLimits.maxMemoryPages` |
| CPU / wall time | 1000 ms | `SandboxLimits.maxExecutionTimeMs` |
| Input JSON | 256 KiB | `SandboxLimits.maxInputBytes` |
| Output JSON | 64 KiB | `SandboxLimits.maxOutputBytes` |

Guests cannot raise these limits.

## 6. Registry integration

1. Author ships `manifest.json` + `.wasm` in a PR under
   `lib/wasm-sandbox/community/` (or examples).
2. `registerCommunityParserFromManifest` / `FromBytes` installs a
   `TranslationBlueprint` with `parserProvenance: "community-wasm"`.
3. `translateEventAsync` detects community blueprints and runs
   `WasmSandboxRunner`.
4. UI / API consumers should treat `parserProvenance === "community-wasm"` as
   **sandboxed / community-sourced** (vs reviewed native TypeScript).

## 7. Residual risks / honesty

- **Worker spawn cost:** each execution currently starts a Worker. Acceptable
  for untrusted parsers; pool reuse is a follow-up.
- **No instruction fuel:** timeout is wall-clock, not deterministic fuel. A
  busy host may time out a legitimately slow parser; tune `maxExecutionTimeMs`.
- **Output is still attacker-chosen text:** sanitization (`sanitizeTextField`)
  applies, but social-engineering via description text remains possible — same
  as any translator. Do not treat community descriptions as trusted copy.
- **Submission UI:** out of scope for #405 (file-based PR registration only).

## 8. Code map

| Path | Role |
|------|------|
| `runner.ts` | `WasmSandboxRunner` |
| `worker.cjs` | Isolated executor |
| `validate-module.ts` | Import/export policy |
| `community-registry.ts` | Registry bridge |
| `fixtures/` | Adversarial + happy-path WASM |
| `__tests__/` | Acceptance suite (`npm run test:wasm`) |
