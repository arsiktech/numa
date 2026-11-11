import { normalizeProposal, type AskProposal } from "./askProposals";

export type AskDeltaState = { text: string; tools: { name: string; json: string }[] };

export function emptyAskDelta(): AskDeltaState {
  return { text: "", tools: [] };
}

/** Fold one provider stream event into the reply so far. */
export function takeAskDelta(state: AskDeltaState, event: { type?: string; content_block?: { type?: string; name?: string }; delta?: { type?: string; text?: string; partial_json?: string } }) {
  if (event.type === "content_block_start" && event.content_block?.type === "tool_use" && event.content_block.name) {
    state.tools.push({ name: event.content_block.name, json: "" });
  }
  if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) state.text += event.delta.text;
  if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta" && event.delta.partial_json && state.tools.length) {
    state.tools[state.tools.length - 1].json += event.delta.partial_json;
  }
}

export function proposalsFrom(state: AskDeltaState, limit: number): AskProposal[] {
  const proposals: AskProposal[] = [];
  for (const tool of state.tools) {
    if (proposals.length >= limit) break;
    let input: unknown;
    try { input = JSON.parse(tool.json || "{}"); } catch { input = null; }
    const proposal = normalizeProposal(input);
    if (proposal) proposals.push(proposal);
  }
  return proposals;
}
