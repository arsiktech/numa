/**
 * Tiny global command bus.
 *
 * Used by the ⌘K command palette and other UI surfaces to trigger top-level
 * dialogs (Ask Numa, Voice quick-add, Import/Export) without having to wire
 * refs or context through the tree.
 */

export type NumaCommand =
  | "ask-numa"
  | "voice-add"
  | "scan-receipt"
  | "add-transaction"
  | "open-capture"
  | "open-search"
  | "import-export";

const EVENT = "numa:command";

interface CommandEventDetail {
  command: NumaCommand;
  payload?: unknown;
}

/** Fire a command from anywhere in the app. */
export function emitCommand(command: NumaCommand, payload?: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CommandEventDetail>(EVENT, { detail: { command, payload } }));
}

/**
 * Subscribe to one specific command. Returns an unsubscribe function.
 * Use inside `useEffect` to wire a UI surface to a command.
 */
export function onCommand(command: NumaCommand, handler: (payload?: unknown) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = (event: Event) => {
    const detail = (event as CustomEvent<CommandEventDetail>).detail;
    if (detail?.command === command) handler(detail.payload);
  };
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
