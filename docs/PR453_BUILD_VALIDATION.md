# PR453 application-build validation

## Executed source and result

On October 4, 2026, the isolated public-fork [validation run 37187574382](https://github.com/woahwhattheheck/Open-Audit/actions/runs/37187574382) completed successfully. Its only job, `app-build` (111392685312), ran from 08:07:49 UTC to 08:08:46 UTC.

The workflow explicitly checked out product commit `ee29bc22f4d6da85067649e64419827f18d421fb`, tree `5cf1bd5c2e6fbc27e8dcc5a48000bf90eaab7d87`. The separate workflow commit was `7e8d4f3587f5a875df57b8a3a93dcfc8a66b784b`; that validation-only workflow is not part of the sponsor PR.

Runtime: Ubuntu 24.04.5, Node v24.21.0, npm 11.19.0. The job used `CI=true`, `NEXT_TELEMETRY_DISABLED=1`, and `NODE_OPTIONS=--max-old-space-size=4096`. It did not supply provider credentials or disable TypeScript checking.

| Command | Observed result |
| --- | --- |
| `npm ci --no-audit --no-fund` | Exit 0; locked install and Prisma Client generation completed. |
| `npm test -- lib/auth/__tests__/rateLimit.test.ts --pool=forks --maxWorkers=2 --minWorkers=1` | Exit 0; 12 passed, 3 skipped, one test file passed. |
| `npm run build` | Exit 0; Next.js 16.2.10 production compilation, TypeScript checking, and all 22 static-page generation steps completed. |

The focused test log also contains the module-load in-memory-fallback warning. The three skipped cases require the optional real-Redis service; this run did not provision that service. The separate real-Redis validation documented in `ATOMIC_REDIS_ADMISSION.md` remains a separate result, not an additional result of this job.

## Subsequent PR head

The sponsor PR later advanced to `4f7453762b97d7e29b286f42bb202073a66d7224`. A GitHub comparison against the tested commit reports one subsequent commit and exactly two changed paths:

- `docs/ATOMIC_REDIS_ADMISSION.md`: 14 additions, 2 deletions.
- `scripts/bench-rate-limit.cjs`: a new 173-line standalone reproduction runner.

Application code, the limiter tests, package manifests, lockfile, and build configuration are unchanged in that comparison. This establishes unchanged application inputs; it is not a claim that the full build was rerun at the newer commit. The validation remains pinned to `ee29bc22f4d6da85067649e64419827f18d421fb`.

## Evidence

The run retained four files: `source.txt`, `install.log`, `focused.log`, and `build.log`.

[Artifact 11297272524: oa453-ee29bc22-build-evidence](https://github.com/woahwhattheheck/Open-Audit/actions/runs/37187574382/artifacts/11297272524)

Artifact ZIP SHA256: `16f27776e27021bcc5bb02fd623590498ef53783c4740fd80734e233da250a77`. Retention is seven days from the run; the public job log and this receipt retain the identifying result.

Package SHA256 values recorded by the job:

- `package.json`: `63805ffb54c243711b4e8b48bb8443bdc397acb81e286fc58a8cd5dfdcb044b6`
- `package-lock.json`: `5ef5add3d2e28100fb8cddbea2ae6802d438731f9fcb3a6ed94b0de1e82046be`

## Remaining warnings and limits

The successful build still emits the middleware-to-proxy deprecation warning and a Turbopack file-tracing warning through `next.config.mjs` and the historical-ingestion route. Dependency and action-runtime deprecation warnings also remain. The build is successful, not warning-free.

This run provides the application-build evidence required by issue #418. It does not establish deployment behavior, a live database or Redis integration, the complete repository test suite, sponsor acceptance, or an award/payment. The existing PR and contribution remain the sole submission; no replacement PR or bounty claim was created.
