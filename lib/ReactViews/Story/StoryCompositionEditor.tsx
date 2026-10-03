import { useState } from "react";
import { useTranslation } from "react-i18next";
import createGuid from "terriajs-cesium/Source/Core/createGuid";
import Terria from "../../Models/Terria";
import {
  StoryComposition,
  StoryMedia,
  safeMediaUrl,
  videoEmbedUrl
} from "../../Models/StoryComposition";
import { chooseStoryImage } from "../Generic/storyImageLibrary";
import chooseStoryDashboard from "./chooseStoryDashboard";
import StoryLayoutPreview from "./StoryLayoutPreview";
import Styles from "./story-editor.scss";

const templates: StoryComposition["layout"][] = [
  "map",
  "dashboard",
  "combined",
  "media",
  "full",
  "auto"
];

export default function StoryCompositionEditor({
  value,
  onChange,
  onReference,
  terria,
  disabled = false
}: {
  value: StoryComposition;
  onChange: (value: StoryComposition) => void;
  onReference: () => void;
  terria: Terria;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const tr = (key: string) => t(`story.editor.design.${key}`);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"image" | "media">("image");
  const [addingUrl, setAddingUrl] = useState(false);
  const [busy, setBusy] = useState(false);
  const change = (patch: Partial<StoryComposition>) =>
    onChange({ ...value, ...patch });
  const addMedia = (media: StoryMedia) =>
    change({ media: [...value.media, media] });
  async function choose(type: "dashboard" | "image") {
    const trigger = document.activeElement;
    setBusy(true);
    try {
      if (type === "dashboard") {
        const d = await chooseStoryDashboard();
        if (d) change({ dashboards: [...value.dashboards, d] });
      } else {
        const image = await chooseStoryImage(
          terria.configParameters.storyImageLibraryUrl ||
            "/story-images/library"
        );
        if (image)
          addMedia({
            id: createGuid(),
            type: "image",
            url: image.url,
            alt: image.alt,
            title: image.caption
          });
      }
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      // The picker closes before React re-enables its trigger.
      requestAnimationFrame(() => {
        if (trigger instanceof HTMLElement && trigger.isConnected)
          trigger.focus();
      });
    }
  }
  const move = (key: "media" | "dashboards", index: number, offset: number) => {
    if (key === "media") {
      const items = [...value.media];
      [items[index], items[index + offset]] = [
        items[index + offset],
        items[index]
      ];
      change({ media: items });
    } else {
      const items = [...value.dashboards];
      [items[index], items[index + offset]] = [
        items[index + offset],
        items[index]
      ];
      change({ dashboards: items });
    }
  };
  const actions = (key: "media" | "dashboards", index: number) => (
    <div className={Styles.cardActions}>
      <button
        type="button"
        className={Styles.secondaryButton}
        disabled={!index}
        onClick={() => move(key, index, -1)}
      >
        {tr("moveUp")}
      </button>
      <button
        type="button"
        className={Styles.secondaryButton}
        disabled={index === value[key].length - 1}
        onClick={() => move(key, index, 1)}
      >
        {tr("moveDown")}
      </button>
      <button
        type="button"
        className={Styles.secondaryButton}
        onClick={() =>
          key === "media"
            ? change({ media: value.media.filter((_, i) => i !== index) })
            : change({
                dashboards: value.dashboards.filter((_, i) => i !== index)
              })
        }
      >
        {tr("remove")}
      </button>
    </div>
  );
  return (
    <fieldset
      className={Styles.section}
      disabled={disabled || busy}
      aria-label={tr("compositionSettings")}
    >
      <fieldset className={Styles.section}>
        <legend>{tr("layout")}</legend>
        <div className={Styles.templateChoices}>
          {templates.map((layout) => (
            <label
              key={layout}
              className={Styles.choice}
              data-selected={value.layout === layout}
            >
              <input
                type="radio"
                name="story-layout"
                value={layout}
                checked={value.layout === layout}
                onChange={() => change({ layout })}
              />
              <StoryLayoutPreview
                layout={layout}
                side={value.text_side}
                width={value.text_width}
              />
              <strong>{tr(`templates.${layout}`)}</strong>
            </label>
          ))}
        </div>
        {value.layout !== "full" && (
          <div className={Styles.controlGrid}>
            <label className={Styles.control}>
              {tr("textPosition")}
              <select
                value={value.text_side}
                onChange={(e) =>
                  change({ text_side: e.target.value as "left" | "right" })
                }
              >
                <option value="left">{tr("left")}</option>
                <option value="right">{tr("right")}</option>
              </select>
            </label>
            <label className={Styles.control}>
              {tr("textWidth")}
              <select
                value={value.text_width}
                onChange={(e) =>
                  change({ text_width: Number(e.target.value) as 35 | 50 | 65 })
                }
              >
                <option value="35">{tr("third")}</option>
                <option value="50">{tr("half")}</option>
                <option value="65">{tr("twoThirds")}</option>
              </select>
            </label>
          </div>
        )}
      </fieldset>
      <details className={Styles.resourceSection} open>
        <summary>
          {tr("dashboards")} · {value.dashboards.length}
        </summary>
        <div className={Styles.resourceBody}>
          {!value.dashboards.length && (
            <p className={Styles.hint}>{tr("dashboardEmpty")}</p>
          )}
          <ul className={Styles.resourceList}>
            {value.dashboards.map((d, i) => (
              <li key={d.id} className={Styles.resourceCard}>
                <div className={Styles.resourceIdentity}>
                  <span className={Styles.resourceBadge} aria-hidden="true">
                    ▥
                  </span>
                  <div>
                    <h4>{d.title}</h4>
                    <p className={Styles.hint}>
                      {t("story.editor.design.filterCount", {
                        count: d.state.filters.length
                      })}
                    </p>
                  </div>
                </div>
                {actions("dashboards", i)}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={Styles.secondaryButton}
            onClick={() => choose("dashboard")}
          >
            {tr("chooseDashboard")}
          </button>
        </div>
      </details>
      <details className={Styles.resourceSection} open>
        <summary>
          {tr("media")} · {value.media.length}
        </summary>
        <div className={Styles.resourceBody}>
          {!value.media.length && (
            <p className={Styles.hint}>{tr("mediaEmpty")}</p>
          )}
          <ul className={Styles.resourceList}>
            {value.media.map((m, i) => (
              <li key={m.id} className={Styles.resourceCard}>
                <div className={Styles.resourceIdentity}>
                  {m.type === "image" ? (
                    <img
                      src={m.url}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  ) : (
                    <span className={Styles.resourceBadge} aria-hidden="true">
                      ▷
                    </span>
                  )}
                  <h4>
                    {m.title || tr(m.type === "image" ? "image" : "videoAudio")}
                  </h4>
                </div>
                <label className={Styles.control}>
                  {tr("caption")}
                  <input
                    value={m.title}
                    onChange={(e) =>
                      change({
                        media: value.media.map((item) =>
                          item.id === m.id
                            ? { ...item, title: e.target.value }
                            : item
                        )
                      })
                    }
                  />
                </label>
                {m.type === "image" && (
                  <label className={Styles.control}>
                    {tr("alt")}
                    <input
                      value={m.alt || ""}
                      onChange={(e) =>
                        change({
                          media: value.media.map((item) =>
                            item.id === m.id
                              ? { ...item, alt: e.target.value }
                              : item
                          )
                        })
                      }
                    />
                  </label>
                )}
                {actions("media", i)}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={Styles.secondaryButton}
            onClick={() => choose("image")}
          >
            {tr("myImages")}
          </button>
          <button
            type="button"
            className={Styles.secondaryButton}
            aria-expanded={addingUrl}
            onClick={() => setAddingUrl(!addingUrl)}
          >
            {tr("addUrl")}
          </button>
          {addingUrl && (
            <div className={Styles.urlForm}>
              <label className={Styles.control}>
                {tr("mediaType")}
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "image" | "media")}
                >
                  <option value="image">{tr("image")}</option>
                  <option value="media">{tr("videoAudio")}</option>
                </select>
              </label>
              <label className={Styles.control}>
                {tr("mediaUrl")}
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <button
                type="button"
                className={Styles.secondaryButton}
                onClick={() => {
                  const safe = safeMediaUrl(url);
                  if (
                    !url.trim() ||
                    !safe ||
                    (kind === "media" &&
                      !videoEmbedUrl(safe) &&
                      !/\.(mp4|webm|ogg|mp3|wav)(\?|$)/i.test(safe))
                  ) {
                    setError(tr("invalidMedia"));
                    return;
                  }
                  addMedia({
                    id: createGuid(),
                    type: kind,
                    url: safe,
                    title: ""
                  });
                  setUrl("");
                  setError("");
                  setAddingUrl(false);
                }}
              >
                {tr("addMedia")}
              </button>
            </div>
          )}
        </div>
      </details>
      <details className={Styles.resourceSection}>
        <summary>
          {tr("references")} · {value.references.length}
        </summary>
        <div className={Styles.resourceBody}>
          <p className={Styles.hint}>{tr("referenceHint")}</p>
          <button
            type="button"
            className={Styles.secondaryButton}
            onClick={onReference}
          >
            {tr("linkVisualization")}
          </button>
        </div>
      </details>
      <details className={Styles.resourceSection}>
        <summary>{tr("playback")}</summary>
        <div className={Styles.resourceBody}>
          <p className={Styles.hint}>{tr("playbackHint")}</p>
          <label className={Styles.control}>
            {tr("duration")}
            <input
              type="number"
              min={1}
              max={600}
              value={value.duration}
              onChange={(e) =>
                change({
                  duration: Math.max(
                    1,
                    Math.min(600, Number(e.target.value) || 10)
                  )
                })
              }
            />
          </label>
        </div>
      </details>
      {error && (
        <p className={Styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
