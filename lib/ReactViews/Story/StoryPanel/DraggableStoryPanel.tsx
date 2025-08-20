import classNames from "classnames";
import { runInAction } from "mobx";
import { observer } from "mobx-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useTranslation } from "react-i18next";
import { useSwipeable, type SwipeableProps } from "react-swipeable";
import { useTheme } from "styled-components";
import {
  Category,
  StoryAction
} from "../../../Core/AnalyticEvents/analyticEvents";
import { animateEnd } from "../../../Core/animation";
import getPath from "../../../Core/getPath";
import TerriaError from "../../../Core/TerriaError";
import Terria from "../../../Models/Terria";
import { StoryData } from "../../../Models/InitSource";
import Box from "../../../Styled/Box";
import { useViewState } from "../../Context";
import { useDraggable } from "../../Drag/useDraggable";
import { onStoryButtonClick } from "../../Map/MenuBar/StoryButton/StoryButton";
import { Story } from "../Story";
import Styles from "../story-panel.scss";
import StoryBody from "./StoryBody";
import FooterBar from "./StoryFooterBar";
import TitleBar from "./TitleBar";

/**
 *
 * @param {any} story
 * @param {Terria} terria
 */
export async function activateStory(scene: Story, terria: Terria) {
  terria.analytics?.logEvent(
    Category.story,
    StoryAction.viewScene,
    JSON.stringify(scene)
  );

  if (scene.shareData) {
    const errors: TerriaError[] = [];
    await Promise.all(
      scene.shareData.initSources.map(async (initSource: any) => {
        try {
          await terria.applyInitData({
            initData: initSource,
            replaceStratum: true,
            canUnsetFeaturePickingState: true
          });
        } catch (e) {
          errors.push(TerriaError.from(e));
        }
      })
    );
    if (errors.length > 0) {
      terria.raiseErrorToUser(
        TerriaError.combine(errors, {
          title: { key: "story.loadSceneErrorTitle" },
          message: {
            key: "story.loadSceneErrorMessage",
            parameters: { title: scene.title ?? scene.id }
          }
        })
      );
    }
  }

  terria.workbench.items.forEach((item) => {
    terria.analytics?.logEvent(
      Category.story,
      StoryAction.datasetView,
      getPath(item)
    );
  });
}

const Swipeable = ({
  children,
  ...props
}: { children: ReactNode } & SwipeableProps) => {
  const handlers = useSwipeable(props);
  return <div {...handlers}>{children}</div>;
};

interface DraggableStoryPanelProps {
  stories: StoryData[];
  currentStoryId: number;
  onStoryChange: (index: number) => void;
  onClose: () => void;
  onActivateStory: (story: Story) => void;
}

const DraggableStoryPanel = observer(
  ({
    stories,
    currentStoryId,
    onStoryChange,
    onClose,
    onActivateStory
  }: DraggableStoryPanelProps) => {
    const viewState = useViewState();
    const theme = useTheme();
    useTranslation();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [inView, setInView] = useState(false);

    const slideRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [dragRef, dragControls] = useDraggable({
      handleSelector: ".story-drag-handle"
    });
    const setRefs = useCallback(
      (el: HTMLDivElement | null) => {
        dragRef(el as unknown as HTMLElement | null);
        panelRef.current = el;
      },
      [dragRef]
    );

    const story = stories[currentStoryId];

    // Save story position and dimensions
    const saveStoryPosition = useCallback(() => {
      if (!panelRef.current || !story) return;

      const element = panelRef.current;
      const rect = element.getBoundingClientRect();
      const transform = element.style.transform;

      // Parse transform translate3d values
      let x = 0,
        y = 0;
      if (transform) {
        const match = transform.match(
          /translate3d\(([^,]+),\s*([^,]+),\s*[^)]+\)/
        );
        if (match) {
          x = parseFloat(match[1]);
          y = parseFloat(match[2]);
        }
      }

      // Update story position in place
      const updatedStory = {
        ...story,
        position: { x, y },
        dimensions: {
          width: rect.width,
          height: rect.height
        }
      };

      // Update the stories array
      runInAction(() => {
        const updatedStories = [...viewState.terria.stories];
        updatedStories[currentStoryId] = updatedStory;
        viewState.terria.stories = updatedStories;
      });
    }, [story, currentStoryId, viewState.terria]);

    // Apply saved position to draggable element
    const applySavedPosition = useCallback(() => {
      if (!panelRef.current) return;

      // If we have a saved position, apply it via the draggable controls
      if (story?.position) {
        const { x, y } = story.position;
        dragControls?.setPosition?.(x, y, true);
        return;
      }

      // No saved position: place the panel near the right side by default,
      // leaving a 400px gap (to avoid overlapping right-side UI).
      try {
        const RIGHT_GAP = 400;
        const el = panelRef.current;
        const rect = el.getBoundingClientRect();
        const viewportWidth =
          window.innerWidth || document.documentElement.clientWidth;
        const x = Math.max(0, viewportWidth - RIGHT_GAP - rect.width);
        const y = 0; // relative to wrapper's top (which is already offset by 70px)
        dragControls?.setPosition?.(x, y, true);
      } catch {
        // Fallback: do nothing if measurement fails
      }
    }, [dragControls, story?.position]);

    // Set up drag end handler to save position
    useEffect(() => {
      if (!panelRef.current) return;

      const handleDragEnd = () => {
        saveStoryPosition();
      };

      // Listen for mouseup and touchend on document to catch drag end
      const handleMouseUp = () => handleDragEnd();
      const handleTouchEnd = () => handleDragEnd();

      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchend", handleTouchEnd);

      return () => {
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("touchend", handleTouchEnd);
      };
    }, [saveStoryPosition]);

    // Apply saved position when story changes
    useEffect(() => {
      applySavedPosition();
    }, [applySavedPosition, currentStoryId]);

    // Apply saved dimensions
    useEffect(() => {
      if (!panelRef.current || !story?.dimensions) return;

      const element = panelRef.current;
      const { width, height } = story.dimensions;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.minHeight = `${Math.max(200, height)}px`;
    }, [story?.dimensions]);

    // Observe size changes to persist dimensions
    useEffect(() => {
      if (!panelRef.current) return;
      const element = panelRef.current;
      if (typeof ResizeObserver === "undefined") return;

      let resizeTimeout: NodeJS.Timeout | undefined;
      const ro = new ResizeObserver(() => {
        // Debounce to avoid too many saves while resizing
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          saveStoryPosition();
        }, 100);
      });

      ro.observe(element);
      return () => {
        ro.disconnect();
        if (resizeTimeout) clearTimeout(resizeTimeout);
      };
    }, [saveStoryPosition]);

    const slideIn = useCallback(() => {
      setInView(true);
    }, []);

    const slideOut = useCallback(() => {
      setInView(false);
    }, []);

    const toggleCollapse = useCallback(() => {
      setIsCollapsed(!isCollapsed);
    }, [isCollapsed]);

    const onClickContainer = useCallback(() => {
      runInAction(() => {
        viewState.topElement = "StoryPanel";
      });
    }, [viewState]);

    const navigateStory = useCallback(
      (index: number) => {
        let newIndex = index;
        if (newIndex < 0) {
          newIndex = stories.length - 1;
        } else if (newIndex >= stories.length) {
          newIndex = 0;
        }
        if (newIndex !== currentStoryId) {
          onStoryChange(newIndex);
          if (newIndex < stories.length) {
            onActivateStory(stories[newIndex]);
          }
        }
      },
      [stories, currentStoryId, onStoryChange, onActivateStory]
    );

    const goToPrevStory = useCallback(() => {
      navigateStory(currentStoryId - 1);
    }, [navigateStory, currentStoryId]);

    const goToNextStory = useCallback(() => {
      navigateStory(currentStoryId + 1);
    }, [navigateStory, currentStoryId]);

    const exitStory = useCallback(() => {
      animateEnd(slideRef.current).finally(() => {
        onClose();
        viewState.terria.currentViewer.notifyRepaintRequired();
      });
      slideOut();
    }, [onClose, viewState.terria, slideOut]);

    const onCenterScene = useCallback(
      (story: Story) => {
        onActivateStory(story);
      },
      [onActivateStory]
    );

    // Set up keyboard listeners
    useEffect(() => {
      const keydownListener = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          exitStory();
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          if (currentStoryId + 1 !== stories.length) {
            goToNextStory();
          }
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          if (currentStoryId !== 0) {
            goToPrevStory();
          }
        }
      };

      window.addEventListener("keydown", keydownListener, true);
      return () => {
        window.removeEventListener("keydown", keydownListener, true);
      };
    }, [
      exitStory,
      goToNextStory,
      goToPrevStory,
      currentStoryId,
      stories.length
    ]);

    // Slide in on mount
    useEffect(() => {
      slideIn();
    }, [slideIn]);

    if (!story) return null;

    return (
      <Swipeable onSwipedLeft={goToNextStory} onSwipedRight={goToPrevStory}>
        <Box
          className={classNames(
            viewState.topElement === "StoryPanel" ? "top-element" : ""
          )}
          position="absolute"
          onClick={onClickContainer}
          css={`
            top: 70px;
            left: 0;
            width: 100%;
            pointer-events: none;
            z-index: 99999;
            ${!viewState.storyShown && "display: none;"}
          `}
        >
          <Box
            ref={setRefs}
            column
            rounded
            className={classNames(Styles.storyContainer, {
              [Styles.isMounted]: inView
            })}
            key={story.id}
            css={`
              position: relative;
              display: flex;
              flex-direction: column;
              width: 400px;
              max-width: 800px;
              min-width: 300px;
              max-height: 80vh;
              border-radius: 6px;
              overflow: hidden;
              pointer-events: auto;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
              cursor: move;
              resize: both;
              min-height: 200px;
              direction: ltr;

              /* Style the resize handle */
              &::-webkit-resizer {
                background: transparent;
              }

              /* Add a custom resize corner indicator */
              &::after {
                content: "";
                position: absolute;
                bottom: 0;
                right: 0;
                width: 15px;
                height: 15px;
                cursor: nwse-resize;
                background: linear-gradient(
                  135deg,
                  transparent 50%,
                  rgba(255, 255, 255, 0.5) 50%,
                  rgba(255, 255, 255, 0.5) 60%,
                  transparent 60%,
                  transparent 70%,
                  rgba(255, 255, 255, 0.5) 70%,
                  rgba(255, 255, 255, 0.5) 80%,
                  transparent 80%
                );
                pointer-events: none;
              }
            `}
          >
            <Box
              backgroundColor={theme.dark}
              paddedRatio={3}
              column
              className="story-drag-handle"
              css={`
                color: white;
                cursor: move;
                user-select: none;
              `}
            >
              <TitleBar
                title={story.title}
                isCollapsed={isCollapsed}
                collapseHandler={toggleCollapse}
                closeHandler={exitStory}
              />
            </Box>
            <Box
              css={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                backdropFilter: theme.blur,
                overflow: "auto",
                flex: 1
              }}
            >
              <StoryBody isCollapsed={isCollapsed} story={story} />
            </Box>
            <Box
              backgroundColor={theme.dark}
              css={{ color: "white" }}
              paddedHorizontally={3}
              fullWidth
            >
              <FooterBar
                goPrev={goToPrevStory}
                goNext={goToNextStory}
                jumpToStory={navigateStory}
                zoomTo={() => onCenterScene(story)}
                currentHumanIndex={currentStoryId + 1}
                totalStories={stories.length}
                listStories={() => {
                  runInAction(() => {
                    viewState.storyShown = false;
                  });
                  onStoryButtonClick({
                    terria: viewState.terria,
                    theme: theme,
                    viewState: viewState,
                    animationDuration: 250
                  })();
                }}
              />
            </Box>
          </Box>
        </Box>
      </Swipeable>
    );
  }
);

export default DraggableStoryPanel;
