import { runInAction } from "mobx";
import { TerriaErrorSeverity } from "../Core/TerriaError";
import defined from "terriajs-cesium/Source/Core/defined";
import { getShareData } from "../ReactViews/Map/Panels/SharePanel/BuildShareLink";
import createSceneQueue from "./createSceneQueue";

// The set of origins allowed to send start data to this application: the
// application's own origin, plus any explicitly configured by the operator.
function getAllowedOrigins(terria, window) {
  const allowedOrigins = [];

  // Same-origin is always allowed.
  const selfOrigin = window.location && window.location.origin;
  // Opaque origins are reported as the literal string "null". They cannot be
  // safely allow-listed because unrelated opaque-origin documents share it.
  if (selfOrigin && selfOrigin !== "null") {
    allowedOrigins.push(selfOrigin);
  }

  // Operator-configured cross-origin embedders.
  const configured =
    terria.configParameters &&
    terria.configParameters.parentMessageAllowedOrigins;
  if (Array.isArray(configured)) {
    configured.forEach(function (origin) {
      if (
        typeof origin === "string" &&
        origin !== "null" &&
        allowedOrigins.indexOf(origin) === -1
      ) {
        allowedOrigins.push(origin);
      }
    });
  }

  return allowedOrigins;
}

const updateApplicationOnMessageFromParentWindow = function (terria, window) {
  const allowedOrigins = getAllowedOrigins(terria, window);
  const enqueueScene = createSceneQueue(
    async (event) => {
      if (terria.stories && terria.stories.length) {
        runInAction(() => {
          terria.stories = [];
        });
      }
      const initSources = event.data.shareData?.initSources;
      if (!Array.isArray(initSources)) throw new Error("Invalid scene data");
      for (const initSource of initSources) {
        if (!initSource || typeof initSource !== "object") continue;
        await terria.applyInitData({
          initData: initSource,
          replaceStratum: true,
          canUnsetFeaturePickingState: true
        });
      }
    },
    (event, success, error, superseded) => {
      event.source.postMessage(
        {
          type: "sceneApplied",
          requestId: event.data.requestId,
          phase: "complete",
          success,
          superseded: !!superseded
        },
        event.origin === "null" ? "*" : event.origin
      );
      if (error) terria.raiseErrorToUser(error);
    }
  );

  window.addEventListener(
    "message",
    async function (event) {
      if (!event.data || typeof event.data !== "object") return;
      const origin = event.origin;

      // Require both an allowed origin and the expected window relationship.
      // The source check prevents unrelated windows on an allowed origin from
      // injecting start data.
      if (
        !defined(origin) ||
        allowedOrigins.indexOf(origin) === -1 ||
        (event.source !== window.parent && event.source !== window.opener)
      ) {
        return;
      }

      // Ignore react devtools
      if (/^react-devtools/gi.test(event.data.source)) {
        return;
      }

      // Handle request for share data from parent window
      if (event.data.type === "requestShareData") {
        try {
          const shareData = getShareData(terria, undefined, {
            includeStories: false
          });
          // `getShareData` can return MobX observable arrays/maps nested in the
          // result (e.g. when extra catalog items have been injected). The
          // structured-clone algorithm used by `postMessage` cannot clone those
          // and throws "[object Array] could not be cloned". Round-trip through
          // JSON to get a plain, cloneable object — this matches what
          // `buildShareLink` already does (`JSON.stringify(getShareData(...))`).
          const plainShareData = JSON.parse(JSON.stringify(shareData));
          const response = {
            type: "shareDataResponse",
            requestId: event.data.requestId,
            success: true,
            shareData: plainShareData
          };
          event.source.postMessage(
            response,
            event.origin === "null" ? "*" : event.origin
          );
        } catch (error) {
          const response = {
            type: "shareDataResponse",
            requestId: event.data.requestId,
            success: false,
            error: error.message || "Failed to get share data"
          };
          event.source.postMessage(
            response,
            event.origin === "null" ? "*" : event.origin
          );
        }
        return;
      }

      // Apply a story-map scene (share JSON resolved by the parent page).
      // Unlike the generic start-data path below, each initSource is applied
      // with replaceStratum so layers and settings from the previous scene
      // are replaced instead of merged — same path as the story mode's
      // activateStory (DraggableStoryPanel).
      if (event.data.type === "applyScene") {
        // Ack receipt immediately: applying heavy scenes below can take many
        // seconds, and the parent page uses this ack to detect that the
        // handler exists at all (a slow final-only ack made it fall back to
        // a full '#share=' hash load, popping the native story panel).
        event.source.postMessage(
          {
            type: "sceneApplied",
            requestId: event.data.requestId,
            phase: "received"
          },
          event.origin === "null" ? "*" : event.origin
        );
        enqueueScene(event);
        return;
      }

      (
        await terria.updateFromStartData(
          event.data,
          "Start data from message from parent window",
          TerriaErrorSeverity.Error
        )
      ).raiseError(terria);
    },
    false
  );

  // Tell the parent/opener we are ready to receive start data. Post to each
  // allowed origin explicitly (never "*") so the "ready" signal is only
  // delivered to an intended recipient.
  if (window.parent !== window) {
    allowedOrigins.forEach(function (origin) {
      window.parent.postMessage("ready", origin);
    });
  }

  if (window.opener) {
    allowedOrigins.forEach(function (origin) {
      window.opener.postMessage("ready", origin);
    });
  }
};

export default updateApplicationOnMessageFromParentWindow;
