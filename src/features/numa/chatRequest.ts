import { AI_MESSAGE_CONTENT_LIMIT } from "@/lib/aiRequestLimits";

export const CHAT_REQUEST_MESSAGE_LIMIT = 40;
export const CHAT_REQUEST_CONTENT_LIMIT = AI_MESSAGE_CONTENT_LIMIT;

export function sanitizeChatMessages<T extends { content: string }>(
  messages: ReadonlyArray<T>
): T[] {
  return messages.filter(
    (message): message is T =>
      Boolean(message) &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
  );
}

export function boundedChatMessages(
  messages: ReadonlyArray<{
    role: "user" | "assistant" | "system";
    content: string;
  }>
) {
  return sanitizeChatMessages(messages)
    .slice(-CHAT_REQUEST_MESSAGE_LIMIT)
    .map(({ role, content }) => ({
      role,
      content: content.slice(-CHAT_REQUEST_CONTENT_LIMIT)
    }));
}
