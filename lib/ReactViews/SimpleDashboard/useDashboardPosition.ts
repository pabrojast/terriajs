import {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { runInAction } from "mobx";
import Terria from "../../Models/Terria";

const margin = 10;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Store fractions of the available map space, so shared panels fit other screens. */
export default function useDashboardPosition(
  terria: Terria,
  property:
    | "simpleDashboardPosition"
    | "waterQualityPanelPosition" = "simpleDashboardPosition"
) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number }>();
  const [bounds, setBounds] = useState({
    width: 0,
    height: 0,
    top: margin,
    availableWidth: 0,
    availableHeight: 0
  });
  useLayoutEffect(() => {
    const element = panel.current;
    const parent = element?.offsetParent;
    if (!element || !(parent instanceof HTMLElement)) return;
    let menu: HTMLElement | null = null;
    const measure = () => {
      const currentMenu = parent.querySelector<HTMLElement>(
        "[data-terria-menu-bar]"
      );
      if (menu !== currentMenu) {
        if (menu) observer.unobserve(menu);
        menu = currentMenu;
        if (menu) observer.observe(menu);
      }
      const top =
        menu && menu.offsetHeight
          ? Math.max(
              margin,
              menu.getBoundingClientRect().bottom -
                parent.getBoundingClientRect().top +
                margin
            )
          : window.matchMedia("(max-width: 768px)").matches
            ? Math.max(margin, 60 - parent.getBoundingClientRect().top)
            : margin;
      setBounds({
        availableWidth: Math.max(0, parent.clientWidth - 2 * margin),
        availableHeight: Math.max(0, parent.clientHeight - top - margin),
        width: Math.max(
          0,
          parent.clientWidth - element.offsetWidth - 2 * margin
        ),
        height: Math.max(
          0,
          parent.clientHeight - element.offsetHeight - top - margin
        ),
        top
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(parent);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const move = (left: number, top: number) =>
    runInAction(() => {
      terria[property] = {
        x: bounds.width
          ? clamp((left - margin) / bounds.width)
          : (terria[property]?.x ?? 1),
        y: bounds.height
          ? clamp((top - bounds.top) / bounds.height)
          : (terria[property]?.y ?? 0)
      };
    });
  const position =
    terria[property] ??
    (property === "waterQualityPanelPosition" || terria.simpleDashboardSize
      ? { x: 0.95, y: 0 }
      : undefined);
  const style: CSSProperties | undefined = position
    ? {
        left: margin + position.x * bounds.width,
        top: bounds.top + position.y * bounds.height,
        right: "auto",
        bottom: "auto"
      }
    : undefined;
  return {
    panel,
    bounds,
    style,
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (
        event.button !== 0 ||
        !event.isPrimary ||
        (event.target as Element).closest("button")
      )
        return;
      const rect = panel.current!.getBoundingClientRect();
      drag.current = {
        id: event.pointerId,
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      event.preventDefault();
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = drag.current;
      const parent = panel.current?.offsetParent;
      if (
        !current ||
        current.id !== event.pointerId ||
        !(parent instanceof HTMLElement)
      )
        return;
      const rect = parent.getBoundingClientRect();
      move(
        event.clientX - current.dx - rect.left,
        event.clientY - current.dy - rect.top
      );
    },
    onPointerUp() {
      drag.current = undefined;
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Home") {
        event.preventDefault();
        runInAction(() => {
          terria[property] = undefined;
        });
        return;
      }
      const delta = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1]
      }[event.key];
      const element = panel.current;
      if (!delta || !element) return;
      event.preventDefault();
      const step = event.shiftKey ? 40 : 10;
      move(
        element.offsetLeft + delta[0] * step,
        element.offsetTop + delta[1] * step
      );
    }
  };
}
