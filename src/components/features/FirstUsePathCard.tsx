import { Link } from "react-router-dom";
import { ArrowRight, Landmark, Plus, ShieldCheck } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

export function FirstUsePathCard({
  onAdd,
  className
}: {
  onAdd: () => void;
  className?: string;
}) {
  return (
    <Card tone="paper" className={cn("overflow-hidden", className)}>
      <CardBody className="p-0">
        <div className="border-l-4 border-[color:var(--color-brand)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[color:var(--color-brand-mist)] text-[color:var(--color-ink)]">
              <ShieldCheck size={18} strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="nm-eyebrow">Start here</p>
              <h2 className="mt-0.5 text-[19px] font-semibold tracking-[-0.02em] text-[color:var(--color-ink)]">
                Make the first week real
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--color-ink-3)]">
                Capture one expense first. Buckets and comparisons can wait until Numa Pro has something true to count.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={onAdd}
              className="nm-interactive flex min-h-[70px] items-center gap-3 rounded-[15px] bg-[color:var(--color-cta)] px-3 text-left text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[color:var(--color-cta-ink)] text-[color:var(--color-cta)]">
                <Plus size={17} strokeWidth={2.2} />
              </span>
              <span>
                <span className="block text-[13px] font-bold">Add expense</span>
                <span className="mt-0.5 block text-[11.5px] opacity-75">Any small real thing</span>
              </span>
            </button>

            <Link
              to="/buckets"
              viewTransition
              className="nm-interactive flex min-h-[70px] items-center gap-3 rounded-[15px] border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-3 text-left shadow-[var(--shadow-inner-line)]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[color:var(--color-positive-mist)] text-[color:var(--color-positive)]">
                <Landmark size={17} strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-[color:var(--color-ink)]">Make bucket</span>
                <span className="mt-0.5 block text-[11.5px] text-[color:var(--color-ink-3)]">One thing to save for</span>
              </span>
            </Link>

            <Link
              to="/money"
              viewTransition
              className="nm-interactive flex min-h-[70px] items-center gap-3 rounded-[15px] border border-[color:var(--color-line)] bg-[color:var(--color-bg)] px-3 text-left shadow-[var(--shadow-inner-line)]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-2)]">
                <ArrowRight size={17} strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-[color:var(--color-ink)]">Open money</span>
                <span className="mt-0.5 block text-[11.5px] text-[color:var(--color-ink-3)]">Edit or delete anytime</span>
              </span>
            </Link>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
