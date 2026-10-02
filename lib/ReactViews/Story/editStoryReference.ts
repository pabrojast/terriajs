import createGuid from "terriajs-cesium/Source/Core/createGuid";
import { StoryData } from "../../Models/InitSource";
import {
  emptyDashboardState,
  StoryComposition,
  StoryDashboard,
  StoryReference
} from "../../Models/StoryComposition";
import chooseStoryDashboard from "./chooseStoryDashboard";

/** The selected HTML remains in TinyMCE; metadata carries all visual actions. */
export default async function editStoryReference(
  composition: StoryComposition,
  stories: StoryData[],
  selectedId?: string
): Promise<
  { composition: StoryComposition; reference?: StoryReference } | undefined
> {
  const old = composition.references.find((r) => r.id === selectedId);
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Link visualization");
    dialog.style.cssText =
      "width:min(680px,94vw);padding:24px;border-radius:8px;background:white;color:#17364d;z-index:100001";
    const heading = document.createElement("h2");
    heading.textContent = "Link visualization";
    const scene = document.createElement("select");
    scene.setAttribute("aria-label", "Map scene");
    scene.append(new Option("Keep current map", ""));
    stories.forEach((s) => scene.append(new Option(s.title, s.id)));
    scene.value = old?.scene_id || "";
    if (old?.scene_id && !stories.some((s) => s.id === old.scene_id))
      scene.append(
        new Option("Unavailable saved scene", old.scene_id, true, true)
      );
    const dashboard = document.createElement("select");
    dashboard.setAttribute("aria-label", "Dashboard");
    dashboard.append(new Option("Keep current dashboard", ""));
    composition.dashboards.forEach((d) =>
      dashboard.append(new Option(d.title, d.id))
    );
    dashboard.value = old?.dashboard_id || "";
    const enter = document.createElement("input");
    enter.type = "checkbox";
    enter.checked = !!old?.on_enter;
    const enterLabel = document.createElement("label");
    enterLabel.append(enter, " Also activate when this paragraph is reached");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    let chosen: StoryDashboard | undefined;
    let state =
      old?.state ||
      composition.dashboards.find((d) => d.id === dashboard.value)?.state ||
      emptyDashboardState();
    const stateSummary = () => {
      status.textContent =
        state.filters.length + " filters; " + (state.widgetId || "all charts");
    };
    dashboard.onchange = () => {
      state =
        composition.dashboards.find((d) => d.id === dashboard.value)?.state ||
        emptyDashboardState();
      stateSummary();
    };
    const finish = (result?: {
      composition: StoryComposition;
      reference?: StoryReference;
    }) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const button = (text: string, action: () => void) => {
      const node = document.createElement("button");
      node.type = "button";
      node.textContent = text;
      node.style.cssText =
        "padding:10px;margin:8px;border:1px solid #abc;border-radius:4px";
      node.onclick = action;
      return node;
    };
    dialog.append(
      heading,
      scene,
      dashboard,
      button("Choose dashboard and filters", async () => {
        const result = await chooseStoryDashboard();
        if (!result) return;
        const existing = composition.dashboards.find(
          (d) => d.view_id === result.view_id
        );
        chosen = { ...result, id: existing?.id || result.id };
        state = result.state;
        if (![...dashboard.options].some((o) => o.value === chosen!.id))
          dashboard.append(new Option(chosen.title, chosen.id));
        dashboard.value = chosen.id;
        stateSummary();
      }),
      status,
      enterLabel,
      button("Apply", () => {
        if (!scene.value && !dashboard.value) {
          status.textContent = "Choose a map scene or dashboard.";
          return;
        }
        const reference: StoryReference = {
          id: old?.id || createGuid(),
          scene_id: scene.value || undefined,
          dashboard_id: dashboard.value || undefined,
          state,
          on_enter: enter.checked
        };
        finish({
          reference,
          composition: {
            ...composition,
            dashboards:
              chosen && !composition.dashboards.some((d) => d.id === chosen!.id)
                ? [...composition.dashboards, chosen]
                : composition.dashboards,
            references: [
              ...composition.references.filter((r) => r.id !== reference.id),
              reference
            ]
          }
        });
      }),
      button("Cancel", () => finish())
    );
    if (old)
      dialog.append(
        button("Remove reference", () =>
          finish({
            composition: {
              ...composition,
              references: composition.references.filter((r) => r.id !== old.id)
            }
          })
        )
      );
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      finish();
    });
    document.body.append(dialog);
    dialog.showModal();
    stateSummary();
  });
}
