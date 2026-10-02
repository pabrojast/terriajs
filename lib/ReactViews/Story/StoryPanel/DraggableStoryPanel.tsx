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
import { StoryData } from "../../../Models/InitSource";
import Box from "../../../Styled/Box";
import { useViewState } from "../../Context";
import { useDraggable } from "../../Drag/useDraggable";
import { onStoryButtonClick } from "../../Map/MenuBar/StoryButton/StoryButton";
import Styles from "../story-panel.scss";
import StoryBody from "./StoryBody";
import FooterBar from "./StoryFooterBar";
import TitleBar from "./TitleBar";

const DRAG_MARGIN = 8;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const parseTranslate = (transform?: string | null) => {
  if (!transform) return { x: 0, y: 0 };

  const translate3d = transform.match(
    /translate3d\(([^,]+),\s*([^,]+),\s*[^)]+\)/
  );
  if (translate3d) {
    const x = parseFloat(translate3d[1]);
    const y = parseFloat(translate3d[2]);
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0
    };
  }

  const translate2d = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
  if (translate2d) {
    const x = parseFloat(translate2d[1]);
    const y = parseFloat(translate2d[2]);
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0
    };
  }

  return { x: 0, y: 0 };
};

const getViewportSize = () => {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const height =
    window.innerHeight || document.documentElement.clientHeight || 0;
  return { width, height };
};

const getDragBounds = (element: HTMLElement, dx: number, dy: number) => {
  const rect = element.getBoundingClientRect();
  const { width: viewportWidth, height: viewportHeight } = getViewportSize();
  if (!viewportWidth || !viewportHeight) return null;

  const baseLeft = rect.left - dx;
  const baseTop = rect.top - dy;

  return {
    minAllowedDx: DRAG_MARGIN - baseLeft,
    maxAllowedDx: viewportWidth - DRAG_MARGIN - rect.width - baseLeft,
    minAllowedDy: DRAG_MARGIN - baseTop,
    maxAllowedDy: viewportHeight - DRAG_MARGIN - rect.height - baseTop
  };
};

const getRelativePosition = (
  dx: number,
  dy: number,
  bounds: NonNullable<ReturnType<typeof getDragBounds>>
) => {
  const rangeX = bounds.maxAllowedDx - bounds.minAllowedDx;
  const rangeY = bounds.maxAllowedDy - bounds.minAllowedDy;
  const xRatio = rangeX > 0 ? (dx - bounds.minAllowedDx) / rangeX : 0;
  const yRatio = rangeY > 0 ? (dy - bounds.minAllowedDy) / rangeY : 0;
  return {
    xRatio: clamp01(xRatio),
    yRatio: clamp01(yRatio)
  };
};

const getPositionFromRelative = (
  bounds: NonNullable<ReturnType<typeof getDragBounds>>,
  xRatio: number,
  yRatio: number
) => {
  const rangeX = bounds.maxAllowedDx - bounds.minAllowedDx;
  const rangeY = bounds.maxAllowedDy - bounds.minAllowedDy;
  return {
    x:
      rangeX > 0
        ? bounds.minAllowedDx + clamp01(xRatio) * rangeX
        : bounds.maxAllowedDx,
    y:
      rangeY > 0
        ? bounds.minAllowedDy + clamp01(yRatio) * rangeY
        : bounds.maxAllowedDy
  };
};

const Swipeable = ({
  children,
  ...props
}: { children: ReactNode } & SwipeableProps) => {
  const handlers = useSwipeable({
    ...props,
    onSwiped: (data) => {
      // Moving the window or using a control is not chapter navigation.
      if (
        (data.event.target as Element)?.closest?.(
          ".story-drag-handle,button,a,input,select,textarea"
        )
      )
        return;
      if (data.dir === "Left") props.onSwipedLeft?.(data);
      if (data.dir === "Right") props.onSwipedRight?.(data);
    },
    onSwipedLeft: undefined,
    onSwipedRight: undefined
  });
  return <div {...handlers}>{children}</div>;
};

interface DraggableStoryPanelProps {
  stories: StoryData[];
  currentStoryId: number;
  onStoryChange: (index: number) => void;
  onClose: () => void;
  onActivateStory: (story: StoryData) => void;
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

    // Persist only a completed user gesture, never viewport constraints.
    const saveStoryPosition = useCallback(
      (resize: boolean) => {
        if (!panelRef.current) return;

        const currentStory = viewState.terria.stories[currentStoryId];
        if (!currentStory) return;

        const element = panelRef.current;
        const rect = element.getBoundingClientRect();
        const { x, y } = parseTranslate(element.style.transform);
        const bounds = getDragBounds(element, x, y);
        const relative = bounds ? getRelativePosition(x, y, bounds) : undefined;

        // Update story position in place
        const updatedStory = {
          ...currentStory,
          position: {
            x,
            y,
            ...(relative ? relative : {})
          },
          dimensions: resize
            ? {
                width: rect.width,
                height: rect.height
              }
            : currentStory.dimensions
        };

        // Update the stories array
        runInAction(() => {
          const updatedStories = [...viewState.terria.stories];
          updatedStories[currentStoryId] = updatedStory;
          viewState.terria.stories = updatedStories;
        });
      },
      [currentStoryId, viewState.terria]
    );

    // Apply saved position to draggable element
    const applySavedPosition = useCallback(() => {
      if (!panelRef.current) return;

      // If we have a saved position, apply it via the draggable controls
      if (story?.position) {
        const { x, y, xRatio, yRatio } = story.position;
        if (
          Number.isFinite(xRatio) &&
          Number.isFinite(yRatio) &&
          panelRef.current
        ) {
          const { x: currentX, y: currentY } = parseTranslate(
            panelRef.current.style.transform
          );
          const bounds = getDragBounds(panelRef.current, currentX, currentY);
          if (bounds) {
            const nextPosition = getPositionFromRelative(
              bounds,
              xRatio as number,
              yRatio as number
            );
            dragControls?.setPosition?.(nextPosition.x, nextPosition.y, true);
            return;
          }
        }
        if (Number.isFinite(x) && Number.isFinite(y)) {
          dragControls?.setPosition?.(x, y, true);
          return;
        }
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

    // CSS resize and title-bar drag both finish on pointer release. Unrelated
    // clicks, collapse and responsive layout must not change saved geometry.
    useEffect(() => {
      const element = panelRef.current;
      if (!element) return;
      let start:
        | { width: number; height: number; transform: string; resize: boolean }
        | undefined;
      let frame: number | undefined;
      const down = (event: PointerEvent) => {
        if (
          event.button !== 0 ||
          (event.target as Element).closest("button,a,input,select,textarea")
        )
          return;
        const rect = element.getBoundingClientRect();
        const resize =
          event.clientX >= rect.right - 24 && event.clientY >= rect.bottom - 24;
        if (!resize && !(event.target as Element).closest(".story-drag-handle"))
          return;
        start = {
          width: rect.width,
          height: rect.height,
          transform: element.style.transform,
          resize
        };
      };
      const up = () => {
        const initial = start;
        start = undefined;
        if (!initial) return;
        frame = requestAnimationFrame(() => {
          const rect = element.getBoundingClientRect();
          const resized =
            initial.resize &&
            (rect.width !== initial.width || rect.height !== initial.height);
          if (resized || element.style.transform !== initial.transform)
            saveStoryPosition(resized);
        });
      };
      const cancel = () => {
        start = undefined;
      };
      element.addEventListener("pointerdown", down);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", cancel);
      return () => {
        element.removeEventListener("pointerdown", down);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", cancel);
        if (frame !== undefined) cancelAnimationFrame(frame);
      };
    }, [saveStoryPosition]);

    // Apply requested dimensions before calculating relative position. CSS only
    // constrains the visible size on small screens; desktop preferences survive.
    useEffect(() => {
      const element = panelRef.current;
      if (!element) return;
      if (story?.dimensions) {
        element.style.width = `${story.dimensions.width}px`;
        element.style.height = `${story.dimensions.height}px`;
      }
      applySavedPosition();
      const resize = () => applySavedPosition();
      window.addEventListener("resize", resize);
      const observer = new ResizeObserver(() =>
        dragControls.constrainToBounds()
      );
      observer.observe(element);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", resize);
      };
    }, [applySavedPosition, dragControls, story?.dimensions]);

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
        }
      },
      [stories, currentStoryId, onStoryChange]
    );

    const goToPrevStory = useCallback(() => {
      navigateStory(currentStoryId - 1);
    }, [navigateStory, currentStoryId]);

    const goToNextStory = useCallback(() => {
      navigateStory(currentStoryId + 1);
    }, [navigateStory, currentStoryId]);

    const exitStory = useCallback(() => {
      slideOut();
      onClose();
      viewState.terria.currentViewer.notifyRepaintRequired();
    }, [onClose, viewState.terria, slideOut]);

    const onCenterScene = useCallback(
      (story: StoryData) => {
        onActivateStory(story);
      },
      [onActivateStory]
    );

    // Set up keyboard listeners
    useEffect(() => {
      const keydownListener = (e: KeyboardEvent) => {
        if (
          (e.target as Element)?.closest?.(
            "input,textarea,select,[contenteditable=true],dialog"
          ) ||
          e.altKey ||
          e.ctrlKey ||
          e.metaKey
        )
          return;
        if (
          [
            "Escape",
            "ArrowRight",
            "ArrowDown",
            "ArrowLeft",
            "ArrowUp"
          ].includes(e.key)
        )
          e.preventDefault();
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
            role="region"
            aria-label="Story window"
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
              max-width: min(800px, calc(100vw - 16px));
              min-width: min(300px, calc(100vw - 16px));
              max-height: calc(100dvh - 86px);
              border-radius: 6px;
              overflow: hidden;
              pointer-events: auto;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
              cursor: auto;
              transition: opacity 0.2s;
              resize: both;
              min-height: min(200px, calc(100dvh - 86px));
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
                touch-action: none;
                flex-shrink: 0;
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
                minHeight: 0,
                flex: 1
              }}
            >
              <StoryBody
                isCollapsed={isCollapsed}
                story={story}
                terria={viewState.terria}
              />
            </Box>
            <Box
              backgroundColor={theme.dark}
              css={{ color: "white", flexShrink: 0 }}
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
