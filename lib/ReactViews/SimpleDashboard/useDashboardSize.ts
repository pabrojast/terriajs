import {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  useLayoutEffect,
  useRef
} from "react";
import { runInAction } from "mobx";
import Terria from "../../Models/Terria";
import { validDashboardSize } from "../../Models/SimpleDashboard/Types";
import useDashboardPosition from "./useDashboardPosition";

const preference = "simpleDashboardSize";
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Remember the preferred size; adapting to a smaller screen never overwrites it. */
export default function useDashboardSize(
  terria: Terria,
  position: ReturnType<typeof useDashboardPosition>,
  compact: boolean
) {
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    left: number;
    top: number;
  }>();
  useLayoutEffect(() => {
    if (terria.simpleDashboardSize) return;
    try {
      const stored = JSON.parse(String(terria.getLocalProperty(preference)));
      if (validDashboardSize(stored))
        runInAction(() => {
          terria.simpleDashboardSize = stored;
        });
    } catch {
      /* An absent or obsolete browser preference keeps the default size. */
    }
  }, [terria]);
  const { availableWidth, availableHeight, top } = position.bounds;
  const resize = (
    width: number,
    height: number,
    left: number,
    panelTop: number
  ) => {
    if (!availableWidth || !availableHeight) return;
    const size = {
      width: Math.round(clamp(width, 300, availableWidth)),
      height: Math.round(clamp(height, 240, availableHeight))
    };
    // Keep the top-left corner still until the panel reaches the map edge.
    runInAction(() => {
      terria.simpleDashboardSize = size;
      terria.simpleDashboardPosition = {
        x:
          availableWidth > size.width
            ? clamp((left - 10) / (availableWidth - size.width), 0, 1)
            : 1,
        y:
          availableHeight > size.height
            ? clamp((panelTop - top) / (availableHeight - size.height), 0, 1)
            : 0
      };
    });
  };
  const save = () =>
    terria.setLocalProperty(
      preference,
      JSON.stringify(terria.simpleDashboardSize) ?? ""
    );
  const size = terria.simpleDashboardSize;
  const style: CSSProperties =
    size && availableWidth && availableHeight
      ? {
          width: clamp(size.width, 300, availableWidth),
          height: compact
            ? undefined
            : clamp(size.height, 240, availableHeight),
          maxWidth: availableWidth,
          maxHeight: compact ? undefined : availableHeight
        }
      : {};
  return {
    style,
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      const element = position.panel.current;
      if (!element || event.button !== 0 || !event.isPrimary) return;
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        width: element.offsetWidth,
        height: element.offsetHeight,
        left: element.offsetLeft,
        top: element.offsetTop
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      event.preventDefault();
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      const start = drag.current;
      if (!start || start.id !== event.pointerId) return;
      resize(
        start.width + event.clientX - start.x,
        start.height + event.clientY - start.y,
        start.left,
        start.top
      );
    },
    onPointerUp() {
      if (drag.current) save();
      drag.current = undefined;
    },
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      const element = position.panel.current;
      if (!element) return;
      if (event.key === "Home") {
        event.preventDefault();
        runInAction(() => {
          terria.simpleDashboardSize = undefined;
        });
        save();
        return;
      }
      const delta = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1]
      }[event.key];
      if (!delta) return;
      event.preventDefault();
      const step = event.shiftKey ? 40 : 10;
      resize(
        element.offsetWidth + delta[0] * step,
        element.offsetHeight + delta[1] * step,
        element.offsetLeft,
        element.offsetTop
      );
      save();
    }
  };
}
