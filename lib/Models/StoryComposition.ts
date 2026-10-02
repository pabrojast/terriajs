/** Declarative story content. Dashboard URLs are always derived from CKAN IDs. */
export interface StoryDashboardState {
  filters: {
    field: string;
    op: "eq" | "in" | "gte" | "lte" | "between";
    value: string | number | boolean | (string | number | boolean)[];
  }[];
  widgetId: string | null;
}
export interface StoryDashboard {
  id: string;
  view_id: string;
  title: string;
  state: StoryDashboardState;
}
export interface StoryReference {
  id: string;
  scene_id?: string;
  dashboard_id?: string;
  state: StoryDashboardState;
  on_enter: boolean;
}
export interface StoryMedia {
  id: string;
  type: "image" | "media";
  url: string;
  title: string;
  alt?: string;
}
export interface StoryComposition {
  version: 1;
  layout: "auto" | "full" | "map" | "dashboard" | "combined" | "media";
  text_side: "left" | "right";
  text_width: 35 | 50 | 65;
  duration: number;
  dashboards: StoryDashboard[];
  media: StoryMedia[];
  references: StoryReference[];
}
export interface StoryOptions {
  version: 1;
  displayMode: "storymap" | "slides";
}
export const emptyDashboardState = (): StoryDashboardState => ({
  filters: [],
  widgetId: null
});
export const validViewId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export const validStoryId = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,128}$/.test(value);

export function dashboardState(
  value?: StoryDashboardState
): StoryDashboardState {
  const filters = value?.filters || [];
  const primitive = (v: unknown) =>
    typeof v === "string" ||
    typeof v === "boolean" ||
    (typeof v === "number" && Number.isFinite(v));
  if (
    !Array.isArray(filters) ||
    filters.length > 24 ||
    filters.some((f) => {
      if (
        !f ||
        typeof f.field !== "string" ||
        !["eq", "in", "gte", "lte", "between"].includes(f.op)
      )
        return true;
      const values = ["in", "between"].includes(f.op) ? f.value : [f.value];
      return (
        !Array.isArray(values) ||
        !values.length ||
        values.length > 1000 ||
        (f.op === "between" && values.length !== 2) ||
        values.some((v) => !primitive(v))
      );
    })
  )
    throw new Error(
      "Invalid dashboard filters. Reopen the dashboard chooser to correct them."
    );
  return {
    filters: filters.map((f) => ({
      field: f.field,
      op: f.op,
      value: Array.isArray(f.value) ? [...f.value] : f.value
    })),
    widgetId: validStoryId(value?.widgetId) ? value!.widgetId : null
  };
}

export function storyComposition(value?: StoryComposition): StoryComposition {
  return {
    version: 1,
    layout: ["auto", "full", "map", "dashboard", "combined", "media"].includes(
      value?.layout || ""
    )
      ? value!.layout
      : "map",
    text_side: value?.text_side === "right" ? "right" : "left",
    text_width: [35, 50, 65].includes(value?.text_width || 0)
      ? value!.text_width
      : 35,
    duration:
      Number.isFinite(value?.duration) &&
      value!.duration >= 1 &&
      value!.duration <= 600
        ? value!.duration
        : 10,
    dashboards: Array.isArray(value?.dashboards)
      ? value!.dashboards.filter(
          (d) => d && validViewId(d.view_id) && validStoryId(d.id)
        )
      : [],
    media: Array.isArray(value?.media)
      ? value!.media.filter(
          (m) =>
            m &&
            validStoryId(m.id) &&
            ["image", "media"].includes(m.type) &&
            safeMediaUrl(m.url)
        )
      : [],
    references: Array.isArray(value?.references)
      ? value!.references.filter((r) => r && validStoryId(r.id))
      : []
  };
}

export function safeMediaUrl(value: string): string | undefined {
  try {
    const url = new URL(value, location.origin);
    if (/^https?:$/.test(url.protocol)) return url.href;
  } catch (_) {
    /* Invalid media never becomes an executable URL. */
  }
}

export function videoEmbedUrl(value: string): string | undefined {
  const safe = safeMediaUrl(value);
  if (!safe) return;
  const url = new URL(safe);
  if (url.hostname === "youtu.be")
    return (
      "https://www.youtube-nocookie.com/embed/" +
      encodeURIComponent(url.pathname.slice(1))
    );
  if (
    ["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"].includes(
      url.hostname
    )
  ) {
    const id =
      url.searchParams.get("v") || /^\/embed\/([\w-]+)/.exec(url.pathname)?.[1];
    if (id)
      return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id);
  }
  if (url.hostname === "vimeo.com" && /^\/\d+$/.test(url.pathname))
    return "https://player.vimeo.com/video" + url.pathname;
  if (url.hostname === "player.vimeo.com" && /^\/video\/\d+/.test(url.pathname))
    return url.href;
}
