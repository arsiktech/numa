const DEFAULT_RADIUS = 132;
const DEFAULT_CROSS_AXIS_RADIUS = 24;

type Axis = "x" | "y" | "both";

export type ProximityMeasurement = {
  item: HTMLElement;
  axis: Axis;
  radius: number;
  crossAxisRadius: number;
  dockLeft: number;
  dockRight: number;
  dockTop: number;
  dockBottom: number;
  centerX: number;
  centerY: number;
};

function getDockAxis(item: HTMLElement): Axis {
  const dock = item.closest<HTMLElement>(".nm-proximity-dock");
  const axis = dock?.dataset.proximityAxis;
  return axis === "x" || axis === "y" ? axis : "both";
}

function getDockRadius(item: HTMLElement): number {
  const dock = item.closest<HTMLElement>(".nm-proximity-dock");
  const raw = dock?.dataset.proximityRadius;
  const radius = raw ? Number.parseFloat(raw) : DEFAULT_RADIUS;
  return Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_RADIUS;
}

function getDockCrossAxisRadius(item: HTMLElement): number {
  const dock = item.closest<HTMLElement>(".nm-proximity-dock");
  const raw = dock?.dataset.proximityCrossAxisRadius;
  const radius = raw ? Number.parseFloat(raw) : DEFAULT_CROSS_AXIS_RADIUS;
  return Number.isFinite(radius) && radius >= 0 ? radius : DEFAULT_CROSS_AXIS_RADIUS;
}

function isInsideCrossAxis(
  point: { clientX: number; clientY: number },
  measurement: ProximityMeasurement
) {
  if (measurement.axis === "both") return true;

  if (measurement.axis === "y") {
    return (
      point.clientX >= measurement.dockLeft - measurement.crossAxisRadius &&
      point.clientX <= measurement.dockRight + measurement.crossAxisRadius
    );
  }

  return (
    point.clientY >= measurement.dockTop - measurement.crossAxisRadius &&
    point.clientY <= measurement.dockBottom + measurement.crossAxisRadius
  );
}

export function measureProximityItem(item: HTMLElement): ProximityMeasurement {
  const dock = item.closest<HTMLElement>(".nm-proximity-dock") ?? item;
  const itemRect = item.getBoundingClientRect();
  const dockRect = dock.getBoundingClientRect();

  return {
    item,
    axis: getDockAxis(item),
    radius: getDockRadius(item),
    crossAxisRadius: getDockCrossAxisRadius(item),
    dockLeft: dockRect.left,
    dockRight: dockRect.right,
    dockTop: dockRect.top,
    dockBottom: dockRect.bottom,
    centerX: itemRect.left + itemRect.width / 2,
    centerY: itemRect.top + itemRect.height / 2
  };
}

export function proximityForMeasurement(
  point: { clientX: number; clientY: number },
  measurement: ProximityMeasurement
) {
  if (!isInsideCrossAxis(point, measurement)) return 0;

  const distance =
    measurement.axis === "x"
      ? Math.abs(point.clientX - measurement.centerX)
      : measurement.axis === "y"
        ? Math.abs(point.clientY - measurement.centerY)
        : Math.hypot(point.clientX - measurement.centerX, point.clientY - measurement.centerY);
  return Math.max(0, 1 - distance / measurement.radius);
}

export function proximityForPoint(
  point: { clientX: number; clientY: number },
  item: HTMLElement
) {
  return proximityForMeasurement(point, measureProximityItem(item));
}
