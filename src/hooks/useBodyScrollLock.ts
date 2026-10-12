import { useEffect } from "react";

let scrollLockDepth = 0;
let previousOverflow: { html: string; body: string } | null = null;

export function lockDocumentScroll() {
  const html = document.documentElement;
  const body = document.body;
  if (scrollLockDepth === 0) {
    previousOverflow = {
      html: html.style.overflow,
      body: body.style.overflow
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
  }
  scrollLockDepth += 1;
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    scrollLockDepth = Math.max(0, scrollLockDepth - 1);
    if (scrollLockDepth > 0 || !previousOverflow) return;
    html.style.overflow = previousOverflow.html;
    body.style.overflow = previousOverflow.body;
    previousOverflow = null;
  };
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    return lockDocumentScroll();
  }, [locked]);
}
