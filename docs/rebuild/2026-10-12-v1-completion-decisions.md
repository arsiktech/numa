# Numa rebuild: decisions to finish v1 (2026-10-12)

The owner made these decisions one at a time to close the gap between the mockup and the build.

| Area | Decision | Needs from the owner |
|---|---|---|
| AI chat in the plus | Ask uses Claude (Opus 5.5 by default; `NUMA_ASK_MODEL` can name another model) through a Convex action, with server-side fallbacks if the model is overloaded. It answers from a summary of the person's own numbers and only drafts changes; the person still presses Save. It is rate-limited per account. | `ANTHROPIC_API_KEY` on both Convex deployments (paid per use). |
| Crypto wallets | Track public addresses through free public APIs: mempool.space for Bitcoin, Blockscout for Ethereum and other EVM chains. No key and no cost. | Nothing. |
| Push alerts | Needs you items arrive as notifications, at most 3 a day, none between 22:00 and 8:00 local time. Delivery uses Expo push. | One Apple sign-in on the next iOS build, so EAS can create the push key. |
| Email | "Forgot password" sends a reset code. Sign-up stays instant, with no confirmation code. | `AUTH_RESEND_KEY` on both Convex deployments (it already exists for the old app; to be confirmed). |
| Home-screen widget | Small and medium widgets show net worth, today's change and a small line. They show dots when Hide amounts is on. | Nothing. |
| Phone builds | I start EAS builds. The TestFlight upload still runs from the owner's Mac. | `EXPO_TOKEN` in the Claude environment settings, and as a GitHub secret for CI builds. |
| Backend ownership | `arsiktech/numa` owns `convex/`. The private numa-pro repo's Vercel build must stop deploying Convex, or it would overwrite new functions. | Remove `CONVEX_DEPLOY_KEY` from the numa-pro Vercel project. |
| Backend deploys | Every merge to `main` deploys Convex to DEV and then to production, automatically. | GitHub secrets `CONVEX_DEPLOY_KEY_DEV` and `CONVEX_DEPLOY_KEY_PROD` on arsiktech/numa. |

## Safety rules that still apply

- **Schema changes stay additive:** new optional fields, new tables and new indexes. Removing or narrowing a field needs a migration plan and its own go-ahead, because production deploys are automatic.
- **Production deploys only after the same commit has deployed to DEV and passed CI.**
- **AI never writes on its own.** It proposes a draft, the person confirms, and the write is audited. Calls are authenticated and rate-limited before the provider is called.
- **Wallets accept public addresses only.**
