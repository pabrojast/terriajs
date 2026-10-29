import { useCallback, useEffect, useRef } from "react";
import Terria from "../../Models/Terria";
import { SimpleDashboardRef } from "../../Models/SimpleDashboard/Types";
import { DashboardView } from "./DashboardView";
/** Same-origin story bridge. Data remains in the viewer; only status is posted. */
export default function DashboardEmbed({
  terria,
  reference
}: {
  terria: Terria;
  reference: SimpleDashboardRef;
}) {
  const request = useRef<string>();
  const status = useRef<{ pending: boolean; error?: string }>({
    pending: true
  });
  const send = useCallback(() => {
    if (request.current && !status.current.pending)
      window.parent.postMessage(
        {
          type: "dashboard:stateApplied",
          version: 1,
          viewId: reference.id,
          requestId: request.current,
          phase: "complete",
          success: !status.current.error,
          error: status.current.error
        },
        location.origin
      );
  }, [reference.id]);
  const onStatus = useCallback(
    (pending: boolean, error?: string) => {
      status.current = { pending, error };
      send();
    },
    [send]
  );
  useEffect(() => {
    const ready = () =>
      window.parent.postMessage(
        {
          type: "dashboard:ready",
          version: 1,
          viewId: reference.id,
          fields: [],
          widgets: []
        },
        location.origin
      );
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== window.parent ||
        event.data?.version !== 1
      )
        return;
      if (event.data.type === "dashboard:hello") ready();
      if (
        event.data.type === "dashboard:applyState" &&
        event.data.viewId === reference.id
      ) {
        request.current = event.data.requestId;
        if (event.data.state?.filters?.length) {
          window.parent.postMessage(
            {
              type: "dashboard:stateApplied",
              version: 1,
              viewId: reference.id,
              requestId: request.current,
              phase: "complete",
              success: false,
              error: "This dashboard uses the filters saved in its revision."
            },
            location.origin
          );
        } else send();
      }
    };
    window.addEventListener("message", receive);
    ready();
    return () => window.removeEventListener("message", receive);
  }, [reference.id, send]);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "white",
        color: "#183c50",
        padding: 20,
        overflow: "auto"
      }}
    >
      <DashboardView
        reference={reference}
        terria={terria}
        onStatus={onStatus}
      />
    </div>
  );
}
