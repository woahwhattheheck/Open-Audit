# Example Rust community parser

Reference guest for Open-Audit issue #405.

## Build

```bash
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/open_audit_community_parser.wasm ./parser.wasm
```

Important: use **`wasm32-unknown-unknown`**, not WASI. WASI imports are rejected.

## Manifest

See `manifest.json`. For CI / tests without a Rust toolchain, the repository
ships a precompiled WAT fixture (`fixtures/compiled/echo_parser.wasm`) that
satisfies the same ABI and is what `npm run test:wasm` exercises end-to-end.
