import classNames from "classnames";
import {
  RefObject,
  MouseEventHandler,
  useEffect,
  useMemo,
  useRef,
  useCallback
} from "react";
import { sortable } from "react-anything-sortable";
import { useTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import Box from "../../Styled/Box";
import { RawButton } from "../../Styled/Button";
import Icon, { StyledIcon } from "../../Styled/Icon";
import Ul from "../../Styled/List";
import Spacing from "../../Styled/Spacing";
import Text, { TextSpan } from "../../Styled/Text";
import parseCustomHtmlToReact from "../Custom/parseCustomHtmlToReact";

export interface Story {
  title: string;
  text: string;
  id: string;
  shareData?: any;
}

interface Props {
  story: Story;
  editStory: () => void;
  viewStory: () => void;
  deleteStory: () => void;
  recaptureStory: () => void;
  recaptureStorySuccessful: boolean;
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  parentRef: any;
  index: number;
  //props for react-anything-sortable
  className: any;
  style: any;
  onMouseDown(): void;
  onTouchStart(): void;
}

interface MenuProps extends Props {
  storyRef: RefObject<HTMLElement>;
}

const findTextContent = (content: any): string => {
  if (typeof content === "string") {
    return content;
  }
  if (content[0] && content[0].props && content[0].props.children) {
    return findTextContent(content[0].props.children);
  }
  if (!content.props || !content.props.children) {
    return "";
  }
  if (typeof content.props.children === "string") {
    return content.props.children;
  }
  return findTextContent(content.props.children);
};

const StoryControl = styled(Box).attrs({
  centered: true,
  left: true,
  justifySpaceBetween: true
})``;

const StoryMenuButton = styled(RawButton)`
  color: ${(props) => props.theme.textDarker};
  background-color: ${(props) => props.theme.textLight};

  ${StyledIcon} {
    width: 35px;
  }

  svg {
    fill: ${(props) => props.theme.textDarker};
    width: 18px;
    height: 18px;
  }

  border-radius: 0;

  width: 124px;
  // ensure we support long strings
  min-height: 32px;
  display: block;

  &:hover,
  &:focus {
    color: ${(props) => props.theme.textLight};
    background-color: ${(props) => props.theme.colorPrimary};

    svg {
      fill: ${(props) => props.theme.textLight};
      stroke: ${(props) => props.theme.textLight};
    }
  }
`;

const hideList = (props: Props) => props.closeMenu();

const getTruncatedContent = (text: string) => {
  const content = parseCustomHtmlToReact(text);
  const except = findTextContent(content);
  return except.slice(0, 100);
};

const toggleMenu =
  (props: Props): MouseEventHandler<HTMLElement> =>
  (event) => {
    event.stopPropagation();
    props.openMenu();
  };

const viewStory =
  (props: Props): MouseEventHandler<HTMLElement> =>
  (event) => {
    event.stopPropagation();
    props.viewStory();
    hideList(props);
  };

const deleteStory =
  (props: Props): MouseEventHandler<HTMLElement> =>
  (event) => {
    event.stopPropagation();
    props.deleteStory();
    hideList(props);
  };

const editStory =
  (props: Props): MouseEventHandler<HTMLElement> =>
  (event) => {
    event.stopPropagation();
    props.editStory();
    hideList(props);
  };

const recaptureStory =
  (props: Props): MouseEventHandler<HTMLElement> =>
  (event) => {
    event.stopPropagation();
    props.recaptureStory();
    hideList(props);
  };

const StoryMenu = (props: MenuProps) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Adjust the position of the menu so it stays inside the scroll container.
    const el = menuRef.current;
    const parentEl = props.parentRef?.current;
    if (!el || !parentEl || !props.menuOpen) return;

    // Measure first (read), then write styles to avoid layout thrash
    const selfRect = el.getBoundingClientRect();
    const parentRect = parentEl.getBoundingClientRect();
    if (selfRect.bottom > parentRect.bottom) {
      // Looks like there's no room to the bottom; grow upwards.
      Object.assign(el.style, { top: "unset", bottom: "0px" });
    } else {
      // Default: grow downwards
      Object.assign(el.style, { top: "0px", bottom: "unset" });
    }
  }, [props.parentRef, props.menuOpen]);
  return (
    <Box
      ref={menuRef}
      css={`
        position: absolute;
        z-index: 100;
        right: 0px;
        padding: 0;
        margin: 0;

        ul {
          list-style: none;
        }
      `}
    >
      <Ul column>
        <li>
          <StoryMenuButton
            onClick={viewStory(props)}
            title={t("story.viewStory")}
          >
            <StoryControl>
              <StyledIcon glyph={Icon.GLYPHS.viewStory} />
              <span>{t("story.view")}</span>
            </StoryControl>
          </StoryMenuButton>
        </li>
        <li>
          <StoryMenuButton
            onClick={editStory(props)}
            title={t("story.editStory")}
          >
            <StoryControl>
              <StyledIcon glyph={Icon.GLYPHS.editStory} />
              <span>{t("story.edit")}</span>
            </StoryControl>
          </StoryMenuButton>
        </li>
        <li>
          <StoryMenuButton
            onClick={recaptureStory(props)}
            title={t("story.recaptureStory")}
          >
            <StoryControl>
              <StyledIcon glyph={Icon.GLYPHS.story} />
              <span>{t("story.recapture")}</span>
            </StoryControl>
          </StoryMenuButton>
        </li>
        <li>
          <StoryMenuButton
            onClick={deleteStory(props)}
            title={t("story.deleteStory")}
          >
            <StoryControl>
              <StyledIcon glyph={Icon.GLYPHS.cancel} />
              <span>{t("story.delete")}</span>
            </StoryControl>
          </StoryMenuButton>
        </li>
      </Ul>
    </Box>
  );
};

const Story = (props: Props) => {
  const story = props.story;
  const bodyText = useMemo(() => getTruncatedContent(story.text), [story.text]);
  const theme = useTheme();
  const { t } = useTranslation();
  const storyRef = useRef<HTMLDivElement>(null);
  const { menuOpen, closeMenu } = props;
  const closeHandler = useCallback(() => {
    // Only close if this item's menu is open
    if (menuOpen) closeMenu();
  }, [menuOpen, closeMenu]);

  // Only register the global click listener while the menu is open
  useEffect(() => {
    if (!menuOpen) return;
    window.addEventListener("click", closeHandler);
    return () => window.removeEventListener("click", closeHandler);
  }, [menuOpen, closeHandler]);

  return (
    <>
      <Box
        ref={storyRef}
        column
        backgroundColor={theme.darkWithOverlay}
        rounded
        css={`
          cursor: move;
          float: none !important;
          border: 1px solid #baebf8;
          ${menuOpen ? "z-index: 2; overflow: visible;" : ""}
          // Improve drag rendering performance
          will-change: transform;
          // Avoid text selection causing jitter during drag
          user-select: none;
          // Disable transitions when react-anything-sortable marks as moving
          &.react-anything-sortable-moving {
            transition: none !important;
          }
          // Ensure base item also has no transform transition that can cause bounce
          &.react-anything-sortable-item {
            transition: none !important;
          }
        `}
        style={props.style}
        className={classNames(props.className)}
        onMouseDown={props.onMouseDown}
        onTouchStart={props.onTouchStart}
      >
        <Box
          fullWidth
          justifySpaceBetween
          padded
          verticalCenter
          styledHeight={"57px"}
          backgroundColor={theme.darkWithOverlay}
          rounded
          css={`
            padding-left: 15px;
            padding-right: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.15);
          `}
        >
          <div
            css={`
              width: 100%;
              overflow-x: hidden;
              display: flex;
            `}
          >
            <TextSpan
              css={`
                color: #baebf8;
                margin-right: 8px;
              `}
              medium
              bold
            >
              {props.index + 1}
            </TextSpan>
            <TextSpan
              overflowEllipsis
              textLight
              medium
              css={`
                overflow-x: hidden;
                white-space: nowrap;
              `}
            >
              {story.title && story.title.length > 0
                ? story.title
                : t("story.untitledScene")}
            </TextSpan>
          </div>
          <Box>
            {props.recaptureStorySuccessful && (
              <RawButton>
                <StyledIcon
                  styledWidth="20px"
                  light
                  glyph={Icon.GLYPHS.recapture}
                  css={`
                    padding-right: 10px;
                  `}
                />
              </RawButton>
            )}
            <MenuButton theme={theme} onClick={toggleMenu(props)}>
              <StyledIcon
                styledWidth="20px"
                light
                glyph={Icon.GLYPHS.menuDotted}
              />
            </MenuButton>
          </Box>
          {props.menuOpen && <StoryMenu {...props} storyRef={storyRef} />}
        </Box>
        {bodyText.length > 0 && (
          <Box paddedRatio={2} paddedHorizontally={3}>
            <Text
              overflowEllipsis
              textLight
              medium
              css={`
                overflow-x: hidden;
                white-space: nowrap;
              `}
            >
              {bodyText}
            </Text>
          </Box>
        )}
      </Box>
      <Spacing bottom={3} />
    </>
  );
};

const MenuButton = styled(RawButton)`
  padding: 0 10px 0 10px;
  min-height: 40px;
  border-radius: ${(props) => props.theme.radiusSmall};
  background: transparent;

  &:hover,
  &:focus {
    opacity: 0.9;
    background-color: ${(props) => props.theme.dark};
  }
`;

export default sortable(Story);
