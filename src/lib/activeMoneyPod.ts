const ACTIVE_MONEY_POD_KEY = "numa:active-money-pod-id";
const ACTIVE_MONEY_POD_EVENT = "numa:active-money-pod-change";

export function readActiveMoneyPodId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_MONEY_POD_KEY);
  } catch {
    return null;
  }
}

export function rememberActiveMoneyPodId(podId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (podId) window.localStorage.setItem(ACTIVE_MONEY_POD_KEY, podId);
    else window.localStorage.removeItem(ACTIVE_MONEY_POD_KEY);
  } catch {
    /* active pod is a local preference only */
  }
  window.dispatchEvent(
    new CustomEvent(ACTIVE_MONEY_POD_EVENT, { detail: { podId } })
  );
}

export function listenForActiveMoneyPodChange(listener: (podId: string | null) => void) {
  if (typeof window === "undefined") return () => undefined;
  function syncFromStorage() {
    listener(readActiveMoneyPodId());
  }
  function syncFromEvent(event: Event) {
    const next = (event as CustomEvent<{ podId?: string | null }>).detail?.podId;
    listener(next ?? readActiveMoneyPodId());
  }
  window.addEventListener("storage", syncFromStorage);
  window.addEventListener(ACTIVE_MONEY_POD_EVENT, syncFromEvent);
  return () => {
    window.removeEventListener("storage", syncFromStorage);
    window.removeEventListener(ACTIVE_MONEY_POD_EVENT, syncFromEvent);
  };
}
