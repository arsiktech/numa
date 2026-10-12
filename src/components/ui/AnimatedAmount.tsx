import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef
} from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { formatMoney, type CurrencyCode } from "@/lib/money";

type AnimatedAmountProps = ComponentPropsWithoutRef<"span"> & {
  value: number;
  currency: CurrencyCode;
  duration?: number;
  formatter?: (value: number, currency: CurrencyCode) => string;
};

export function AnimatedAmount({
  value,
  currency,
  duration = 900,
  formatter = formatMoney,
  className,
  ...props
}: AnimatedAmountProps) {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const latestValueRef = useRef(value);
  // After the first in-view count-up has played, later value changes tween
  // from the CURRENT displayed value (a €10 edit nudges the number, it does
  // not replay a full from-zero count) and start immediately — no second
  // IntersectionObserver wait.
  const revealedRef = useRef(false);
  const displayValueRef = useRef(value);
  const [displayValue, setDisplayValue] = useState(value);
  displayValueRef.current = displayValue;
  const formatted = useMemo(
    () => formatter(displayValue, currency),
    [currency, displayValue, formatter]
  );
  const staticFormatted = useMemo(
    () => formatter(value, currency),
    [currency, formatter, value]
  );

  useEffect(() => {
    latestValueRef.current = value;
    if (!Number.isFinite(value) || !Number.isFinite(displayValueRef.current) || prefersReducedMotion || typeof window === "undefined") {
      setDisplayValue(value);
      return undefined;
    }

    const node = ref.current;
    if (!node || !("IntersectionObserver" in window)) {
      setDisplayValue(value);
      return undefined;
    }

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    let cancelled = false;
    const targetValue = value;

    const run = (startValue: number, runDuration: number) => {
      const startedAt = performance.now();
      const tick = (time: number) => {
        if (cancelled) return;
        const progress = Math.min(1, (time - startedAt) / runDuration);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayValue(startValue + (targetValue - startValue) * eased);
        if (progress < 1) {
          frameRef.current = window.requestAnimationFrame(tick);
        } else {
          setDisplayValue(latestValueRef.current);
          frameRef.current = null;
        }
      };
      frameRef.current = window.requestAnimationFrame(tick);
    };

    if (revealedRef.current) {
      // Delta update: short tween from wherever the number currently sits.
      run(displayValueRef.current, Math.min(duration, 450));
      return () => {
        cancelled = true;
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        revealedRef.current = true;
        run(0, duration);
      },
      { threshold: 0.18 }
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [currency, duration, formatter, prefersReducedMotion, value]);

  return (
    <span
      ref={ref}
      aria-label={staticFormatted}
      className={cn("nm-num", className)}
      {...props}
    >
      {!Number.isFinite(value) || prefersReducedMotion ? staticFormatted : formatted}
    </span>
  );
}
