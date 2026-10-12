import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "paper" | "glass" | "tint" | "strong";
  elevation?: "sm" | "md" | "lg";
}

export function Card({
  className,
  tone = "paper",
  elevation = "md",
  children,
  ...rest
}: CardProps) {
  const toneClass = {
    strong: "nm-panel-strong",
    glass: "nm-glass",
    tint: "bg-[color:var(--color-panel-depth)] border border-[color:var(--color-line)]",
    paper: "nm-panel"
  }[tone];
  const elevationClass =
    elevation === "sm"
      ? "shadow-[var(--shadow-sm)]"
      : elevation === "lg"
        ? "shadow-[var(--shadow-lg)]"
        : "shadow-[var(--shadow-md)]";
  return (
    <div
      className={cn("rounded-[24px] nm-card-container", toneClass, elevationClass, className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  trailing,
  className
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 px-4 sm:px-6 pt-3 sm:pt-5 pb-2 sm:pb-3",
        className
      )}
    >
      <div className="min-w-0">
        <p className="nm-card-title text-[13px] font-semibold tracking-[-0.01em] text-[color:var(--color-ink)]">
          {title}
        </p>
        {subtitle ? (
          <p className="nm-card-subtitle mt-0.5 sm:mt-1 text-[12px] text-[color:var(--color-ink-4)] break-words">{subtitle}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0 max-w-full">{trailing}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 sm:px-6 pb-4 sm:pb-6", className)}>{children}</div>;
}
