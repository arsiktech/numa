/**
 * The Convex deployment this build talks to. Set EXPO_PUBLIC_CONVEX_URL (see .env.example).
 * Without it the app runs on the labelled demo portfolio only.
 */
export const convexUrl: string | null = process.env.EXPO_PUBLIC_CONVEX_URL?.trim() || null;

/**
 * Where the deployment serves HTTP actions, such as the streamed Ask reply. A Convex cloud address maps to its
 * `.convex.site` twin. Any other backend (a local one serves them on a different port) gives null: the app is not
 * told that address, and guessing it sends requests to a host that cannot answer them.
 */
export const siteUrlOf = (url: string | null): string | null => (url?.includes('.convex.cloud') ? url.replace('.convex.cloud', '.convex.site') : null);
export const convexSiteUrl = siteUrlOf(convexUrl);
