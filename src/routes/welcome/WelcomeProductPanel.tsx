import { useEffect, useRef, useSyncExternalStore, type PointerEvent } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { ChartNoAxesColumnIncreasing, Wallet, Sprout } from "lucide-react";
import { NumaCoinLogo } from "@/components/brand/NumaCoinLogo";
import { SPRING_GLASS } from "@/lib/motion";
import "./welcome-glass.css";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotionPreference(notify: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const readMotionPreference = () => window.matchMedia(motionQuery).matches;
const serverMotionPreference = () => true;

/** Original Numa artwork: optional tactile glass, never a gate in front of auth. */
export function WelcomeProductPanel() {
  const reduceMotion = useSyncExternalStore(subscribeMotionPreference, readMotionPreference, serverMotionPreference);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const bounds = useRef<DOMRect | null>(null);
  const x = useSpring(0, SPRING_GLASS);
  const y = useSpring(0, SPRING_GLASS);
  const lightX = useTransform(x, (value) => -value * 0.6);
  const lightY = useTransform(y, (value) => -value * 0.6);
  const tilt = useTransform(x, (value) => value * 0.18);
  const scale = useTransform([x, y], ([horizontal, vertical]: number[]) =>
    1 - Math.min(Math.hypot(horizontal, vertical) / 900, 0.055)
  );

  function settle() {
    pointer.current = null;
    x.set(0);
    y.set(0);
  }

  useEffect(() => {
    if (reduceMotion) {
      pointer.current = null;
      x.jump(0);
      y.jump(0);
    }
    const reset = () => { pointer.current = null; x.jump(0); y.jump(0); };
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [reduceMotion, x, y]);

  function move(event: PointerEvent<HTMLDivElement>) {
    if (reduceMotion || !event.isPrimary) return;
    const drag = pointer.current;
    if (drag) {
      if (drag.id !== event.pointerId) return;
      // Soft bounds keep the artwork in its own column, even on a long drag.
      x.set(42 * Math.tanh((event.clientX - drag.x) / 100));
      y.set(32 * Math.tanh((event.clientY - drag.y) / 100));
    } else if (event.pointerType === "mouse" && bounds.current) {
      const rect = bounds.current;
      x.set(((event.clientX - rect.left) / rect.width - 0.5) * 24);
      y.set(((event.clientY - rect.top) / rect.height - 0.5) * 18);
    }
  }

  return (
    <aside aria-hidden="true" className="nm-glass-art order-first sm:col-start-2 sm:row-span-2 sm:order-none">
      <div
        className="nm-glass-scene"
        data-reduced-motion={Boolean(reduceMotion)}
        onPointerEnter={(event) => { bounds.current = event.currentTarget.getBoundingClientRect(); }}
        onPointerDown={(event) => {
          if (reduceMotion || !event.isPrimary || event.button !== 0 || pointer.current) return;
          pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          if (pointer.current?.id !== event.pointerId) return;
          settle();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={settle}
        onLostPointerCapture={settle}
        onPointerLeave={() => { if (!pointer.current) settle(); }}
      >
        <span className="nm-glass-aura" />
        <span className="nm-glass-orbit" />
        <span className="nm-glass-satellite nm-glass-satellite--wallet"><Wallet /></span>
        <span className="nm-glass-satellite nm-glass-satellite--growth"><Sprout /></span>
        <span className="nm-glass-satellite nm-glass-satellite--capital"><ChartNoAxesColumnIncreasing /></span>
        <motion.div className="nm-glass-sphere" style={{ x, y, scale }}>
          <motion.div className="nm-glass-coin" style={{ rotate: tilt }}>
            <NumaCoinLogo size={194} />
          </motion.div>
          <span className="nm-glass-shell" />
          <motion.span className="nm-glass-caustic" style={{ x: lightX, y: lightY, rotate: tilt }} />
          <span className="nm-glass-rim" />
        </motion.div>
        <span className="nm-glass-ground" />
      </div>
    </aside>
  );
}
