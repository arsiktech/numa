import { BrandLockup } from "@/components/brand/BrandLockup";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { revealDelay } from "@/lib/motion";

type Section = {
  title: string;
  body: string;
};

export function LegalShell({
  eyebrow,
  title,
  subtitle,
  sections,
  lastUpdated
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  sections: Section[];
  lastUpdated?: string;
}) {
  return (
    <main className="min-h-screen bg-[color:var(--color-bg)] text-[color:var(--color-ink)] px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-10">
        <header className="nm-reveal flex flex-col gap-8">
          <div className="nm-legal-brand">
          <BrandLockup />
          <Link
            to="/welcome"
            viewTransition
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-glass)] px-4 py-2 text-[13px] font-semibold text-[color:var(--color-ink-2)] transition-colors hover:bg-[color:var(--color-glass-strong)] hover:text-[color:var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back to Numa Pro
          </Link>
          </div>

          <div className="flex flex-col gap-4">
            <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[color:var(--color-brand-strong)]">
              {eyebrow}
            </p>
            <h1
              className="max-w-[760px] text-[clamp(42px,8vw,78px)] font-bold leading-[0.95] tracking-[-0.045em]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {title}
            </h1>
            <p className="max-w-[620px] text-[16px] leading-7 text-[color:var(--color-ink-2)]">
              {subtitle}
            </p>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {sections.map((section, index) => (
            <article
              key={section.title}
              className="nm-reveal rounded-[28px] border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-6 shadow-[var(--shadow-sm)] backdrop-blur-xl"
              style={revealDelay(index, 50)}
            >
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
                {section.title}
              </h2>
              <p className="mt-3 text-[13.5px] leading-6 text-[color:var(--color-ink-3)]">
                {section.body}
              </p>
            </article>
          ))}
        </section>

        <footer className="border-t border-[color:var(--color-line)] pt-5 text-[12px] leading-6 text-[color:var(--color-ink-4)]">
          {lastUpdated ? <p className="mb-1 font-mono">Last updated: {lastUpdated}</p> : null}
          This page is product guidance for Numa Pro and is not a substitute
          for legal, tax, accounting, or investment advice.
        </footer>
      </div>
    </main>
  );
}
