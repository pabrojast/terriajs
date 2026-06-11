import { runInAction } from "mobx";
import { TerriaErrorSeverity } from "../Core/TerriaError";
import defined from "terriajs-cesium/Source/Core/defined";
import { getShareData } from "../ReactViews/Map/Panels/SharePanel/BuildShareLink";

const updateApplicationOnMessageFromParentWindow = function (terria, window) {
  var allowOrigin;

  window.addEventListener(
    "message",
    async function (event) {
      var origin = event.origin;
      if (!defined(origin) && defined(event.originalEvent)) {
        // For Chrome, the origin property is in the event.originalEvent object.
        origin = event.originalEvent.origin;
      }

      if (
        (!defined(allowOrigin) || origin !== allowOrigin) && // allowed origin in url hash parameter
        event.source !== window.parent && // iframe parent
        event.source !== window.opener
      ) {
        // caller of window.open
        return;
      }

      // receive allowOrigin
      if (
        (event.source === window.opener || event.source === window.parent) &&
        event.data.allowOrigin
      ) {
        allowOrigin = event.data.allowOrigin;
        delete event.data.allowOrigin;
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
        // Scenes posted by a story-map parent never carry stories; drop any
        // left over from an earlier '#share=' hash load so the native story
        // panel can't keep driving the map alongside the parent page.
        if (terria.stories && terria.stories.length) {
          runInAction(() => {
            terria.stories = [];
          });
        }
        const initSources =
          event.data.shareData &&
          Array.isArray(event.data.shareData.initSources)
            ? event.data.shareData.initSources.filter(
                (initSource) => initSource && typeof initSource === "object"
              )
            : [];
        const errors = [];
        for (const initSource of initSources) {
          try {
            await terria.applyInitData({
              initData: initSource,
              replaceStratum: true,
              canUnsetFeaturePickingState: true
            });
          } catch (e) {
            errors.push(e);
          }
        }
        event.source.postMessage(
          {
            type: "sceneApplied",
            requestId: event.data.requestId,
            phase: "complete",
            success: errors.length === 0
          },
          event.origin === "null" ? "*" : event.origin
        );
        if (errors.length > 0) {
          terria.raiseErrorToUser(errors[0]);
        }
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

  if (window.parent !== window) {
    window.parent.postMessage("ready", "*");
  }

  if (window.opener) {
    window.opener.postMessage("ready", "*");
  }
};

export default updateApplicationOnMessageFromParentWindow;
