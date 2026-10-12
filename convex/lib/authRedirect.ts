/**
 * Where an OAuth sign-in may land afterwards. The phone apps finish in their own URL scheme,
 * which the system browser sheet hands straight back to the app. Web finishes on numaworth.com,
 * the deployment's SITE_URL, or a Cloudflare Pages preview. Anything else is refused, so a
 * sign-in code is never sent to a page we don't control.
 */

const APP_SCHEMES = ["numa://auth", "numanext://auth"];
const WEB_ORIGINS = new Set(["https://numaworth.com", "https://www.numaworth.com"]);
const PAGES_HOST = /^https:\/\/([a-z0-9-]+\.)?numa-pro\.pages\.dev$/;

function originOf(url: string): string | null {
  try { return new URL(url).origin; } catch { return null; }
}

export function allowedRedirect(redirectTo: string, siteUrl: string): string {
  if (APP_SCHEMES.some((s) => redirectTo === s || redirectTo.startsWith(`${s}?`) || redirectTo.startsWith(`${s}/`))) return redirectTo;
  if (redirectTo.startsWith("?") || (redirectTo.startsWith("/") && !redirectTo.startsWith("//"))) return `${siteUrl}${redirectTo}`;
  const origin = originOf(redirectTo);
  if (!origin) throw new Error(`Invalid redirectTo: ${redirectTo}`);
  if (siteUrl && origin === originOf(siteUrl)) return redirectTo;
  if (WEB_ORIGINS.has(origin) || PAGES_HOST.test(origin)) return redirectTo;
  throw new Error(`Invalid redirectTo: ${redirectTo}`);
}
