export type FeedbackKind = "idea" | "bug" | "ux" | "other";

export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  text: string;
  impact?: string;
  page: string;
  accountEmail?: string | null;
  userAgent: string;
  createdAt: number;
}

const KEY = "numa:feedback:v1";

export function readFeedbackItems(): FeedbackItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FeedbackItem[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.text) : [];
  } catch {
    return [];
  }
}

export function saveFeedbackItem(item: FeedbackItem) {
  if (typeof window === "undefined") return;
  const next = [item, ...readFeedbackItems()].slice(0, 100);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function formatFeedbackBacklog(items: FeedbackItem[]) {
  if (items.length === 0) return "No saved Numa Pro feedback yet.";
  return items
    .map((item, index) => {
      const date = new Date(item.createdAt).toISOString();
      const impact = item.impact ? `\nImpact: ${item.impact}` : "";
      return `${index + 1}. [${item.kind}] ${item.text}${impact}\nPage: ${item.page}\nCreated: ${date}`;
    })
    .join("\n\n");
}
