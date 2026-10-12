import { StoryData } from "../../../Models/InitSource";
import Terria from "../../../Models/Terria";
import {
  Category,
  StoryAction
} from "../../../Core/AnalyticEvents/analyticEvents";
import getPath from "../../../Core/getPath";

/** Latest requested scene wins; applying a native scene never replaces the story document. */
export function nativeSceneCoordinator(
  apply: (scene: StoryData) => Promise<void>
) {
  let running = false;
  let pending:
    | {
        scene: StoryData;
        resolve: (applied: boolean) => void;
        reject: (error: unknown) => void;
      }
    | undefined;
  async function drain() {
    running = true;
    while (pending) {
      const current = pending;
      pending = undefined;
      try {
        await apply(current.scene);
        current.resolve(!pending);
      } catch (error) {
        current.reject(error);
      }
    }
    running = false;
  }
  return (scene: StoryData) =>
    new Promise<boolean>((resolve, reject) => {
      pending?.resolve(false);
      pending = { scene, resolve, reject };
      if (!running) void drain();
    });
}

/** Apply captured map data in order, without replacing the journey being read. */
export async function applyStoryScene(scene: StoryData, terria: Terria) {
  terria.analytics?.logEvent(Category.story, StoryAction.viewScene, scene.id);
  for (const source of scene.shareData?.initSources || []) {
    if (typeof source === "string")
      throw new Error(
        "Capture this scene again before linking it; external initialization files are not a saved scene."
      );
    const { stories: _stories, storyOptions: _options, ...initData } = source;
    await terria.applyInitData({
      initData,
      replaceStratum: true,
      canUnsetFeaturePickingState: true
    });
  }
  terria.workbench.items.forEach((item) => {
    terria.analytics?.logEvent(
      Category.story,
      StoryAction.datasetView,
      getPath(item)
    );
  });
}

// Shared across both readers and close/reopen, so an older load cannot finish last.
const queues = new WeakMap<Terria, ReturnType<typeof nativeSceneCoordinator>>();
export function storySceneQueue(terria: Terria) {
  let queue = queues.get(terria);
  if (!queue) {
    queue = nativeSceneCoordinator((scene) => applyStoryScene(scene, terria));
    queues.set(terria, queue);
  }
  return queue;
}
