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
