import i18next from "i18next";
import {
  dashboardState,
  storyComposition,
  storyPresentation,
  storyReadingMode,
  videoEmbedUrl
} from "../../../lib/Models/StoryComposition";
import {
  nativeSceneCoordinator,
  applyStoryScene
} from "../../../lib/ReactViews/Story/StoryPanel/storyScene";
import chooseStoryDashboard from "../../../lib/ReactViews/Story/chooseStoryDashboard";
import { StoryData } from "../../../lib/Models/InitSource";
import Terria from "../../../lib/Models/Terria";
import { runInAction } from "mobx";
import { getShareData } from "../../../lib/ReactViews/Map/Panels/SharePanel/BuildShareLink";

describe("Story compositions", function () {
  const scene = (id: string): StoryData => ({
    id,
    title: id,
    text: "",
    shareData: { version: "8", initSources: [] }
  });
  it("infers legacy chapters and keeps an explicit classic choice with composition metadata", function () {
    expect(storyPresentation()).toBe("classic");
    expect(storyPresentation(scene("old"))).toBe("classic");
    expect(storyPresentation({ composition: storyComposition() })).toBe(
      "composed"
    );
    const classic = {
      presentation: "classic" as const,
      composition: storyComposition()
    };
    expect(storyPresentation(classic)).toBe("classic");
    const options = { version: 1 as const, displayMode: "storymap" as const };
    expect(
      storyReadingMode([classic, { presentation: "composed" }], options)
    ).toBe("slides");
    expect(
      storyReadingMode([{ ...classic, presentation: "composed" }], options)
    ).toBe("storymap");
    expect(options.displayMode).toBe("storymap");
  });
  it("applies captured sources sequentially without replacing the journey", async function () {
    const terria = new Terria({ baseUrl: "./" });
    const apply = spyOn(terria, "applyInitData").and.returnValue(
      Promise.resolve()
    );
    const captured = scene("captured");
    captured.shareData.initSources = [
      {
        stories: [scene("unwanted")],
        storyOptions: { version: 1, displayMode: "storymap" },
        viewerMode: "2d"
      },
      { viewerMode: "3d" }
    ];
    await applyStoryScene(captured, terria);
    expect(apply.calls.allArgs().map(([arg]) => arg.initData)).toEqual([
      { viewerMode: "2d" },
      { viewerMode: "3d" }
    ]);
    expect((captured.shareData.initSources[0] as any).stories.length).toBe(1);
  });
  it("serializes scenes and discards superseded pending navigation", async function () {
    let finish!: () => void;
    const seen: string[] = [];
    const queue = nativeSceneCoordinator(async (s) => {
      seen.push(s.id);
      if (s.id === "a")
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
    });
    const first = queue(scene("a"));
    const second = queue(scene("b"));
    const last = queue(scene("c"));
    expect(await second).toBe(false);
    expect(seen).toEqual(["a"]);
    finish();
    expect(await first).toBe(false);
    expect(await last).toBe(true);
    expect(seen).toEqual(["a", "c"]);
  });
  it("recovers after a failed scene", async function () {
    const queue = nativeSceneCoordinator(async (s) => {
      if (s.id === "bad") throw Error("Unavailable");
    });
    await queue(scene("bad")).then(
      () => fail("Expected failure"),
      (e) => expect(e.message).toBe("Unavailable")
    );
    expect(await queue(scene("good"))).toBe(true);
  });
  it("roundtrips composition and reading mode while keeping scene captures independent", async function () {
    const terria = new Terria({ baseUrl: "./" });
    const story = {
      ...scene("saved"),
      presentation: "classic" as const,
      dimensions: { width: 620, height: 430 },
      position: { x: 200, y: 90, xRatio: 0.6, yRatio: 0.3 },
      composition: { ...storyComposition(), duration: 7 }
    };
    runInAction(() => {
      terria.stories = [story];
      terria.storyOptions = { version: 1, displayMode: "storymap" };
    });
    const shared = JSON.parse(JSON.stringify(getShareData(terria)));
    const restored = new Terria({ baseUrl: "./" });
    for (const initData of shared.initSources)
      await restored.applyInitData({ initData });
    expect(restored.stories[0].composition).toEqual(story.composition);
    expect(restored.stories[0].presentation).toBe("classic");
    expect(restored.stories[0].dimensions).toEqual(story.dimensions);
    expect(restored.stories[0].position).toEqual(story.position);
    expect(restored.storyOptions.displayMode).toBe("storymap");
    const capture = JSON.parse(
      JSON.stringify(
        getShareData(restored, undefined, { includeStories: false })
      )
    );
    expect(capture.initSources[0].stories).toBeUndefined();
    expect(capture.initSources[0].storyOptions).toBeUndefined();
    await restored.applyInitData({ initData: { stories: [scene("legacy")] } });
    expect(restored.stories[0].composition).toBeUndefined();
    expect(restored.storyOptions.displayMode).toBe("slides");
  });
  it("bounds presentation and rejects executable media URLs", function () {
    const defaults = storyComposition();
    expect(defaults.duration).toBe(10);
    const value = storyComposition({
      ...defaults,
      duration: NaN,
      media: [
        {
          id: "image",
          type: "image",
          url: "java" + "script:alert(1)",
          title: ""
        }
      ]
    });
    expect(value.duration).toBe(10);
    expect(value.media).toEqual([]);
    expect(videoEmbedUrl("https://youtube.com/watch?v=abc_123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc_123"
    );
    expect(
      videoEmbedUrl("https://youtube.com.evil.test/embed/abc")
    ).toBeUndefined();
  });
  it("rejects malformed filters and copies valid runtime state", function () {
    expect(() =>
      dashboardState({
        filters: [{ field: "country", op: "between", value: [1] }],
        widgetId: null
      })
    ).toThrow();
    const value = {
      filters: [{ field: "country", op: "in" as const, value: ["Chile"] }],
      widgetId: "records"
    };
    const copied = dashboardState(value);
    expect(copied).toEqual(value);
    expect(copied.filters[0].value).not.toBe(value.filters[0].value);
  });
  it("accepts dashboard selection only from the same-origin picker window", async function () {
    const result = chooseStoryDashboard();
    const dialog = document.querySelector(
      `dialog[aria-label="${i18next.t(
        "story.editor.design.chooseDashboardTitle"
      )}"]`
    )!;
    const frame = dialog.querySelector("iframe")!;
    const dashboard = {
      id: "saved",
      view_id: "70441d68-3fa1-4e54-b7be-f87b6b27f515",
      title: "Records",
      state: { filters: [], widgetId: null }
    };
    const data = {
      type: "ckan-story-dashboard-selected",
      version: 1,
      dashboard
    };
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: window,
        data
      })
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://other.invalid",
        source: frame.contentWindow,
        data
      })
    );
    expect(dialog.isConnected).toBe(true);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: frame.contentWindow,
        data
      })
    );
    expect(await result).toEqual(dashboard);
    expect(dialog.isConnected).toBe(false);
  });
});
