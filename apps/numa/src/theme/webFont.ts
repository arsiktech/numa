/** Keep text readable in a matching system face while a web font is still downloading. */
export function webFont(family?: string): string {
  const fallback = family?.startsWith('JetBrainsMono')
    ? 'ui-monospace, SFMono-Regular, Consolas, monospace'
    : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return family ? `${family}, ${fallback}` : fallback;
}
