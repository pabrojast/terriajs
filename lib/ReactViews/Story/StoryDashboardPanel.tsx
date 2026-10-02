import { useEffect, useRef, useState } from "react";
import {
  dashboardState,
  StoryDashboard,
  StoryDashboardState
} from "../../Models/StoryComposition";

function DashboardFrame({
  dashboard,
  state,
  active,
  onStatus
}: {
  dashboard: StoryDashboard;
  state: StoryDashboardState;
  active: boolean;
  onStatus: (pending: boolean, error?: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    if (!active) return;
    const requestId =
      "native-story-" + dashboard.view_id + "-" + ++request.current;
    onStatus(true);
    setError("");
    function fail(message: string) {
      setError(message);
      onStatus(false, message);
    }
    const timer = window.setTimeout(
      () =>
        fail("Dashboard unavailable or still loading. Check access and retry."),
      30000
    );
    function message(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.version !== 1 ||
        event.data.viewId !== dashboard.view_id
      )
        return;
      if (event.data.type === "dashboard:ready") setReady(true);
      if (
        event.data.type === "dashboard:stateApplied" &&
        event.data.requestId === requestId &&
        event.data.phase === "complete" &&
        !event.data.superseded
      ) {
        clearTimeout(timer);
        if (event.data.success) onStatus(false);
        else
          fail(
            String(
              event.data.error || "Dashboard filters could not be applied."
            )
          );
      }
    }
    window.addEventListener("message", message);
    try {
      if (ready)
        frame.current?.contentWindow?.postMessage(
          {
            type: "dashboard:applyState",
            version: 1,
            viewId: dashboard.view_id,
            requestId,
            state: dashboardState(state)
          },
          location.origin
        );
      else
        frame.current?.contentWindow?.postMessage(
          { type: "dashboard:hello", version: 1 },
          location.origin
        );
    } catch (e) {
      clearTimeout(timer);
      fail(String(e));
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", message);
    };
  }, [active, ready, retry, dashboard.view_id, state, onStatus]);
  return (
    <div
      hidden={!active}
      style={{
        height: "100%",
        display: active ? "flex" : "none",
        flexDirection: "column",
        minHeight: 0
      }}
    >
      <div>
        <a
          href={"/dashboard/" + dashboard.view_id}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open dashboard
        </a>{" "}
        <button
          type="button"
          onClick={() => {
            setReady(false);
            setRetry((n) => n + 1);
          }}
        >
          Retry
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <iframe
        key={retry}
        ref={frame}
        title={dashboard.title}
        src={"/dashboard/" + dashboard.view_id + "/embed"}
        allowFullScreen
        style={{ width: "100%", flex: 1, minHeight: 0, border: 0 }}
        onLoad={() =>
          frame.current?.contentWindow?.postMessage(
            { type: "dashboard:hello", version: 1 },
            location.origin
          )
        }
      />
    </div>
  );
}

export default function StoryDashboardPanel({
  dashboard,
  state,
  onStatus
}: {
  dashboard?: StoryDashboard;
  state?: StoryDashboardState;
  onStatus: (pending: boolean, error?: string) => void;
}) {
  const [cache, setCache] = useState<StoryDashboard[]>([]);
  useEffect(() => {
    if (dashboard)
      setCache((old) =>
        [
          ...old.filter((d) => d.view_id !== dashboard.view_id),
          dashboard
        ].slice(-3)
      );
    else onStatus(false);
  }, [dashboard, onStatus]);
  return (
    <>
      {cache.map((d) => (
        <DashboardFrame
          key={d.view_id}
          dashboard={d}
          state={
            d.view_id === dashboard?.view_id
              ? state || dashboard.state
              : d.state
          }
          active={d.view_id === dashboard?.view_id}
          onStatus={onStatus}
        />
      ))}
    </>
  );
}
