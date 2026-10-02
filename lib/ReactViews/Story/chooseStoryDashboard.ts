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
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Choose a dashboard");
    dialog.style.cssText =
      "width:min(960px,95vw);height:90dvh;padding:12px;background:white;border:1px solid #abc;border-radius:8px;z-index:100001";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    const frame = document.createElement("iframe");
    frame.title = "Choose a dashboard";
    frame.src = "/story-dashboards/picker";
    frame.style.cssText = "width:100%;height:calc(100% - 40px);border:0";
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
    dialog.append(close, frame);
    document.body.append(dialog);
    dialog.showModal();
  });
}
