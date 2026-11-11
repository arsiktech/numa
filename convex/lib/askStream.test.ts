import { describe, expect, it } from "vitest";
import { emptyAskDelta, proposalsFrom, takeAskDelta } from "./askStream";

describe("ask stream events", () => {
  it("appends text as it arrives and keeps a tool draft", () => {
    const state = emptyAskDelta();
    takeAskDelta(state, { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } });
    takeAskDelta(state, { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } });
    takeAskDelta(state, { type: "content_block_start", content_block: { type: "tool_use", name: "propose_entry" } });
    takeAskDelta(state, { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{" } });
    expect(state.text).toBe("Hello");
    expect(state.tools).toEqual([{ name: "propose_entry", json: "{" }]);
    expect(proposalsFrom(state, 3)).toEqual([]);
  });
});
