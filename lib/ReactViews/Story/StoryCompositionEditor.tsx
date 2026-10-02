import { useState } from "react";
import styled from "styled-components";
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

const Editor = styled.fieldset`
  color: white;
  border: 1px solid #789;
  border-radius: 8px;
  padding: 12px;
  margin: 12px 0;
  label {
    max-width: 100%;
    display: inline-flex;
    flex-direction: column;
    gap: 4px;
    margin: 6px;
  }
  input,
  select,
  button {
    max-width: 100%;
    color: #172e40;
    background: white;
    padding: 8px;
    border: 1px solid #abc;
    border-radius: 4px;
  }
  button {
    cursor: pointer;
    margin: 4px;
  }
  ul {
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
`;
const templates = [
  ["map", "Text + map"],
  ["dashboard", "Text + dashboard"],
  ["combined", "Text + map and dashboard"],
  ["media", "Text + image / multimedia"],
  ["full", "Narrative"],
  ["auto", "Automatic"]
];

export default function StoryCompositionEditor({
  value,
  onChange,
  onReference,
  terria
}: {
  value: StoryComposition;
  onChange: (value: StoryComposition) => void;
  onReference: () => void;
  terria: Terria;
}) {
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"image" | "media">("image");
  const change = (patch: Partial<StoryComposition>) =>
    onChange({ ...value, ...patch });
  const addMedia = (media: StoryMedia) =>
    change({ media: [...value.media, media] });
  async function addDashboard() {
    try {
      const d = await chooseStoryDashboard();
      if (d) change({ dashboards: [...value.dashboards, d] });
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  async function addImage() {
    try {
      const image = await chooseStoryImage(
        terria.configParameters.storyImageLibraryUrl || "/story-images/library"
      );
      if (image)
        addMedia({
          id: createGuid(),
          type: "image",
          url: image.url,
          alt: image.alt,
          title: image.caption
        });
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <Editor>
      <legend>Composition</legend>
      <label>
        Template
        <select
          value={value.layout}
          onChange={(e) =>
            change({ layout: e.target.value as StoryComposition["layout"] })
          }
        >
          {templates.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Text position
        <select
          value={value.text_side}
          onChange={(e) =>
            change({ text_side: e.target.value as "left" | "right" })
          }
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label>
        Text width
        <select
          value={value.text_width}
          onChange={(e) =>
            change({ text_width: Number(e.target.value) as 35 | 50 | 65 })
          }
        >
          <option value="35">One third</option>
          <option value="50">Half</option>
          <option value="65">Two thirds</option>
        </select>
      </label>
      <label>
        Slide duration (seconds)
        <input
          type="number"
          min={1}
          max={600}
          value={value.duration}
          onChange={(e) =>
            change({
              duration: Math.max(1, Math.min(600, Number(e.target.value) || 10))
            })
          }
        />
      </label>
      <div
        aria-label="Template preview"
        style={{
          display: "flex",
          flexDirection: value.text_side === "right" ? "row-reverse" : "row",
          gap: 6,
          height: 65,
          margin: 8
        }}
      >
        <span
          style={{
            background: "#dbeef6",
            color: "#17364d",
            padding: 12,
            width: value.layout === "full" ? "100%" : value.text_width + "%"
          }}
        >
          Narrative
        </span>
        {value.layout !== "full" && (
          <span
            style={{
              background: "#c5e4d5",
              color: "#17364d",
              padding: 12,
              flex: 1
            }}
          >
            {templates
              .find(([id]) => id === value.layout)?.[1]
              .replace("Text + ", "")}
          </span>
        )}
      </div>
      <button type="button" onClick={addDashboard}>
        Choose CKAN dashboard
      </button>
      <button type="button" onClick={onReference}>
        Link selected narrative text
      </button>
      <ul>
        {value.dashboards.map((d, i) => (
          <li key={d.id}>
            <span>{d.title}</span>
            <button
              type="button"
              onClick={() =>
                change({
                  dashboards: value.dashboards.filter((_, j) => j !== i)
                })
              }
            >
              Remove dashboard
            </button>
            <button
              type="button"
              disabled={!i}
              onClick={() => {
                const next = [...value.dashboards];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                change({ dashboards: next });
              }}
            >
              Move up
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={addImage}>
        My images
      </button>
      <label>
        Media type
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "image" | "media")}
        >
          <option value="image">Image</option>
          <option value="media">Video / audio</option>
        </select>
      </label>
      <label>
        Media URL
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <button
        type="button"
        onClick={() => {
          const safe = safeMediaUrl(url);
          if (
            !safe ||
            (kind === "media" &&
              !videoEmbedUrl(safe) &&
              !/\.(mp4|webm|ogg|mp3|wav)(\?|$)/i.test(safe))
          ) {
            setError(
              "Use an image URL, YouTube/Vimeo link or a direct video/audio file."
            );
            return;
          }
          addMedia({ id: createGuid(), type: kind, url: safe, title: "" });
          setUrl("");
          setError("");
        }}
      >
        Add media
      </button>
      <ul>
        {value.media.map((m, i) => (
          <li key={m.id}>
            <span>{m.type}</span>
            <label>
              Caption
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
              <label>
                Alternative text
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
            <button
              type="button"
              onClick={() =>
                change({
                  media: value.media.filter((item) => item.id !== m.id)
                })
              }
            >
              Remove media
            </button>
            <button
              type="button"
              disabled={!i}
              onClick={() => {
                const media = [...value.media];
                [media[i - 1], media[i]] = [media[i], media[i - 1]];
                change({ media });
              }}
            >
              Move up
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </Editor>
  );
}
