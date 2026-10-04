# Example Rust community parser

Reference guest for Open-Audit issue #405.

## Build

From the repository root:

```bash
bash lib/wasm-sandbox/examples/rust/build.sh
```

The script changes to this example's directory before running Cargo. Its local
`.cargo/config.toml` passes `--import-memory` to the linker so the compiled
`parser.wasm` uses the host's `env.memory`. Without this flag, Rust defines its
own memory and the sandbox rejects the module. The host still enforces its
configured memory maximum.

For a manual build, run these commands from this directory so Cargo discovers
the local configuration:

```bash
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/open_audit_community_parser.wasm ./parser.wasm
```

Use **`wasm32-unknown-unknown`**. WASI imports are rejected. A Cargo invocation
from another directory using only `--manifest-path` does not discover this
example's configuration; use the build script or change directory first.

## Manifest

See `manifest.json`. For CI / tests without a Rust toolchain, the repository
ships a precompiled WAT fixture (`fixtures/compiled/echo_parser.wasm`) that
satisfies the same ABI and is what `npm run test:wasm` exercises end-to-end.
