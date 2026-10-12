# Browser journeys

Scripted user journeys for the web build, run against a throwaway local Convex
backend. Each journey signs up a fresh `@example.com` identity, seeds data
through the same Convex functions the app uses, and drives the UI with
Playwright. Never point them at a shared or production deployment.

CI runs them in the `e2e` job. To run them locally, from the repository root:

```sh
npm ci && (cd apps/numa && npm ci)
CONVEX_AGENT_MODE=anonymous npx convex dev --typecheck disable --tail-logs disable &   # wait for "Convex functions ready"
node apps/numa/e2e/setup-auth.mjs
(cd apps/numa && EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 npx expo export --platform web && npx -y serve@14.2.4 -s -l 5196 dist &)
node apps/numa/e2e/run.cjs            # or: node apps/numa/e2e/run.cjs flow plan
```

Environment overrides: `E2E_APP_URL` (default `http://localhost:5196`),
`E2E_CONVEX_URL` (default `http://127.0.0.1:3210`) and `E2E_CHROMIUM` (a
Chromium binary). If `HTTPS_PROXY` is set, the browser uses it for outside
hosts. Screenshots and downloads go to `e2e/output/`, which git ignores.

The journeys read live prices from the backend's market cron and the ECB rate
from Frankfurter, so they need internet access.
