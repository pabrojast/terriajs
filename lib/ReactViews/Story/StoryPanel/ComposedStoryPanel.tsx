import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { observer } from "mobx-react";
import { runInAction } from "mobx";
import styled from "styled-components";
import { useViewState } from "../../Context";
import { storySceneQueue } from "./storyScene";
import { useTranslation } from "react-i18next";
import {
  StoryReference,
  storyComposition,
  storyReadingMode,
  storyPresentation,
  videoEmbedUrl
} from "../../../Models/StoryComposition";
import StoryBody from "./StoryBody";
import StoryDashboardPanel from "../StoryDashboardPanel";

const Reader = styled.section`
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  color: #17364d;
  font-size: 16px;
  line-height: 1.6;
  &,
  * {
    box-sizing: border-box;
  }
  button,
  select {
    font: inherit;
    color: #17364d;
    background: white;
    border: 1px solid #8aa4b6;
    border-radius: 8px;
    min-height: 44px;
    padding: 8px 12px;
    cursor: pointer;
  }
  button:focus-visible,
  select:focus-visible,
  a:focus-visible {
    outline: 3px solid #ffb800;
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  nav {
    flex: 0 0 auto;
    padding: 12px 20px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    background: white;
    pointer-events: auto;
    border-bottom: 1px solid #dce6ec;
    box-shadow: 0 2px 12px #17364d0d;
  }
  nav select {
    max-width: 100%;
    min-width: 0;
  }
  nav select[aria-label="Choose chapter"] {
    flex: 1;
    max-width: 520px;
    min-width: 180px;
    font-weight: 600;
  }
  nav button[aria-pressed="true"] {
    color: white;
    background: #0069aa;
  }
  nav button:hover:not(:disabled) {
    border-color: #0069aa;
    box-shadow: 0 0 0 1px #0069aa;
  }
  .story-composition-columns {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .story-composition-narrative {
    flex: 0 0 var(--narrative-width);
    min-width: 0;
    overflow-y: auto;
    background: white;
    pointer-events: auto;
    padding: clamp(20px, 3vw, 48px);
    scrollbar-gutter: stable;
  }
  .story-composition-narrative article {
    scroll-margin: 12px;
    max-width: 72ch;
    margin-inline: auto;
    overflow-wrap: anywhere;
  }
  .story-composition-narrative h2 {
    margin: 0 0 20px;
    font-size: clamp(24px, 2.2vw, 36px);
    line-height: 1.2;
    letter-spacing: -0.02em;
    color: #005a91;
  }
  .story-composition-narrative article > div {
    padding: 0;
    overflow: visible;
    max-height: none;
  }
  .story-composition-narrative p {
    margin: 0 0 16px;
  }
  .story-composition-narrative p,
  .story-composition-narrative li {
    font-size: 16px;
    line-height: 1.65;
  }
  .story-composition-narrative a {
    color: #0069aa;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .story-composition-narrative article[data-active="false"] {
    border-top: 1px solid #ccd9e2;
    padding-top: 16px;
  }
  &[data-mode="storymap"] .story-composition-narrative article {
    min-height: 55vh;
  }
  .story-composition-visuals {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  .story-composition-map,
  .story-composition-dashboard,
  .story-composition-media {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  .story-composition-dashboard,
  .story-composition-media {
    background: white;
    pointer-events: auto;
    padding: 16px;
    overflow: auto;
    border-left: 1px solid #dce6ec;
  }
  .story-composition-media img,
  .story-composition-media video {
    max-width: 100%;
    max-height: 65vh;
    object-fit: contain;
    display: block;
    margin-inline: auto;
    border-radius: 8px;
  }
  .story-composition-media audio {
    width: 100%;
    max-width: 100%;
  }
  figcaption {
    color: #466173;
    font-size: 14px;
    line-height: 1.5;
    margin-top: 12px;
  }
  .story-composition-media iframe {
    width: 100%;
    height: min(55vh, 480px);
    border: 0;
  }
  figure {
    margin: 0 0 16px;
  }
  [hidden] {
    display: none !important;
  }
  &[data-side="right"] .story-composition-columns {
    flex-direction: row-reverse;
  }
  &[data-layout="full"] .story-composition-narrative {
    flex-basis: 100%;
  }
  .story-composition-status {
    background: #fff2dc;
    padding: 8px;
    pointer-events: auto;
  }
  @media (max-width: 768px) {
    inset: 0;
    .story-composition-columns,
    &[data-side="right"] .story-composition-columns {
      flex-direction: column;
    }
    .story-composition-narrative {
      flex: 1;
      min-height: 0;
    }
    .story-composition-visuals {
      flex: 0 0 48%;
    }
    &[data-layout="full"] .story-composition-narrative {
      flex: 1;
    }
    nav {
      font-size: 13px;
      gap: 6px;
      padding: 8px;
    }
    nav button,
    nav select {
      padding: 6px 8px;
    }
    nav select[aria-label="Choose chapter"] {
      flex-basis: 100%;
      order: -1;
      max-width: none;
    }
    .story-composition-narrative {
      padding: 24px 20px;
    }
    &[data-layout="media"][data-mode="slides"] .story-composition-columns {
      overflow-y: auto;
    }
    &[data-layout="media"][data-mode="slides"] .story-composition-narrative,
    &[data-layout="media"][data-mode="slides"] .story-composition-visuals {
      flex: 0 0 auto;
      overflow: visible;
    }
    &[data-layout="media"][data-mode="slides"] .story-composition-media {
      overflow: visible;
      padding: 0 20px 24px;
      border: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      scroll-behavior: auto !important;
      transition: none !important;
    }
  }
`;

const ComposedStoryPanel = observer(function ComposedStoryPanel() {
  const viewState = useViewState();
  const terria = viewState.terria;
  const stories = terria.stories;
  const index = Math.min(
    Math.max(viewState.currentStoryId, 0),
    stories.length - 1
  );
  const story = stories[index];
  const composition = useMemo(
    () => storyComposition(story?.composition),
    [story?.composition]
  );
  const { t } = useTranslation();
  const manualOnly = stories.some((s) => storyPresentation(s) === "classic");
  const mode = storyReadingMode(stories, terria.storyOptions);
  const [reference, setReference] = useState<StoryReference>();
  const [playing, setPlaying] = useState(false);
  const [mapBusy, setMapBusy] = useState(true);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [sceneError, setError] = useState("");
  const [dashboardError, setDashboardError] = useState("");
  const error = sceneError || dashboardError;
  const [retry, setRetry] = useState(0);
  const [choice, setChoice] = useState<"map" | "dashboard" | "both">(() =>
    innerWidth <= 1440 ? "map" : "both"
  );
  const root = useRef<HTMLElement>(null);
  const narrative = useRef<HTMLDivElement>(null);
  const mapSlot = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const activeParagraph = useRef<Element | null>(null);
  useEffect(() => {
    root.current
      ?.querySelectorAll<HTMLMediaElement>("video, audio")
      .forEach((media) => media.pause());
  }, [index, mode]);
  useEffect(() => {
    const reader = root.current;
    return () =>
      reader
        ?.querySelectorAll<HTMLMediaElement>("video, audio")
        .forEach((media) => media.pause());
  }, []);
  const sceneQueue = storySceneQueue(terria);
  const hasMap = !["full", "dashboard", "media"].includes(composition.layout);
  const dashboard =
    composition.dashboards.find((d) => d.id === reference?.dashboard_id) ||
    composition.dashboards[0];
  const hasDashboard =
    !!dashboard && !["full", "map", "media"].includes(composition.layout);
  const both = hasMap && hasDashboard;
  const effectiveChoice =
    viewState.useSmallScreenInterface && choice === "both" ? "map" : choice;
  const showMap = hasMap && (!both || effectiveChoice !== "dashboard");
  const showDashboard = hasDashboard && (!both || effectiveChoice !== "map");
  const showMedia = composition.layout === "media";
  const go = useCallback(
    (next: number, automatic = false, scroll = true) => {
      if (!automatic) setPlaying(false);
      setReference(undefined);
      activeParagraph.current = null;
      setError("");
      setDashboardError("");
      setDashboardBusy(false);
      runInAction(() => {
        viewState.currentStoryId = Math.max(
          0,
          Math.min(stories.length - 1, next)
        );
      });
      if (scroll && mode === "storymap")
        requestAnimationFrame(() => {
          narrative.current
            ?.querySelector(
              '[data-story-index="' + viewState.currentStoryId + '"]'
            )
            ?.scrollIntoView({ block: "start" });
        });
    },
    [viewState, stories.length, mode]
  );
  const link = useCallback(
    (ref: StoryReference, manual = true) => {
      if (manual) setPlaying(false);
      setError("");
      setDashboardError("");
      if (
        (ref.scene_id && !stories.some((s) => s.id === ref.scene_id)) ||
        (ref.dashboard_id &&
          !composition.dashboards.some((d) => d.id === ref.dashboard_id))
      ) {
        setError(
          "This visualization reference is no longer available. The narrative has been preserved."
        );
        return;
      }
      setReference(ref);
      if (ref.dashboard_id && both) setChoice("dashboard");
    },
    [stories, composition.dashboards, both]
  );
  useEffect(() => {
    const current = ++generation.current;
    const target = reference?.scene_id
      ? stories.find((s) => s.id === reference.scene_id)
      : story;
    if (!target) {
      setError("This scene is no longer available.");
      setPlaying(false);
      setMapBusy(false);
      return;
    }
    if (!hasMap && !reference?.scene_id) {
      setMapBusy(false);
      return;
    }
    setMapBusy(true);
    const timer = window.setTimeout(() => {
      if (current === generation.current) {
        setPlaying(false);
        setError(
          "This map is taking too long to load. Check the data source and retry the scene."
        );
      }
    }, 90000);
    sceneQueue(target)
      .then((applied) => {
        clearTimeout(timer);
        if (current === generation.current && applied) setMapBusy(false);
      })
      .catch((e) => {
        clearTimeout(timer);
        if (current === generation.current) {
          setMapBusy(false);
          setPlaying(false);
          setError(String(e));
        }
      });
    return () => {
      clearTimeout(timer);
      generation.current = current + 1;
    };
  }, [sceneQueue, story, stories, reference?.scene_id, hasMap, retry]);
  const dashboardStatus = useCallback((pending: boolean, failure?: string) => {
    setDashboardBusy(pending);
    setDashboardError(failure || "");
    if (failure) {
      setPlaying(false);
    }
  }, []);
  useEffect(() => {
    if (
      !playing ||
      manualOnly ||
      mode !== "slides" ||
      mapBusy ||
      (hasDashboard && dashboardBusy) ||
      error
    )
      return;
    const timer = window.setTimeout(() => {
      if (index === stories.length - 1) setPlaying(false);
      else go(index + 1, true);
    }, composition.duration * 1000);
    return () => clearTimeout(timer);
  }, [playing, manualOnly, mode, mapBusy, hasDashboard, dashboardBusy, error, index, stories.length, composition.duration, go]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) setPlaying(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (
        (event.target as Element)?.closest?.(
          "input,textarea,select,[contenteditable=true],dialog"
        ) ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.key === "Escape") {
        runInAction(() => {
          viewState.storyShown = false;
        });
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        go(index + (event.key === "ArrowRight" ? 1 : -1));
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", keyboard);
    };
  }, [go, index, viewState]);
  // Resize the existing map into its template slot. Its application and layers stay mounted.
  useLayoutEffect(() => {
    const map = document.querySelector<HTMLElement>("[data-story-map]");
    if (!map) return;
    const previous = map.getAttribute("style");
    const resize = () => {
      const rect = mapSlot.current?.getBoundingClientRect();
      if (!rect || !showMap) map.style.visibility = "hidden";
      else
        Object.assign(map.style, {
          position: "fixed",
          visibility: "visible",
          left: rect.left + "px",
          top: rect.top + "px",
          right: "auto",
          bottom: "auto",
          width: rect.width + "px",
          height: rect.height + "px",
          flex: "none"
        });
      terria.currentViewer.notifyRepaintRequired();
    };
    const observer = new ResizeObserver(resize);
    if (root.current) observer.observe(root.current);
    if (mapSlot.current) observer.observe(mapSlot.current);
    resize();
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      if (previous === null) map.removeAttribute("style");
      else map.setAttribute("style", previous);
      terria.currentViewer.notifyRepaintRequired();
    };
  }, [showMap, composition.text_side, composition.text_width, composition.layout, choice, terria]);
  useEffect(() => {
    const container = narrative.current;
    if (!container) return;
    const read = () => {
      const top =
        container.getBoundingClientRect().top +
        Math.min(100, container.clientHeight * 0.2);
      if (mode === "storymap") {
        const chapters = [
          ...container.querySelectorAll<HTMLElement>("[data-story-index]")
        ];
        const atEnd =
          container.scrollTop > 0 &&
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <=
            4;
        const current = atEnd
          ? chapters[chapters.length - 1]
          : chapters
              .filter((el) => el.getBoundingClientRect().top <= top)
              .pop() || chapters[0];
        if (current && Number(current.dataset.storyIndex) !== index) {
          go(Number(current.dataset.storyIndex), false, false);
          return;
        }
      }
      const active = container.querySelector(
        '[data-story-index="' + index + '"]'
      );
      const anchors = [
        ...(active?.querySelectorAll<HTMLAnchorElement>(
          'a[href^="#story-ref-"]'
        ) || [])
      ];
      const bounds = container.getBoundingClientRect();
      const visibleReferences = anchors.filter((el) => {
        const rect = el.getBoundingClientRect();
        return (
          rect.bottom >= bounds.top &&
          rect.top < bounds.bottom &&
          composition.references.some(
            (r) =>
              r.on_enter && el.getAttribute("href") === "#story-ref-" + r.id
          )
        );
      });
      const anchor =
        visibleReferences
          .filter((el) => el.getBoundingClientRect().top <= top)
          .pop() || visibleReferences[0];
      if (anchor && activeParagraph.current !== anchor) {
        activeParagraph.current = anchor;
        const ref = composition.references.find(
          (r) =>
            r.on_enter && anchor.getAttribute("href") === "#story-ref-" + r.id
        );
        if (ref) link(ref, false);
      }
    };
    container.addEventListener("scroll", read, { passive: true });
    const timer = window.setTimeout(read, 100);
    return () => {
      container.removeEventListener("scroll", read);
      clearTimeout(timer);
    };
  }, [mode, index, composition.references, go, link]);
  if (!story) return null;
  return (
    <Reader
      ref={root}
      aria-label="Story reader"
      data-side={composition.text_side}
      data-layout={composition.layout}
      data-mode={mode}
      style={
        {
          "--narrative-width": composition.text_width + "%"
        } as React.CSSProperties
      }
      onPlayCapture={() => setPlaying(false)}
    >
      <nav aria-label="Story navigation">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          Previous
        </button>
        <select
          aria-label="Choose chapter"
          value={index}
          onChange={(e) => {
            go(Number(e.target.value));
            narrative.current
              ?.querySelector('[data-story-index="' + e.target.value + '"]')
              ?.scrollIntoView({ block: "start" });
          }}
        >
          {stories.map((s, i) => (
            <option key={s.id} value={i}>
              {i + 1}. {s.title}
            </option>
          ))}
        </select>
        <span aria-live="polite">
          {index + 1} / {stories.length}
        </span>
        <button
          type="button"
          disabled={index === stories.length - 1}
          onClick={() => go(index + 1)}
        >
          Next
        </button>
        <select
          aria-label="Reading mode"
          value={mode}
          disabled={manualOnly}
          title={manualOnly ? t("story.mixedManualHelp") : undefined}
          onChange={(e) => {
            setPlaying(false);
            runInAction(() => {
              terria.storyOptions = {
                version: 1,
                displayMode: e.target.value as "slides" | "storymap"
              };
            });
            requestAnimationFrame(() => {
              narrative.current
                ?.querySelector('[data-story-index="' + index + '"]')
                ?.scrollIntoView({ block: "start" });
            });
          }}
        >
          <option value="slides">Slides</option>
          <option value="storymap">Scroll</option>
        </select>
        {mode === "slides" && !manualOnly && (
          <button
            type="button"
            aria-pressed={playing}
            disabled={!!error}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? "Pause" : "Play"}
          </button>
        )}
        {both && (
          <select
            aria-label="Visualization"
            value={effectiveChoice}
            onChange={(e) => {
              setPlaying(false);
              setChoice(e.target.value as typeof choice);
            }}
          >
            <option value="map">Map</option>
            <option value="dashboard">Dashboard</option>
            {!viewState.useSmallScreenInterface && (
              <option value="both">Both</option>
            )}
          </select>
        )}
        <button
          type="button"
          aria-label="Close story"
          title="Close story"
          onClick={() => {
            runInAction(() => {
              viewState.storyShown = false;
            });
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      </nav>
      {manualOnly && (
        <div className="story-composition-status">
          {t("story.mixedManualHelp")}
        </div>
      )}
      {(error || mapBusy || dashboardBusy) && (
        <div
          className="story-composition-status"
          role={error ? "alert" : "status"}
        >
          {error || "Loading visualization…"}
          {error && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setDashboardError("");
                setRetry((n) => n + 1);
              }}
            >
              Retry scene
            </button>
          )}
        </div>
      )}
      <div className="story-composition-columns">
        <div
          className="story-composition-narrative"
          ref={narrative}
          onClickCapture={(event) => {
            const anchor = (event.target as Element).closest(
              'a[href^="#story-ref-"]'
            );
            if (!anchor) return;
            event.preventDefault();
            event.stopPropagation();
            const ref = composition.references.find(
              (r) => anchor.getAttribute("href") === "#story-ref-" + r.id
            );
            if (ref) link(ref);
            else {
              setPlaying(false);
              setError("This narrative reference is no longer available.");
            }
          }}
        >
          {stories.map((s, i) => (
            <article
              key={s.id}
              data-story-index={i}
              data-active={i === index}
              hidden={mode === "slides" && i !== index}
            >
              <h2>{s.title}</h2>
              <StoryBody isCollapsed={false} story={s} terria={terria} />
              {s.composition?.layout !== "media" && (
                <StoryMediaContent
                  media={storyComposition(s.composition).media}
                />
              )}
            </article>
          ))}
        </div>
        <div
          className="story-composition-visuals"
          hidden={composition.layout === "full"}
        >
          <div
            className="story-composition-map"
            ref={mapSlot}
            hidden={!showMap}
          />
          <div className="story-composition-dashboard" hidden={!showDashboard}>
            <StoryDashboardPanel
              key={retry}
              dashboard={hasDashboard ? dashboard : undefined}
              state={
                reference?.dashboard_id === dashboard?.id
                  ? reference?.state
                  : dashboard?.state
              }
              onStatus={dashboardStatus}
            />
          </div>
          {showMedia && (
            <div className="story-composition-media">
              <StoryMediaContent media={composition.media} />
            </div>
          )}
        </div>
      </div>
    </Reader>
  );
});

function StoryMediaContent({
  media
}: {
  media: ReturnType<typeof storyComposition>["media"];
}) {
  return (
    <>
      {media.map((m) => (
        <figure key={m.id}>
          {m.type === "image" ? (
            <img src={m.url} alt={m.alt || ""} />
          ) : videoEmbedUrl(m.url) ? (
            <iframe
              src={videoEmbedUrl(m.url)}
              title={m.title || "Video"}
              allowFullScreen
            />
          ) : /\.(mp3|wav|ogg)(\?|$)/i.test(m.url) ? (
            <audio controls preload="metadata" src={m.url} />
          ) : (
            <video controls playsInline preload="metadata" src={m.url} />
          )}
          <figcaption>{m.title}</figcaption>
        </figure>
      ))}
    </>
  );
}

export default ComposedStoryPanel;
