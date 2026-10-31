import type Terria from "../../Models/Terria";
import type { DashboardState } from "../../Models/SimpleDashboard/Types";
import { mapBounds } from "../../Models/SimpleDashboard/Spatial";
import { tr } from "./text";

export default function SpatialControls({
  terria,
  state,
  onChange,
  native,
  needsMap
}: {
  terria: Terria;
  state: DashboardState;
  onChange: (state: DashboardState) => void;
  native: boolean;
  needsMap?: boolean;
}) {
  const mode = state.spatial?.mode ?? "configured";
  const capture = (quality: "quick" | "native") => {
    const bounds = mode === "fixed" ? state.spatial?.bounds : mapBounds(terria);
    if (bounds)
      onChange({
        ...state,
        spatial: {
          mode: "fixed",
          quality,
          bounds,
          approximate:
            mode === "fixed" ? state.spatial?.approximate : !!terria.cesium
        }
      });
  };
  const embedded = terria.userProperties.get("dashboardOnly") === "1";
  return (
    <fieldset className="simple-spatial">
      <legend>{tr("spatialScope")}</legend>
      <select
        aria-label={tr("spatialScope")}
        value={mode}
        onChange={(e) => {
          if (e.target.value === "fixed") capture("quick");
          else
            onChange({
              ...state,
              spatial: {
                mode: e.target.value as "configured" | "viewport",
                quality: "quick"
              }
            });
        }}
      >
        <option value="configured">{tr("scopeConfigured")}</option>
        <option value="viewport" disabled={embedded}>
          {tr("scopeViewport")}
        </option>
        <option value="fixed" disabled={embedded && mode !== "fixed"}>
          {tr("scopeFixed")}
        </option>
      </select>
      {!embedded && (
        <button type="button" onClick={() => capture("quick")}>
          {tr("fixExtent")}
        </button>
      )}
      {native && (!embedded || mode === "fixed") && (
        <button type="button" onClick={() => capture("native")}>
          {tr("nativeExtent")}
        </button>
      )}
      {needsMap && <p role="status">{tr("extentRequired")}</p>}
      {state.spatial?.approximate && mode !== "configured" && (
        <small>{tr("extentApproximate")}</small>
      )}
      {state.spatial?.quality === "native" && <p>{tr("nativeRequested")}</p>}
    </fieldset>
  );
}
