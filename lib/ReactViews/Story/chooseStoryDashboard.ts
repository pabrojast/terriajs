import i18next from "i18next";
import createStoryDialog from "./createStoryDialog";
import {
  dashboardState,
  StoryDashboard,
  validStoryId,
  validViewId
} from "../../Models/StoryComposition";
import createGuid from "terriajs-cesium/Source/Core/createGuid";

/** CKAN owns search, session and CSRF. Terria receives only declarative content. */
export default function chooseStoryDashboard(): Promise<
  StoryDashboard | undefined
> {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const { dialog, body, close } = createStoryDialog(
      i18next.t("story.editor.design.chooseDashboardTitle"),
      true
    );
    const frame = document.createElement("iframe");
    frame.title = "Choose a dashboard";
    frame.src = "/story-dashboards/picker";
    const finish = (dashboard?: StoryDashboard) => {
      window.removeEventListener("message", selected);
      dialog.close();
      dialog.remove();
      if (previous instanceof HTMLElement) previous.focus();
      resolve(dashboard);
    };
    function selected(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.contentWindow ||
        event.data?.type !== "ckan-story-dashboard-selected" ||
        event.data.version !== 1
      )
        return;
      const d = event.data.dashboard;
      if (!d || !validViewId(d.view_id)) return;
      try {
        finish({
          id: validStoryId(d.id) ? d.id : createGuid(),
          view_id: d.view_id,
          title: String(d.title || "Dashboard"),
          state: dashboardState(d.state)
        });
      } catch (_) {
        /* The picker keeps invalid selections open for correction. */
      }
    }
    close.onclick = () => finish();
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish();
    });
    window.addEventListener("message", selected);
    body.append(frame);
    document.body.append(dialog);
    dialog.showModal();
  });
}
