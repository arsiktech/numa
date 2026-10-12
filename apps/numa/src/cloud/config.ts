/**
 * The Convex deployment this build talks to. Set EXPO_PUBLIC_CONVEX_URL (see .env.example).
 * Without it the app runs on the labelled demo portfolio only.
 */
export const convexUrl: string | null = process.env.EXPO_PUBLIC_CONVEX_URL?.trim() || null;
