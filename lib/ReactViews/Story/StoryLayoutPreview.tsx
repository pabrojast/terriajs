import { StoryComposition } from "../../Models/StoryComposition";
import Styles from "./story-editor.scss";

/** A schematic, not a second map or an embedded live preview. */
export default function StoryLayoutPreview({
  layout,
  side = "left",
  width = 35
}: {
  layout: StoryComposition["layout"] | "classic";
  side?: "left" | "right";
  width?: number;
}) {
  return (
    <span
      className={Styles.layoutPreview}
      data-layout={layout}
      aria-hidden="true"
      style={{ flexDirection: side === "right" ? "row-reverse" : "row" }}
    >
      <span
        className={Styles.previewText}
        style={{ width: layout === "full" ? "100%" : `${width}%` }}
      >
        <i />
        <i />
        <i />
      </span>
      {layout !== "full" && (
        <span className={Styles.previewVisual}>
          <svg viewBox="0 0 80 40" focusable="false">
            {layout === "dashboard" || layout === "combined" ? (
              <path d="M12 32V19h10v13zm18 0V8h10v24zm18 0V14h10v18z" />
            ) : layout === "media" ? (
              <path d="M8 32 27 10l14 16 11-11 20 17ZM56 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10" />
            ) : (
              <path d="m9 8 18-4 15 8 22-5 7 12-17 14-20-7-14 8L7 21z" />
            )}
          </svg>
        </span>
      )}
    </span>
  );
}
