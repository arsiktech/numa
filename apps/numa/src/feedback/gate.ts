import { feedbackCaptureAllowed, type FeedbackCaptureConfig, type FeedbackEndpoint, type FeedbackMood } from './feedback-client';

/** Empty when any public variable is missing, so the button stays off unless the build opts in. */
export function feedbackEndpointFrom(env: { url?: string; app?: string; key?: string }): FeedbackEndpoint | null {
  const url = env.url?.trim() ?? '';
  const app = env.app?.trim() ?? '';
  const key = env.key?.trim() ?? '';
  if (!url || !app || !key) return null;
  return { url, app, key };
}

export function feedbackEndpoint(): FeedbackEndpoint | null {
  return feedbackEndpointFrom({
    url: process.env.EXPO_PUBLIC_FEEDBACK_URL,
    app: process.env.EXPO_PUBLIC_FEEDBACK_APP,
    key: process.env.EXPO_PUBLIC_FEEDBACK_KEY,
  });
}

/** Web only, and only after the service says this app may send notes. */
export function feedbackButtonVisible(input: { platform: string; endpoint: FeedbackEndpoint | null; enabled: boolean }): boolean {
  return input.platform === 'web' && input.endpoint !== null && input.enabled;
}

/**
 * A screenshot is taken only when the service's capture list includes the path.
 * This app adds no path of its own: an empty list means notes only, and a prefix
 * that covers every path includes every screen.
 */
export function shouldCaptureScreenshot(config: FeedbackCaptureConfig, pathname: string): boolean {
  return config.screenshots === true && feedbackCaptureAllowed(config.capture, pathname);
}

export type FeedbackRole = 'member' | 'guest';

/** Locale, theme and role only. No account id, email or name. */
export function feedbackFacts(input: { locale?: string; theme: string; role: FeedbackRole }): Record<string, string> {
  const context: Record<string, string> = { theme: input.theme, role: input.role };
  if (input.locale) context.locale = input.locale;
  return context;
}

export function feedbackLocale(language: string | undefined): string | undefined {
  const match = /^([a-z]{2})(?:-([A-Za-z]{2}))?$/i.exec(language ?? '');
  if (!match) return undefined;
  return match[2] ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : match[1].toLowerCase();
}

export type FeedbackDraft = {
  note: string;
  path: string;
  locale?: string;
  mood?: FeedbackMood;
  context: Record<string, string>;
};
