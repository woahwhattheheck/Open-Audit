# Community Parser Authoring Guide

Build an untrusted contract parser that runs inside the Open-Audit WASM sandbox
(**issue #405**). Parsers are submitted as files in a PR — there is no upload UI
yet.

## Supported languages

Anything that compiles to a **WASM module** with the ABI below and **no imports
other than `env.memory`**.

Recommended:

- **Rust** → `wasm32-unknown-unknown` (see `examples/rust/`)
- AssemblyScript (with a custom `abort` avoided — do not import host abort;
  panic=abort into a trap instead)
- Hand-written WAT for experiments (`fixtures/wat/`)

**Do not** target `wasm32-wasi` / `wasm32-wasi-preview1`. WASI imports are
rejected by the host.

## Guest ABI (required)

```text
(import "env" "memory" (memory 1))   ;; ONLY allowed import

(export "alloc" (func (param i32) (result i32)))
(export "translate" (func (param i32 i32) (result i32)))  ;; in_ptr, in_len -> out_ptr
(export "get_output_len" (func (result i32)))
(export "dealloc" (func (param i32 i32)))                 ;; optional
```

The memory import may declare a different initial size and an optional maximum,
for example `(memory 2 16)`. The host allocates the declared initial size only
when it fits within its configured page limit. Its growth ceiling is the smaller
of the host limit and the guest's declared maximum, when present. A minimum above
the host limit returns `MEMORY_LIMIT_EXCEEDED` before memory allocation.
Only unshared 32-bit memory is supported; shared memory, memory64, and additional
defined memories are rejected.

### Input JSON (`WasmParserInput`)

```json
{
  "id": "…",
  "contractId": "C…",
  "topics": ["…hex…"],
  "data": "…hex…",
  "ledger": 123456,
  "timestamp": 1710000000,
  "txHash": "…"
}
```

### Output JSON (`WasmParserOutput`)

```json
{
  "description": "Human-readable sentence",
  "eventType": "transfer"
}
```

Both fields are required non-empty strings. Output larger than the host cap
(default 64 KiB) is rejected.

## Manifest (file-based registration)

```json
{
  "id": "example-sac-transfer",
  "contractId": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  "contractName": "Example Community SAC Transfer Parser",
  "wasmPath": "./parser.wasm",
  "version": "1.0.0",
  "author": "your-github-handle",
  "description": "Translates SAC transfer events (demo)."
}
```

Register at process startup (server / worker):

```ts
import { registerCommunityParserFromManifest } from "@/lib/wasm-sandbox";

await registerCommunityParserFromManifest(
  "lib/wasm-sandbox/examples/rust/manifest.json"
);
```

Translated events carry `parserProvenance: "community-wasm"`.

## Resource limits (cannot be raised by the guest)

| Limit | Default |
|-------|---------|
| Memory | 16 MiB (256 × 64 KiB pages) |
| Wall time | 1000 ms |
| Input | 256 KiB |
| Output | 64 KiB |

## Local verify

```bash
# Compile WAT fixtures (dev)
node lib/wasm-sandbox/fixtures/compile-fixtures.mjs

# Full adversarial + integration suite
npm run test:wasm
```

## Security checklist before opening a PR

- [ ] Module imports **only** `env.memory`
- [ ] No WASI, no `fs`, no `http`, no JS glue imports
- [ ] `npm run test:wasm` passes on your machine
- [ ] Manifest points at the committed `.wasm`
- [ ] You understand descriptions are attacker-chosen text and will be labeled
      community-sourced in the product

See `WASM_SANDBOX_ARCHITECTURE.md` for the full threat model.
