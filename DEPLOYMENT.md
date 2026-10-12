# Deployment

Production: **<https://numa-ecru.vercel.app>**
GitHub: <https://github.com/arsiktech/numa>
Active branch: `numa-v2`

> For architecture + conventions, see [the runtime map](docs/agent-memory/architecture.md). This file
> covers only how the deploy pipeline is wired.

---

## Vercel

The frontend + edge functions deploy to Vercel.

**Project:** `arseny-s-projects/numa`
**Production domain:** `numa-ecru.vercel.app`
**Build settings (set in Vercel project → Settings → Build & Development):**

| | Value |
|---|---|
| Build command | `npm run build:vercel` |
| Output directory | `dist` |
| Ignored build step | `node scripts/vercel-ignore-build.mjs` |
| Framework preset | Vite |
| Node version | 24.x (matches `engines.node` in package.json and CI) |

Before runtime-sensitive dependency or release work, confirm the Vercel project
setting still uses Node 24.x in the dashboard.

`scripts/vercel-build.mjs` is the smart entrypoint:
- If `CONVEX_DEPLOY_KEY` is in the build env → runs
  `npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL`,
  which deploys Convex functions AND injects the prod Convex URL into the
  Vite build.
- If no key and `VERCEL_ENV=preview` → runs a Preview build against the DEV
  Convex deployment (`rosy-mink-170`) with `VITE_NUMA_CLOUD_AUTH=1`, so branch
  previews are usable without production deploy privileges.
- If no key outside Vercel Preview → falls back to plain `npm run build`.
  Useful for docs-only/local checks.

After any Vercel Preview or Production build, the wrapper runs
`scripts/assert-build-cloud-config.mjs`. The build fails if the generated
bundle lacks a Convex cloud URL, which prevents a `READY` deployment that only
shows the "Cloud auth required" screen.

### Branch policy

- Pushing to `numa-v2` creates a **Preview** deployment automatically.
- Feature-branch previews also deploy when Vercel's Git settings allow them.
  They must be opened and smoke-tested after `READY`; status alone is not a
  product check.
- **Production does NOT auto-update** when you push. To ship to prod, manually
  promote a Preview:

```bash
npx vercel ls                                                       # find latest Preview URL
npx vercel promote https://numa-XXXXX-arseny-s-projects.vercel.app --yes
```

### Vercel env vars (Production environment)

| Name | Notes |
|---|---|
| `CONVEX_DEPLOY_KEY` | Prod Convex Deploy Key — set this. Without it, the build can't deploy Convex or get the prod `VITE_CONVEX_URL`. |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key — required for `/api/chat`. |
| `FINNHUB_API_KEY` | Free Finnhub key for US stock/ETF prices on the web (`/api/market-quotes`). Also set it on the production Convex deployment for the iOS quote refresh cron. Without it, stocks show as unpriced; crypto still uses CoinGecko. |
| `MORALIS_API_KEY` | Server-only Moralis Data API key for read-only public wallet balances and DeFi positions. Required for fresh crypto-wallet sync. |
| `NUMA_CRYPTO_DAILY_TOKEN_LIMIT` | Optional daily ceiling for token-balance wallet refreshes. Defaults to `60`. |
| `NUMA_CRYPTO_DAILY_USER_TOKEN_LIMIT` | Optional per-user rolling-24h token refresh ceiling. Defaults to `12` wallets, preventing one editor from exhausting the deployment budget. |
| `NUMA_CRYPTO_DEFI_ENABLED` | Set to `1` only on a Moralis plan that includes DeFi. Unset/`0` keeps token tracking on and DeFi calls off. |
| `NUMA_CRYPTO_DAILY_WALLET_LIMIT` | Optional daily ceiling for expensive DeFi wallet refreshes. Defaults to `12`; set from the provider plan budget. |
| `NUMA_CRYPTO_DAILY_USER_DEFI_LIMIT` | Optional per-user rolling-24h DeFi refresh ceiling. Defaults to `4` wallets. |
| `NUMA_PUSH_VAPID_PUBLIC` / `_PRIVATE` / `_SUBJECT` | Server-side VAPID push keys for `/api/push-send`. |
| `VITE_NUMA_PUSH_VAPID_PUBLIC` | The PUBLIC half, exposed to the browser bundle. |
| `NUMA_PUSH_INTERNAL_SECRET` | Bearer for cron-style internal pushes and server-only crypto snapshot reads/writes. The same value must exist in Vercel and the target Convex deployment. |
| `VITE_NUMA_CLOUD_AUTH` | Set to `1` to enable Convex Auth flows on this build. |

Set with `npx vercel env add <NAME> production` from a logged-in CLI session.

---

## Convex

**Two deployments — keep them straight:**

| | URL | Connected via |
|---|---|---|
| DEV `rosy-mink-170` | `https://rosy-mink-170.eu-west-1.convex.cloud` | `CONVEX_DEPLOYMENT=dev:rosy-mink-170` in `.env.local`. `npm run dev` writes here. |
| PROD `fine-quail-653` | `https://fine-quail-653.convex.cloud` | `CONVEX_DEPLOY_KEY` env var on Vercel. Production frontend writes here. |

### Convex env vars

Each deployment has its own env vars. Set with:

```bash
npx convex env set NAME 'value'              # → DEV
npx convex env --prod set NAME 'value'       # → PROD
npx convex env list                          # → DEV
npx convex env --prod list                   # → PROD
```

Required on each deployment:

| Name | Purpose |
|---|---|
| `SITE_URL` | Convex Auth's redirect target after OAuth callback. **Must differ per deployment**: `http://localhost:5173` on dev, `https://numa-ecru.vercel.app` on prod. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client (Cloud Console). If absent, the Google button is hidden. |
| `JWKS` / `JWT_PRIVATE_KEY` | Auto-generated by Convex Auth. Don't hand-edit. |

Optional:

| Name | Purpose |
|---|---|
| `AUTH_APPLE_ID` / `AUTH_APPLE_SECRET` | Apple Sign-in. `AUTH_APPLE_ID` is the Services ID; `AUTH_APPLE_SECRET` is the client secret JWT. If absent, the Apple button is hidden. |
| `AUTH_APPLE_TEAM_ID` / `AUTH_APPLE_KEY_ID` | Optional bookkeeping/helper inputs for generating the Apple client secret. They are not required by the runtime provider once `AUTH_APPLE_SECRET` is set. |

### Setting up Google OAuth

1. In Google Cloud Console → APIs & Services → Credentials, create an OAuth 2.0 Client ID (Web application).
2. Authorized JavaScript origins:
   - `http://localhost:5173`
   - `https://numa-ecru.vercel.app`
3. Authorized redirect URIs:
   - `https://rosy-mink-170.eu-west-1.convex.site/api/auth/callback/google` (dev)
   - `https://fine-quail-653.convex.site/api/auth/callback/google` (prod)
   - In general, Convex Auth sends Google
     `(CUSTOM_AUTH_SITE_URL ?? CONVEX_SITE_URL)/api/auth/callback/google`.
     Native iOS still uses this Convex callback first; `numa://auth` is only
     the final app hop after Convex completes OAuth, so do not add
     `numa://auth` as a Google redirect URI.
4. Copy the client ID + secret into both Convex deployments:
   ```bash
   npx convex env set      AUTH_GOOGLE_ID '<id>' && npx convex env set      AUTH_GOOGLE_SECRET '<secret>'
   npx convex env --prod set AUTH_GOOGLE_ID '<id>' && npx convex env --prod set AUTH_GOOGLE_SECRET '<secret>'
   ```

To diagnose `Error 400: redirect_uri_mismatch`, generate the current dev
sign-in URL and inspect the first redirect:

```bash
npx convex run auth:signIn '{"provider":"google","params":{"redirectTo":"numa://auth"}}'
curl -I '<redirect URL returned above>'
```

The `Location:` header should point at Google and contain the exact
`redirect_uri` that must be present in the OAuth client.

### Setting up Apple Sign-in

1. In Apple Developer → Certificates, Identifiers & Profiles, create a
   Services ID for web Sign in with Apple. Use that Services ID as
   `AUTH_APPLE_ID`.
2. Add the Convex Auth callback URLs as Return URLs:
   - `https://rosy-mink-170.eu-west-1.convex.site/api/auth/callback/apple` (dev)
   - `https://fine-quail-653.convex.site/api/auth/callback/apple` (prod)
3. Generate an Apple client secret JWT for the Services ID using the Apple
   Team ID, Key ID, and `.p8` private key. Store the generated JWT as
   `AUTH_APPLE_SECRET` on the target Convex deployment. Do not commit the
   `.p8` key or the JWT.
4. Native iOS also starts at the Convex callback above and only returns to
   `numa://auth` after Convex completes the provider callback, so do not add
   `numa://auth` to Apple Return URLs.

### Manual Convex deploy

Vercel auto-deploys Convex on build (when `CONVEX_DEPLOY_KEY` is set). To
push from local:

```bash
npx convex deploy             # uses CONVEX_DEPLOYMENT from .env.local — usually DEV
```

For prod:

```bash
npx vercel env pull .env.vercel-prod --environment production
set -a; source .env.vercel-prod; unset CONVEX_DEPLOYMENT; set +a
npx convex deploy             # now uses CONVEX_DEPLOY_KEY → prod
rm -f .env.vercel-prod
```

---

## Smoke tests

Post-deploy verification:

```bash
npm run verify:production              # app shell + /api/market-quotes
npm run verify:production:convex       # the above + check bundle contains a Convex cloud URL
```

The same smoke can run from GitHub Actions: `.github/workflows/production-smoke.yml`
has a manual `workflow_dispatch` trigger.

---

## CI

`.github/workflows/ci.yml` runs on push + pull-request:

- `npm run lint`
- `npm run build`
- `npm test`
- `npm run test:ui` (Playwright)
- `npm audit --audit-level=moderate`

Node 24 (matches `package.json`; confirm the Vercel runtime setting before
runtime-sensitive release work).
