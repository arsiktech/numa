# Development workflows

Use the current scripts in [package.json](../../package.json). Verification
scope and authorization live in the [README](../../README.md).

## Local setup

Use the declared Node `24.x` runtime and `npm ci`. On first setup, copy
`.env.example` to `.env.local` and configure the dev Convex target; preserve an
existing env file. `npm run dev` serves `http://127.0.0.1:5173`.

Required public configuration: `VITE_NUMA_CLOUD_AUTH=1`,
`VITE_CONVEX_URL`, and the paired `VITE_CONVEX_SITE_URL`.
`vite.config.ts` supplies limited dev API fixtures. For real serverless API
work, the existing local recipe is:

```bash
npx vercel dev --listen 3000
```

Keep its `.env.local` paired with the same dev Convex deployment. See
[native local setup](../../ios/Numa/README.md#local-setup) for the documented
API target pairing. A Vite fixture response is not provider evidence.

## Checks

| Change | Useful checks |
| --- | --- |
| Documentation only | Verify changed paths/commands; `git diff --check` |
| Pure logic | `npm test -- path/to/file.test.ts` |
| Web/TypeScript application code | `npm run lint`, `npm run build`, relevant tests |
| Convex schema or exported API | `npx convex codegen`, Convex type check, relevant tests |
| Web UI behavior | Relevant Playwright flow plus rendered inspection |
| Swift/native-only change | Relevant native build/tests and rendered journey; reuse the checked artifact |
| Legacy web release readiness, affected shared-runtime boundaries, or unresolved integration risk | `npm run verify`; Expo has [separate checks](../../apps/numa/README.md) |
| Loading/performance | Affected route's cold/warm timing and runtime errors |

`npm run verify` runs lint, build, initial JS budget, Vitest, Playwright, and
`audit:release`. It does not deploy. The budget is defined in
`scripts/check-bundle-size.mjs`. `npm run audit:all` is a separate dependency
maintenance check. When the full gate applies, use it instead of separately
repeating its component checks. Native-only changes do not require the web gate
unless they affect a shared-runtime boundary or release contract. Do not repeat
successful gates without a new change or concern.

`npm run build` uses the TypeScript compiler selected in `package.json`.
For Convex type validation, use
`node node_modules/typescript7/bin/tsc -p convex/tsconfig.json --noEmit`.
Root `tsc --noEmit` alone does not check the referenced app project.

## Browser and authenticated QA

`npm run test:ui` runs desktop Chromium and mobile WebKit. Playwright starts
Vite for local base URLs and can reuse an existing server; confirm that server
belongs to the intended checkout. Select a file or title for focused runs:

```bash
npm run test:ui -- tests/asset-recovery.spec.ts --workers=1
```

Public smoke runs by default. Authenticated journeys skip without dedicated
`NUMA_E2E_EMAIL` / `NUMA_E2E_PASSWORD` credentials or the explicit disposable
account option. To exercise auth on a verified DEV target:

```bash
NUMA_E2E_CREATE_QA_ACCOUNT=1 npm run test:ui:auth -- --workers=1
```

The broader dev gate is `NUMA_E2E_CREATE_QA_ACCOUNT=1 npm run verify`.
Report actual passes and skips; do not infer authenticated coverage from a
green default run. Use dedicated QA identities, never a human account.

## Deployment and live checks

[DEPLOYMENT.md](../../DEPLOYMENT.md) owns deployment steps and env pairing;
[the release plan](../NUMA-PRO-PUBLIC-RELEASE.md) owns release gates.
`build:vercel` can deploy Convex when `CONVEX_DEPLOY_KEY` is present, so it is
not a substitute for a local build. The `verify:production*` and `verify:live*`
scripts inspect live targets; they do not authorize deployments or data writes.
