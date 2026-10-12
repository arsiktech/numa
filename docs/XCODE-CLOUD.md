# Xcode Cloud — Numa iOS

Status: **not enabled.** Assessed 2026-07-15. Numa is the **only** first-party iOS repo that Xcode Cloud can attach to today, because it is the only one with a hosted git remote (`github.com/arsiktech/numa`).

## Why this repo qualifies

Apple requires a remote Git repository reachable over HTTPS:443 — GitHub, GitHub Enterprise, GitLab, GitLab self-managed, Bitbucket Cloud, or Bitbucket Server. **A local-only repo cannot use Xcode Cloud at all.** Numa has GitHub; the sibling iOS repos (`Numa Shared`, `Dilo Spanish Bot`) do not, and are ineligible until hosted.

Xcode Cloud is included with the paid Apple Developer Program at **25 compute hours/month** (no rollover). A compute hour bills **per action**, not per wall-clock — Apple's own example: 5 tests × 12 min = 1 hour.

Already satisfied here:

- `DEVELOPMENT_TEAM` is correct and `CODE_SIGN_STYLE` is `Automatic` — Xcode Cloud **requires** automatic signing and has no manual-certificate path.
- `ios/Numa/Numa.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` is committed. This is mandatory: Xcode Cloud performs **no automatic SPM resolution by design**, and Apple warns that forcing it from a build script "may result in undefined behavior and failing builds."

## Shared scheme: locally resolved, not yet release-ready

As of 2026-07-26,
`ios/Numa/Numa.xcodeproj/xcshareddata/xcschemes/Numa.xcscheme` exists and
includes an Archive action. It is still untracked in the current release
candidate, so Xcode Cloud and a clean checkout cannot rely on it yet. Review
and commit that file with the intended candidate.

The local scheme was created with the equivalent Xcode steps:

1. Product → Scheme → Manage Schemes… → tick **Shared** next to `Numa`.
2. Confirm the scheme's **Archive** action is enabled — Apple requires it for the product to be offered during onboarding.
3. Commit the new `ios/Numa/Numa.xcodeproj/xcshareddata/xcschemes/Numa.xcscheme`.

Verify what Xcode Cloud will be able to see:

```sh
xcodebuild -project ios/Numa/Numa.xcodeproj -describeAllArchivableProducts -json
```

## Repo-shape caveat — path-restrict the start conditions

The iOS app is a **secondary surface** here: this repo is primarily a Vite + Convex + Vercel web app, and only ~52 tracked files live under `ios/`. A default "build on every push" workflow would burn compute hours on web-only commits.

When configuring start conditions, add a **Files and Folders** condition scoped to `ios/` so only iOS-relevant changes trigger builds. Notes on that mechanism: folder matching is recursive; **filename wildcards are not supported**; and a single start condition's custom conditions can either *start* or *skip* builds, not both. `[ci skip]` in a commit title/message also skips. **Auto-cancel is on by default** per start condition.

Also decide the branch deliberately — the existing GitHub Actions workflows target `main` / `numa-v2` / `codex/**`, and `HEAD` has recently sat on feature branches.

## Relationship to the existing CI

The three workflows in `.github/workflows/` (`ci.yml`, `nightly-auth-e2e.yml`, `production-smoke.yml`) all run on `ubuntu-latest` and cover the **web** app only. There is no iOS CI at all today. Xcode Cloud would be additive, not a replacement — GitHub Actions cannot build this iOS target.

## `ci_scripts/`, if ever needed

None exists, and none is needed for a plain build/test workflow. If added: the directory must sit **beside the `.xcodeproj`** (i.e. `ios/Numa/ci_scripts/`), only `ci_post_clone.sh` / `ci_pre_xcodebuild.sh` / `ci_post_xcodebuild.sh` are recognized, the default shell is `zsh`, a shebang is honoured **only if the file is `chmod +x`**, and `sudo` is unavailable.

## What only Arseny can do

Onboarding is account-level and human-only — no agent should attempt it:

- Connect the GitHub provider to Xcode Cloud (installs Apple's GitHub app; needs org owner/admin).
- Create/confirm the App Store Connect app record for `com.arsiktech.numa`.
- Accept Apple's terms; manage the compute-hour subscription (**Account Holder only**).
- Initial workflow configuration must be done **in Xcode**; afterwards workflows are manageable from Xcode or App Store Connect.

## Facts worth not re-deriving

- Toolchain is pinned **per workflow** (Xcode + macOS version: `Latest Release`, `Latest Beta`, or a specific release) and is **decoupled from the local Mac**. Apple retires pinned versions over time; the offered list is not published — query `GET /v1/ciXcodeVersions` via the App Store Connect API.
- Build numbers are **auto-assigned and auto-incremented from 1**; `CI_BUILD_NUMBER` is read-only. No bump script needed.
- Artifacts and logs are retained **30 days only**.
- A **120-minute per-build timeout** is real (it appears in Apple's error text) but is **not** in Apple's documentation. Quota-exceeded behaviour and concurrency ceilings are **not documented** — do not assume them.

Full cross-project analysis: vault `outputs/2026-07-15-xcode-cloud-ios-ci-adoption-card.md`.
