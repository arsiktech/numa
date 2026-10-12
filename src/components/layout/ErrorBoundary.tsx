import { Component, type ReactNode } from "react";
import {
  isRecoverableAssetLoadError,
  reloadOnceForAssetError
} from "@/lib/assetReload";
import { reportError } from "@/lib/errorReporting";
import { privateDiagnostic } from "../../../convex/lib/diagnosticPrivacy";

interface Props {
  /** Optional fallback. If omitted, a sensible Numa-styled default renders. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Wrapped tree. */
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Root error boundary. Catches anything that throws during render in the
 * subtree, logs it, and presents a Numa-styled recover panel instead of the
 * default React white screen.
 *
 * The reset button forces a remount via component-key bump in the consumer
 * tree — see the `reset` callback. We also offer a hard reload as a last
 * resort because some crashes (auth context, store hydration race) only
 * recover after the JS chunks re-evaluate.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // Errors can contain financial records or credentials. Keep local console
    // output categorical as well as sanitizing the remote telemetry boundary.
    console.error("[Numa] root error boundary caught:", privateDiagnostic({ source: "boundary", message: `${error.name}: ${error.message}` }));
    if (isRecoverableAssetLoadError(error)) {
      reloadOnceForAssetError();
      return; // expected after a deploy — not worth a telemetry row
    }
    reportError(error, "boundary");
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div
        role="alert"
        className="fixed inset-0 z-[9999] flex items-center justify-center px-5 py-8 bg-[color:var(--color-bg)] text-[color:var(--color-ink)]"
      >
        <div className="w-full max-w-[420px] flex flex-col gap-4">
          <p className="text-[11px] font-mono tracking-[0.22em] uppercase text-[color:var(--color-negative)]">
            Something broke
          </p>
          <h1
            className="text-[32px] font-bold tracking-[-0.03em] leading-[1.05] text-[color:var(--color-ink)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            We caught it before it spread.
          </h1>
          <p className="text-[14px] text-[color:var(--color-ink-2)] leading-[1.5]">
            Your data is safe in Numa Pro cloud. Try reloading; if it keeps
            happening, sign out and back in.
          </p>
          <details className="text-[11px] text-[color:var(--color-ink-3)] rounded-xl bg-[color:var(--color-cream-50)] border border-[color:var(--color-line)] px-3 py-2">
            <summary className="cursor-pointer select-none">Error details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-[1.5] text-[color:var(--color-ink-3)]">
              {error.name}: {error.message}
            </pre>
          </details>
          <div className="flex gap-2.5 mt-2">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 h-12 rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] font-semibold text-[14px] hover:brightness-105 active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 h-12 rounded-2xl bg-[color:var(--color-paper)] text-[color:var(--color-ink)] border border-[color:var(--color-line)] font-semibold text-[14px] hover:bg-[color:var(--color-cream-50)] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
