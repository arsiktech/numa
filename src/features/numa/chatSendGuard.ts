export type ChatSendLock = { current: symbol | null };

export function acquireChatSendLock(lock: ChatSendLock) {
  if (lock.current) return null;
  const token = Symbol("chat-send");
  lock.current = token;
  return () => {
    if (lock.current !== token) return false;
    lock.current = null;
    return true;
  };
}

export function resetChatSendLock(lock: ChatSendLock) {
  lock.current = null;
}

export function captureChatSendIdentity(identity: { current: string }) {
  const captured = identity.current;
  return () => identity.current === captured;
}
