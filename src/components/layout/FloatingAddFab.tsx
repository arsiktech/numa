import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Mic, Plus, ScanLine, Search } from "lucide-react";
import { DialogLoadingFallback } from "@/components/layout/DialogLoadingFallback";
import { Sparkle } from "@/components/ui/Sparkle";
import { onCommand } from "@/lib/commands";
import { useAppMode } from "@/lib/appMode";
import { AI_ENABLED } from "@/lib/aiEnabled";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";

const loadUniversalCaptureDialog = () =>
  import("@/components/features/UniversalCaptureDialog").then((module) => ({
    default: module.UniversalCaptureDialog
  }));
const loadLightAddExpenseDialog = () =>
  import("@/components/features/LightAddExpenseDialog").then((module) => ({
    default: module.LightAddExpenseDialog
  }));
const loadSearchDialog = () =>
  import("@/components/layout/SearchDialog").then((module) => ({
    default: module.SearchDialog
  }));
const loadAIChatDialog = () =>
  import("@/components/features/AIChatDialog").then((module) => ({
    default: module.AIChatDialog
  }));

const LazyUniversalCaptureDialog = lazy(loadUniversalCaptureDialog);
const LazyLightAddExpenseDialog = lazy(loadLightAddExpenseDialog);
const LazySearchDialog = lazy(loadSearchDialog);
const LazyAIChatDialog = lazy(loadAIChatDialog);

type PreloadFn = () => Promise<unknown>;

/**
 * Bottom toolbar cluster — MonAI-style.
 *
 * Layout per the latest user mock:
 *   Bottom-LEFT (small, ~44px round, on a pill background):
 *     [ + Add ] [ 🔍 Search ] [ ✦ Numa ]
 *   Bottom-RIGHT (big, ~64px, red, with Siri-style ring when active):
 *     [ 🎤 Voice ]
 *
 * The route surfaces now own their mode-specific mobile chrome:
 * Light has its plus dock, Advanced has Numa AI centered in the dock, and
 * Shared has the pot dock. This host still stays mounted so commands can
 * open Capture, Search, and Numa dialogs from those surfaces.
 */

const HIDE_ON: string[] = [
  "/welcome",
  "/landing",
  "/login",
  "/signup",
  // Numa OS owns its composer — floating add/search chrome would collide
  // with the catalog grid and double the input affordances.
  "/numa",
  "/onboarding/style",
  "/onboarding/mode",
  "/onboarding/setup",
  "/onboarding/ready",
  "/settings"
];

export function FloatingAddFab() {
  const location = useLocation();
  const [appMode] = useAppMode();
  const [showCapture, setShowCapture] = useState(false);
  const [showLightAdd, setShowLightAdd] = useState(false);
  const [captureMode, setCaptureMode] = useState<"text" | "voice" | "receipt" | "manual">("text");
  const [showSearch, setShowSearch] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const { t } = useLocale();
  // Each product mode has its own dock now; keeping this visible would stack
  // old chrome over the designed mode navigation on mobile.
  const modeOwnsMobileChrome =
    appMode === "light" || appMode === "advanced" || appMode === "shared";

  const openCapture = useCallback((mode: "text" | "voice" | "receipt" | "manual" = "text") => {
    if (appMode === "light" && (mode === "text" || mode === "manual")) {
      setShowLightAdd(true);
      return;
    }
    setCaptureMode(mode);
    setShowCapture(true);
  }, [appMode]);

  useEffect(() => onCommand("voice-add", () => openCapture("voice")), [openCapture]);
  useEffect(() => onCommand("scan-receipt", () => openCapture("receipt")), [openCapture]);
  useEffect(() => onCommand("add-transaction", () => openCapture("manual")), [openCapture]);
  useEffect(() => onCommand("open-capture", () => openCapture("text")), [openCapture]);
  useEffect(() => onCommand("open-search", () => setShowSearch(true)), []);
  useEffect(
    () =>
      onCommand("ask-numa", (payload) => {
        // Central kill-switch: while AI is disabled, no ask-numa trigger
        // anywhere (search, nudges, "explain" links, goal helper) can open the
        // chat — so nothing errors against the un-credited gateway.
        if (!AI_ENABLED || appMode !== "advanced") return;
        const prompt =
          payload && typeof payload === "object" && "prompt" in payload
            ? String((payload as { prompt?: unknown }).prompt ?? "")
            : "";
        setChatPrompt(prompt || null);
        setShowChat(true);
      }),
    [appMode]
  );

  useEffect(() => {
    if (appMode === "advanced") return;
    setShowChat(false);
    setChatPrompt(null);
  }, [appMode]);

  // Keyboard shortcuts work app-wide via the FAB host.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      if (desktop) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowSearch((v) => !v);
      } else if (
        AI_ENABLED &&
        appMode === "advanced" &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "j"
      ) {
        // AI chat is gated off — don't let the shortcut bypass the kill-switch.
        event.preventDefault();
        setShowChat((v) => !v);
      } else if (event.key === "/" && !isTypingInField(event.target)) {
        event.preventDefault();
        setShowSearch(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appMode]);

  const hidden = HIDE_ON.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`)
  );
  if (hidden) return null;

  return (
    <>
      {/* Bottom-left cluster: + Add / Search / Numa. Pill background groups
          them visually so they read as one toolbar. Sits above BottomNav.
          Hidden for the designed modes; command listeners above stay active. */}
      {modeOwnsMobileChrome ? null : (
        <div
          className="nm-proximity-dock fixed z-[35] left-3 flex items-center gap-1.5 px-1.5 py-1.5 rounded-full bg-[color:var(--color-glass-strong)] border border-[color:var(--color-line)] shadow-[var(--shadow-md)] backdrop-blur-xl lg:hidden"
          data-proximity-axis="x"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)"
          }}
        >
          <ToolbarBtn
            label={t("home.capture")}
            onClick={() => openCapture("text")}
            preload={loadUniversalCaptureDialog}
          >
            <Plus size={20} strokeWidth={2.5} />
          </ToolbarBtn>
          <ToolbarBtn label={t("search")} onClick={() => setShowSearch(true)} preload={loadSearchDialog}>
            <Search size={17} strokeWidth={2} />
          </ToolbarBtn>
          <ToolbarBtn
            label={t("askNuma")}
            onClick={() => setShowChat(true)}
            preload={loadAIChatDialog}
            accent
          >
            <Sparkle size={14} color="currentColor" />
          </ToolbarBtn>
        </div>
      )}

      {/* Bottom-right BIG RED microphone — the AI hot mic. iOS-18 Siri
          rainbow ring pulses when VoiceDialog is open. */}
      {modeOwnsMobileChrome ? null : (
        <div
          className="nm-fab-mic nm-proximity-dock fixed z-[35] right-4 lg:hidden"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)"
          }}
        >
          {showCapture && captureMode === "voice" ? (
            <>
              <span aria-hidden className="nm-siri-ring" />
              <span aria-hidden className="nm-siri-ring nm-siri-ring--b" />
            </>
          ) : null}
          <button
            type="button"
            aria-label={t("fab.voiceAdd")}
            onClick={() => openCapture("voice")}
            onPointerEnter={() => void loadUniversalCaptureDialog()}
            onFocus={() => void loadUniversalCaptureDialog()}
            // intentional — the always-red mic uses a fixed white glyph for visibility
            className={cn(
              "relative grid place-items-center w-16 h-16 rounded-full text-white shadow-[0_18px_40px_-10px_rgba(0,0,0,0.5)] active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
              "nm-interactive nm-proximity-item",
              "bg-[color:var(--color-negative)] hover:brightness-110"
            )}
          >
            <Mic size={26} strokeWidth={2} />
          </button>
          {/* Scan rides next to the mic in Advanced / Shared. Light mode keeps
              the visible chrome intentionally simple; scan remains available
              from the capture sheet opened by the bottom-nav plus. */}
          <ScanSatellite
            onClick={() => openCapture("receipt")}
            label={t("fab.scanReceipt")}
            preload={loadUniversalCaptureDialog}
          />
        </div>
      )}

      {/* Mobile Search affordance. The per-mode docks own most of the mobile
          chrome, but none of them surface Search, leaving it keyboard-only
          (⌘K / "/") and unreachable on touch. This small pill re-exposes it
          using the same setShowSearch handler the (now-hidden) toolbar used. */}
      <button
        type="button"
        aria-label={t("search")}
        title={t("search")}
        onClick={() => setShowSearch(true)}
        onPointerEnter={() => void loadSearchDialog()}
        onFocus={() => void loadSearchDialog()}
        className="nm-interactive fixed z-[35] left-3 grid place-items-center w-11 h-11 rounded-full bg-[color:var(--color-glass-strong)] border border-[color:var(--color-line)] text-[color:var(--color-ink-2)] shadow-[var(--shadow-md)] backdrop-blur-xl active:scale-95 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)] lg:hidden"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)"
        }}
      >
        <Search size={18} strokeWidth={2} />
      </button>

      {showCapture ? (
        <Suspense fallback={<DialogLoadingFallback />}>
          <LazyUniversalCaptureDialog
            open={showCapture}
            initialMode={captureMode}
            onClose={() => setShowCapture(false)}
          />
        </Suspense>
      ) : null}
      {showLightAdd ? (
        <Suspense fallback={<DialogLoadingFallback />}>
          <LazyLightAddExpenseDialog
            open={showLightAdd}
            onClose={() => setShowLightAdd(false)}
          />
        </Suspense>
      ) : null}
      {showSearch ? (
        <Suspense fallback={<DialogLoadingFallback />}>
          <LazySearchDialog open={showSearch} onClose={() => setShowSearch(false)} />
        </Suspense>
      ) : null}
      {showChat && appMode === "advanced" ? (
        <Suspense fallback={<DialogLoadingFallback />}>
          <LazyAIChatDialog
            open={showChat}
            initialPrompt={chatPrompt}
            onClose={() => {
              setShowChat(false);
              setChatPrompt(null);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function ToolbarBtn({
  label,
  onClick,
  accent,
  preload,
  children
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
  preload?: PreloadFn;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onPointerEnter={preload ? () => void preload() : undefined}
      onFocus={preload ? () => void preload() : undefined}
      className={cn(
        "nm-interactive nm-proximity-item grid place-items-center w-11 h-11 rounded-full active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
        accent
          ? "bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
          : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-cream-100)]"
      )}
    >
      {children}
    </button>
  );
}

function ScanSatellite({
  onClick,
  label,
  preload
}: {
  onClick: () => void;
  label: string;
  preload?: PreloadFn;
}) {
  // Visible in every mode. ScanDialog itself decides what to do with the
  // capture (creates a personal tx in Light/Advanced, will hand off to the
  // pod expense flow in Shared once that wiring lands).
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerEnter={preload ? () => void preload() : undefined}
      onFocus={preload ? () => void preload() : undefined}
      className="nm-interactive nm-proximity-item absolute -top-2 -left-3 grid place-items-center w-9 h-9 rounded-full bg-[color:var(--color-glass-strong)] border border-[color:var(--color-line-glass)] text-[color:var(--color-ink-2)] shadow-[var(--shadow-md)] active:scale-95 backdrop-blur-xl"
    >
      <ScanLine size={15} strokeWidth={1.9} />
    </button>
  );
}
