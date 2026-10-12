import i18next from "i18next";
import createStoryDialog from "./createStoryDialog";
import Styles from "./story-editor.scss";
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
    const tr = (key: string) => i18next.t(`story.editor.design.${key}`);
    const previousFocus = document.activeElement;
    const { dialog, body, close } = createStoryDialog(tr("linkVisualization"));
    const label = (text: string, control: HTMLElement) => {
      const el = document.createElement("label");
      el.append(text, control);
      return el;
    };
    const scene = document.createElement("select");
    scene.setAttribute("aria-label", tr("mapScene"));
    scene.append(new Option(tr("keepMap"), ""));
    stories.forEach((s) => scene.append(new Option(s.title, s.id)));
    scene.value = old?.scene_id || "";
    if (old?.scene_id && !stories.some((s) => s.id === old.scene_id))
      scene.append(
        new Option(tr("unavailableScene"), old.scene_id, true, true)
      );
    const dashboard = document.createElement("select");
    dashboard.setAttribute("aria-label", tr("dashboard"));
    dashboard.append(new Option(tr("keepDashboard"), ""));
    composition.dashboards.forEach((d) =>
      dashboard.append(new Option(d.title, d.id))
    );
    dashboard.value = old?.dashboard_id || "";
    const enter = document.createElement("input");
    enter.type = "checkbox";
    enter.checked = !!old?.on_enter;
    const enterLabel = document.createElement("label");
    enterLabel.className = Styles.checkLabel;
    enterLabel.append(enter, tr("onEnter"));
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    let chosen: StoryDashboard | undefined;
    let state =
      old?.state ||
      composition.dashboards.find((d) => d.id === dashboard.value)?.state ||
      emptyDashboardState();
    const stateSummary = () => {
      status.textContent = i18next.t("story.editor.design.referenceSummary", {
        count: state.filters.length,
        widget: state.widgetId || tr("allCharts")
      });
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
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
      resolve(result);
    };
    const button = (text: string, action: () => void) => {
      const node = document.createElement("button");
      node.type = "button";
      node.textContent = text;
      node.className =
        text === tr("apply") ? Styles.primaryButton : Styles.secondaryButton;
      node.onclick = action;
      return node;
    };
    close.onclick = () => finish();
    body.append(
      label(tr("mapScene"), scene),
      label(tr("dashboard"), dashboard),
      button(tr("chooseFilters"), async () => {
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
      button(tr("apply"), () => {
        if (!scene.value && !dashboard.value) {
          status.textContent = tr("chooseTarget");
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
      button(tr("cancel"), () => finish())
    );
    if (old)
      body.append(
        button(tr("removeReference"), () =>
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
