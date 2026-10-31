import { useEffect, useState } from "react";
import type Terria from "../../Models/Terria";
import { mapBounds } from "../../Models/SimpleDashboard/Spatial";
import type {
  DashboardState,
  DashboardBounds
} from "../../Models/SimpleDashboard/Types";

export default function useDashboardSpatial(
  terria: Terria,
  state: DashboardState,
  enabled = true
) {
  const [bounds, setBounds] = useState<DashboardBounds>();
  const [visible, setVisible] = useState(!document.hidden);
  const follow = state.spatial?.mode === "viewport";
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!enabled || !visible || !follow) return;
    let timer: ReturnType<typeof setTimeout>;
    const capture = () => setBounds(mapBounds(terria));
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(capture, 750);
    };
    capture();
    const map = terria.leaflet?.map;
    map?.on("moveend zoomend resize", schedule);
    const remove =
      terria.cesium?.scene.camera.moveEnd.addEventListener(schedule);
    const resize = new ResizeObserver(schedule);
    const canvas = terria.cesium?.scene.canvas;
    if (canvas) resize.observe(canvas);
    return () => {
      clearTimeout(timer);
      map?.off("moveend zoomend resize", schedule);
      remove?.();
      resize.disconnect();
    };
  }, [terria, terria.leaflet, terria.cesium, enabled, visible, follow]);
  const effective: DashboardState = follow
    ? {
        ...state,
        spatial: {
          mode: "viewport",
          quality: "quick",
          bounds,
          approximate: !!terria.cesium
        }
      }
    : state;
  return {
    effective,
    enabled: enabled && visible && (!follow || !!bounds),
    needsMap: follow && !bounds
  };
}
