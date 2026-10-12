/**
 * Activates the async font stylesheets declared in index.html.
 *
 * The <link> tags ship with media="print" so they never block first paint;
 * flipping media to "all" here applies them once the app boots. Done in JS
 * (instead of inline onload= handlers) so the Content-Security-Policy can
 * keep script-src at 'self' without 'unsafe-inline'/'unsafe-hashes'.
 */
export function activateFontStylesheets() {
  if (typeof document === "undefined") return;
  const links = document.querySelectorAll<HTMLLinkElement>("link[data-numa-font-css]");
  for (const link of links) {
    link.media = "all";
  }
}
