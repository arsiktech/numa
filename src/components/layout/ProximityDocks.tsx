import { useEffect } from "react";
import {
  measureProximityItem,
  proximityForMeasurement,
  type ProximityMeasurement
} from "./proximityMath";

const ITEM_SELECTOR = ".nm-proximity-dock > .nm-proximity-item";
const MAX_SCALE = 0.1;
const MAX_DARKEN = 0.07;
const MAX_SATURATE = 0.1;

function getDockMaxScale(item: HTMLElement): number {
  const dock = item.closest<HTMLElement>(".nm-proximity-dock");
  const raw = dock?.dataset.proximityMaxScale;
  const scale = raw ? Number.parseFloat(raw) : MAX_SCALE;
  return Number.isFinite(scale) && scale >= 0 ? scale : MAX_SCALE;
}

function resetItem(item: HTMLElement) {
  item.style.removeProperty("--nm-proximity");
  item.style.removeProperty("filter");
  item.style.removeProperty("scale");
  item.style.removeProperty("z-index");
}

export function ProximityDocks() {
  useEffect(() => {
    const supportsFinePointer = window.matchMedia("(pointer: fine)").matches;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!supportsFinePointer || prefersReducedMotion) return undefined;

    let frame = 0;
    let lastEvent: PointerEvent | null = null;
    let cacheDirty = true;
    let measurements: ProximityMeasurement[] = [];
    let resizeObserver: ResizeObserver | null = null;

    function markCacheDirty() {
      cacheDirty = true;
    }

    function refreshMeasurements() {
      resizeObserver?.disconnect();
      resizeObserver = null;

      const items = Array.from(document.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
      measurements = items.map(measureProximityItem);
      cacheDirty = false;

      if ("ResizeObserver" in window) {
        const docks = new Set<HTMLElement>();
        items.forEach((item) => {
          const dock = item.closest<HTMLElement>(".nm-proximity-dock");
          if (dock) docks.add(dock);
        });
        resizeObserver = new ResizeObserver(markCacheDirty);
        docks.forEach((dock) => resizeObserver?.observe(dock));
      }
    }

    function update() {
      frame = 0;
      if (!lastEvent) return;

      if (cacheDirty || measurements.some((measurement) => !measurement.item.isConnected)) {
        refreshMeasurements();
      }

      measurements.forEach((measurement) => {
        const item = measurement.item;
        const t = proximityForMeasurement(lastEvent as PointerEvent, measurement);
        if (t <= 0.01) {
          resetItem(item);
          return;
        }

        item.style.setProperty("--nm-proximity", t.toFixed(3));
        item.style.scale = (1 + t * getDockMaxScale(item)).toFixed(3);
        item.style.filter = `brightness(${(1 - t * MAX_DARKEN).toFixed(3)}) saturate(${(1 + t * MAX_SATURATE).toFixed(3)})`;
        item.style.zIndex = String(Math.ceil(t * 10));
      });
    }

    function onPointerMove(event: PointerEvent) {
      lastEvent = event;
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    function resetAll() {
      lastEvent = null;
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      measurements.forEach((measurement) => resetItem(measurement.item));
      measurements = [];
      resizeObserver?.disconnect();
      resizeObserver = null;
      cacheDirty = true;
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", resetAll);
    window.addEventListener("blur", resetAll);
    window.addEventListener("resize", markCacheDirty, { passive: true });
    window.addEventListener("orientationchange", markCacheDirty, { passive: true });
    window.addEventListener("scroll", markCacheDirty, { passive: true, capture: true });
    document.fonts?.addEventListener?.("loadingdone", markCacheDirty);
    void document.fonts?.ready.then(markCacheDirty);

    return () => {
      resetAll();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", resetAll);
      window.removeEventListener("blur", resetAll);
      window.removeEventListener("resize", markCacheDirty);
      window.removeEventListener("orientationchange", markCacheDirty);
      window.removeEventListener("scroll", markCacheDirty, true);
      document.fonts?.removeEventListener?.("loadingdone", markCacheDirty);
    };
  }, []);

  return null;
}
