import { describe, expect, it } from "vitest";
import { measureProximityItem, proximityForMeasurement, proximityForPoint } from "./proximityMath";

function mockRect(element: HTMLElement, rect: Partial<DOMRect>) {
  const fullRect = {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect
  } as DOMRect;
  element.getBoundingClientRect = () => fullRect;
}

describe("proximity dock", () => {
  it("does not scale a vertical dock item when the pointer is far outside the dock horizontally", () => {
    const dock = document.createElement("nav");
    dock.className = "nm-proximity-dock";
    dock.dataset.proximityAxis = "y";
    dock.dataset.proximityCrossAxisRadius = "12";
    const item = document.createElement("a");
    item.className = "nm-proximity-item";
    dock.append(item);
    document.body.append(dock);

    mockRect(dock, { left: 16, right: 248, top: 80, bottom: 160, width: 232, height: 80 });
    mockRect(item, { left: 28, right: 232, top: 90, bottom: 134, width: 204, height: 44 });

    expect(proximityForPoint({ clientX: 633, clientY: 112 }, item)).toBe(0);
    expect(proximityForPoint({ clientX: 240, clientY: 112 }, item)).toBeGreaterThan(0);

    dock.remove();
  });

  it("does not scale a horizontal dock item when the pointer is far outside the dock vertically", () => {
    const dock = document.createElement("nav");
    dock.className = "nm-proximity-dock";
    dock.dataset.proximityAxis = "x";
    dock.dataset.proximityCrossAxisRadius = "12";
    const item = document.createElement("button");
    item.className = "nm-proximity-item";
    dock.append(item);
    document.body.append(dock);

    mockRect(dock, { left: 320, right: 640, top: 720, bottom: 784, width: 320, height: 64 });
    mockRect(item, { left: 384, right: 448, top: 728, bottom: 776, width: 64, height: 48 });

    expect(proximityForPoint({ clientX: 416, clientY: 198 }, item)).toBe(0);
    expect(proximityForPoint({ clientX: 416, clientY: 740 }, item)).toBeGreaterThan(0);

    dock.remove();
  });

  it("reuses cached geometry for pointer-frame proximity math", () => {
    const dock = document.createElement("nav");
    dock.className = "nm-proximity-dock";
    dock.dataset.proximityAxis = "x";
    const item = document.createElement("button");
    item.className = "nm-proximity-item";
    dock.append(item);
    document.body.append(dock);

    let itemReads = 0;
    let dockReads = 0;
    item.getBoundingClientRect = () => {
      itemReads += 1;
      return {
        left: 384,
        right: 448,
        top: 728,
        bottom: 776,
        width: 64,
        height: 48,
        x: 384,
        y: 728,
        toJSON: () => ({})
      } as DOMRect;
    };
    dock.getBoundingClientRect = () => {
      dockReads += 1;
      return {
        left: 320,
        right: 640,
        top: 720,
        bottom: 784,
        width: 320,
        height: 64,
        x: 320,
        y: 720,
        toJSON: () => ({})
      } as DOMRect;
    };

    const measurement = measureProximityItem(item);

    expect(proximityForMeasurement({ clientX: 416, clientY: 740 }, measurement)).toBeGreaterThan(0);
    expect(proximityForMeasurement({ clientX: 416, clientY: 740 }, measurement)).toBeGreaterThan(0);
    expect(itemReads).toBe(1);
    expect(dockReads).toBe(1);

    dock.remove();
  });
});
