/**
 * True when a keydown belongs to an input method editor (IME) — the composer
 * Japanese, Chinese and Korean keyboards use to turn keystrokes into text.
 * While it is open, Enter confirms the suggested characters and the arrows
 * and Escape steer its candidate list, so app shortcuts must stay out of it.
 *
 * `isComposing` is the standard signal. Safari can fire `compositionend`
 * before the confirming Enter keydown, which then reports
 * `isComposing: false`; that keydown still carries `keyCode` 229, the only
 * signal left there.
 */
export function isComposingKeydown(event: Pick<KeyboardEvent, "isComposing" | "keyCode">): boolean {
  return event.isComposing || event.keyCode === 229;
}
