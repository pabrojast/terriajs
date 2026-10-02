import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { runInAction } from "mobx";
import Terria from "../../../../lib/Models/Terria";
import ViewState from "../../../../lib/ReactViewModels/ViewState";
import { StoryData } from "../../../../lib/Models/InitSource";
import { storyComposition } from "../../../../lib/Models/StoryComposition";
import { ViewStateProvider } from "../../../../lib/ReactViews/Context";
import { terriaTheme } from "../../../../lib/ReactViews/StandardUserInterface";
import StoryPanel from "../../../../lib/ReactViews/Story/StoryPanel/StoryPanel";

describe("Mixed story readers", function () {
  let terria: Terria;
  let viewState: ViewState;
  let container: HTMLDivElement;
  let root: Root;
  const chapter = (id: string, composed = false): StoryData => ({
    id,
    title: id,
    text: "<p>Chapter text</p>",
    ...(composed ? { composition: storyComposition() } : {}),
    shareData: { version: "8", initSources: [{ viewerMode: "2d" }] },
    position: { x: 30, y: 20 },
    dimensions: { width: 600, height: 420 }
  });
  beforeEach(function () {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    terria = new Terria({ baseUrl: "./" });
    viewState = new ViewState({ terria, catalogSearchProvider: undefined });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    runInAction(() => {
      terria.stories = [
        chapter("classic"),
        chapter("composed", true),
        chapter("classic-again")
      ];
      terria.storyOptions = { version: 1, displayMode: "storymap" };
      viewState.storyShown = true;
    });
  });
  afterEach(function () {
    act(() => root.unmount());
    container.remove();
    viewState.dispose();
  });
  const mount = async () =>
    act(async () => {
      root.render(
        <ThemeProvider theme={terriaTheme}>
          <ViewStateProvider viewState={viewState}>
            <StoryPanel />
          </ViewStateProvider>
        </ThemeProvider>
      );
    });
  it("selects each reader, applies each chapter once and restores the full map", async function () {
    const apply = spyOn(terria, "applyInitData").and.returnValue(
      Promise.resolve()
    );
    const map = document.createElement("div");
    map.dataset.storyMap = "";
    map.style.width = "100%";
    container.appendChild(map);
    // Keep the map outside React's root so transitions can restore its styles.
    document.body.appendChild(map);
    try {
      await mount();
      expect(
        container.querySelector('[aria-label="Story window"]')
      ).not.toBeNull();
      expect(apply.calls.count()).toBe(1);
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight" })
        );
      });
      expect(viewState.currentStoryId).toBe(1);
      expect(
        container.querySelector('[aria-label="Story reader"]')
      ).not.toBeNull();
      expect(apply.calls.count()).toBe(2);
      const mode = container.querySelector<HTMLSelectElement>(
        '[aria-label="Reading mode"]'
      )!;
      expect(mode.value).toBe("slides");
      expect(mode.disabled).toBe(true);
      expect(terria.storyOptions.displayMode).toBe("storymap");
      expect(container.querySelector("[aria-pressed]")).toBeNull();
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight" })
        );
      });
      expect(viewState.currentStoryId).toBe(2);
      expect(
        container.querySelector('[aria-label="Story window"]')
      ).not.toBeNull();
      expect(apply.calls.count()).toBe(3);
      expect(map.style.width).toBe("100%");
      expect(map.style.position).toBe("");
      expect(viewState.isMapFullScreen).toBe(true);
      act(() => root.unmount());
      expect(viewState.isMapFullScreen).toBe(false);
      root = createRoot(container);
    } finally {
      map.remove();
    }
  });
  it("does not persist viewport changes, layout observations or unrelated pointer releases", async function () {
    spyOn(terria, "applyInitData").and.returnValue(Promise.resolve());
    await mount();
    const before = JSON.stringify(terria.stories[0]);
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      document.dispatchEvent(new PointerEvent("pointerup"));
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(JSON.stringify(terria.stories[0])).toBe(before);
  });
  it("does not navigate when a touch gesture moves the title bar", async function () {
    spyOn(terria, "applyInitData").and.returnValue(Promise.resolve());
    await mount();
    const swipe = async (target: Element) =>
      act(async () => {
        const touch = (x: number) =>
          new Touch({ identifier: 1, target, clientX: x, clientY: 80 });
        target.dispatchEvent(
          new TouchEvent("touchstart", {
            bubbles: true,
            touches: [touch(200)],
            changedTouches: [touch(200)]
          })
        );
        target.dispatchEvent(
          new TouchEvent("touchmove", {
            bubbles: true,
            touches: [touch(100)],
            changedTouches: [touch(100)]
          })
        );
        target.dispatchEvent(
          new TouchEvent("touchend", {
            bubbles: true,
            touches: [],
            changedTouches: [touch(100)]
          })
        );
      });
    await swipe(container.querySelector(".story-drag-handle")!);
    expect(viewState.currentStoryId).toBe(0);
    await swipe(container.querySelector("p")!);
    expect(viewState.currentStoryId).toBe(1);
  });
  it("keeps scene loads serialized when switching from classic through composed back to classic", async function () {
    let finish!: () => void;
    const apply = spyOn(terria, "applyInitData").and.callFake(() => {
      if (apply.calls.count() === 1)
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      return Promise.resolve();
    });
    await mount();
    await act(async () => {
      runInAction(() => {
        viewState.currentStoryId = 1;
      });
    });
    await act(async () => {
      runInAction(() => {
        viewState.currentStoryId = 2;
      });
    });
    expect(apply.calls.count()).toBe(1);
    await act(async () => {
      finish();
    });
    expect(apply.calls.count()).toBe(2);
    expect(
      container.querySelector('[aria-label="Story window"]')
    ).not.toBeNull();
  });
});
