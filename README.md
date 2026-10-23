# Numa Pro

> This public repository is a snapshot of Numa Pro's private development repository. Commit history, issues, pull requests and internal agent notes are not included, and personal details were replaced with examples (for instance `support@example.com`).

Personal capital: spending, multi-currency cashflow, net worth, goals, holdings,
read-only public wallets, and AI drafts grounded in portfolio data. Numa Shared
is a separate product and release lane; Pro retains its existing shared-pod
compatibility features.

## Current app and verification

The current rebuild app is Expo in [`apps/numa/`](apps/numa/README.md), for iOS,
Android and web. The root `src/` web app and `ios/Numa/` SwiftUI app are legacy
implementations retained until parity. Their setup below is not the Expo setup.

The [finance contract](docs/FINANCE-CONTRACT.md),
[Pulse design system](docs/rebuild/DESIGN.md) and
[rebuild release guide](docs/rebuild/RELEASE.md) define the current contracts.
Root lint, build and unit tests ignore `apps/`. App changes need the checks in
[`apps/numa/README.md`](apps/numa/README.md): typecheck, lint, Jest tests and web
export. [PR CI](.github/workflows/ci.yml) runs those separately and exercises
[rendered app journeys](apps/numa/e2e/README.md) against an isolated local backend.
Native demo journeys are a separate [simulator workflow](.github/workflows/ios-sim.yml).

The legacy web origin is <https://numa-ecru.vercel.app>. The older
[release plan](docs/NUMA-PRO-PUBLIC-RELEASE.md) records its historical lane;
it is not current rebuild deployment evidence.

## Run the legacy web app locally

Use Node `24.x` (see `package.json`) and the locked dependencies:

```bash
npm ci
# First setup only: copy .env.example to .env.local and configure a DEV target.
npm run dev
```

The app opens at `http://127.0.0.1:5173`. It needs
`VITE_NUMA_CLOUD_AUTH=1` and a dev `VITE_CONVEX_URL`; provider callbacks also
use the paired `VITE_CONVEX_SITE_URL`. Keep an existing `.env.local` intact.
Vite supplies limited dev API fixtures; real serverless API work needs the
matching API runtime described in [local workflows](docs/agent-memory/workflows.md#local-setup).

## Legacy stack and root checks

- React 19, Vite 8, TypeScript, Tailwind 4; local SVG charts.
- Convex data and Convex Auth; Vercel functions in `api/`.
- Legacy SwiftUI client in `ios/Numa/`, bundle `com.arsiktech.numa`.

```bash
npm test            # Vitest
npm run lint        # ESLint
npm run build       # TypeScript + Vite
npm run test:ui     # Playwright; authenticated journeys are opt-in
npm run verify      # lint, build, bundle budget, unit/browser tests, release audit
```

See [workflows](docs/agent-memory/workflows.md) for focused checks, disposable
dev QA, and the distinction between local and live validation.

## Change the experience

Start with [the experience map](docs/agent-memory/experience.md) for the holding
form, wealth snapshots and native Today. It links the UI, write boundaries,
tests and important failure states so a new developer or agent can follow one
change end to end.

```bash
node scripts/preview-experience.mjs
# http://127.0.0.1:5174 — real components with fictional data and local save stubs
```

The preview has no cloud client. It exercises pending, failed and queued saves;
it does not prove authentication, persistence or production behavior.

## Project documentation

- [Architecture](docs/agent-memory/architecture.md) and
  [conventions](docs/agent-memory/conventions.md): runtime map and domain patterns.
- [DECISIONS.md](DECISIONS.md) and [ERRORS.md](ERRORS.md): search the relevant
  entries when a task touches a product constraint or known failure.
- [Release plan](docs/NUMA-PRO-PUBLIC-RELEASE.md),
  [deployment](DEPLOYMENT.md), and [native setup](ios/Numa/README.md).
- [Historical code wiki](docs/wiki/README.md) and [backlog](ROADMAP.md): consult when useful; reconcile against current source.
