import { useEffect, useCallback } from "react";
import { runInAction } from "mobx";
import { observer } from "mobx-react";
import TerriaError from "../../../Core/TerriaError";
import { StoryData } from "../../../Models/InitSource";
import { storyPresentation } from "../../../Models/StoryComposition";
import { useViewState } from "../../Context";
import ComposedStoryPanel from "./ComposedStoryPanel";
import DraggableStoryPanel from "./DraggableStoryPanel";
import { storySceneQueue } from "./storyScene";

const StoryPanel = observer(function StoryPanel() {
  const viewState = useViewState();
  const terria = viewState.terria;
  const stories = terria.stories;
  const index = Math.max(
    0,
    Math.min(viewState.currentStoryId, stories.length - 1)
  );
  const story = stories[index];
  const presentation = storyPresentation(story);
  const queue = storySceneQueue(terria);
  const activate = useCallback(
    (scene: StoryData) => {
      void queue(scene).catch((error) =>
        terria.raiseErrorToUser(TerriaError.from(error))
      );
    },
    [queue, terria]
  );

  useEffect(() => {
    const previous = viewState.isMapFullScreen;
    viewState.setIsMapFullScreen(true);
    return () => {
      viewState.setIsMapFullScreen(previous);
    };
  }, [viewState]);
  useEffect(() => {
    runInAction(() => {
      viewState.currentStoryId = index;
    });
  }, [index, viewState]);
  // Geometry edits do not reload a map. The composed reader owns its references.
  useEffect(() => {
    if (presentation === "classic" && story) activate(story);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activate, presentation, story?.id, story?.shareData]);

  if (!story) return null;
  if (presentation === "composed") return <ComposedStoryPanel />;
  return (
    <DraggableStoryPanel
      key={story.id}
      stories={stories}
      currentStoryId={index}
      onStoryChange={(next) => {
        runInAction(() => {
          viewState.currentStoryId = next;
        });
      }}
      onClose={() => {
        runInAction(() => {
          viewState.storyShown = false;
        });
      }}
      onActivateStory={activate}
    />
  );
});

export default StoryPanel;
