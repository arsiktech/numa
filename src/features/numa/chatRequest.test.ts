import { describe, expect, it } from "vitest";
import { boundedChatMessages, sanitizeChatMessages } from "./chatRequest";

describe("bounded chat requests", () => {
  it("submits the latest 40 persisted messages", () => {
    const messages = Array.from({ length: 61 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `Message ${index}`
    }));

    const bounded = boundedChatMessages(messages);

    expect(bounded).toHaveLength(40);
    expect(bounded[0]?.content).toBe("Message 21");
    expect(bounded.at(-1)?.content).toBe("Message 60");
    expect(bounded[0]).toEqual({ role: "assistant", content: "Message 21" });
  });

  it("caps a persisted provider response at the server string limit", () => {
    const bounded = boundedChatMessages([
      { role: "assistant", content: `old${"x".repeat(4_100)}new` }
    ]);

    expect(bounded[0]?.content).toHaveLength(4_000);
    expect(bounded[0]?.content.endsWith("new")).toBe(true);
  });

  it("drops persisted blank placeholders before taking the latest 40 messages", () => {
    const messages = [
      { id: "old-empty", role: "assistant" as const, content: "" },
      ...Array.from({ length: 41 }, (_, index) => ({
        id: `message-${index}`,
        role: index % 2 === 0 ? "user" as const : "assistant" as const,
        content: `Message ${index}`
      })),
      { id: "aborted-placeholder", role: "assistant" as const, content: "   \n" }
    ];

    const bounded = boundedChatMessages(messages);

    expect(bounded).toHaveLength(40);
    expect(bounded[0]?.content).toBe("Message 1");
    expect(bounded.at(-1)?.content).toBe("Message 40");
  });

  it("removes an empty assistant placeholder after a mid-stream abort", () => {
    const recovered = sanitizeChatMessages([
      { id: "user", role: "user" as const, content: "What changed?" },
      { id: "assistant", role: "assistant" as const, content: "" }
    ]);

    expect(recovered).toEqual([
      { id: "user", role: "user", content: "What changed?" }
    ]);
  });
});
