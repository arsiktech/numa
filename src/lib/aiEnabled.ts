/**
 * Master switch for Numa's AI surfaces (the "Ask Numa" assistant + the Numa AI
 * page/tab). Build-time flag — the AI gateway key lives server-side, so the
 * client can't probe it; we gate the UI explicitly instead of shipping buttons
 * that error.
 *
 * OFF by default. Turn AI on by setting `VITE_NUMA_AI_ENABLED=1` in the build
 * environment (Vercel project env for prod, `.env.local` for dev) — AND make
 * sure the AI Gateway has credits (`AI_GATEWAY_API_KEY`), or the surfaces will
 * be visible but fail.
 */
export const AI_ENABLED = import.meta.env.VITE_NUMA_AI_ENABLED === "1";
