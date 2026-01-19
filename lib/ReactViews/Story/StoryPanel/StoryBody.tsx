import { Story } from "../Story";
import parseCustomHtmlToReact from "../../Custom/parseCustomHtmlToReact";
import styled from "styled-components";
import Box from "../../../Styled/Box";
import Text from "../../../Styled/Text";
import Terria from "../../../Models/Terria";

const StoryContainer = styled(Box).attrs((props: { isCollapsed: boolean }) => ({
  paddedVertically: props.isCollapsed ? 0 : 2,
  scroll: true
}))<{ isCollapsed: boolean }>`
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: ${(props) => props.theme.blur};
  color: #000;
  padding-top: 0;
  padding: ${(props) => (props.isCollapsed ? 0 : 15)}px;
  flex: 1 1 auto;
  min-height: 0;
  max-height: ${(props) => (props.isCollapsed ? 0 : "100%")};
  overflow-y: ${(props) => (props.isCollapsed ? "hidden" : "auto")};
  opacity: ${(props) => (props.isCollapsed ? 0 : 1)};
  pointer-events: ${(props) => (props.isCollapsed ? "none" : "auto")};
  transition: max-height 0.2s ease, padding 0.2s ease, opacity 0.2s ease;

  img {
    max-width: 100%;
  }
  * {
    max-width: 100%;
    //These are technically the same, but use both
    overflow-wrap: break-word;
    word-wrap: break-word;

    -ms-word-break: break-all;
    // This is the dangerous one in WebKit, as it breaks things wherever
    word-break: break-all;
    // Instead use this non-standard one:
    word-break: break-word;

    // Adds a hyphen where the word breaks, if supported (No Blink)
    -ms-hyphens: auto;
    -moz-hyphens: auto;
    -webkit-hyphens: auto;
    hyphens: auto;
  }
`;

function shouldAddIframeTag(story: Story) {
  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(story.text, "text/html");
  const iframes = parsedDocument.getElementsByTagName("iframe");
  if (iframes.length < 1) return false;
  let result = true;
  for (const iframe of iframes) {
    if (
      !(
        iframe.src?.startsWith("https://www.youtube.com/embed/") ||
        iframe.src?.startsWith("https://www.youtube-nocookie.com/embed/") ||
        iframe.src?.startsWith("https://player.vimeo.com/video/")
      )
    ) {
      result = false;
      break;
    }
  }
  return result;
}

function sourceBasedParse(story: Story, terria?: Terria) {
  const addTags = ["terria-legend"];
  if (shouldAddIframeTag(story)) {
    addTags.push("iframe");
  }

  return parseCustomHtmlToReact(
    story.text,
    { showExternalLinkWarning: true, terria },
    false,
    {
      ADD_TAGS: addTags,
      ADD_ATTR: ["data-id", "data-title"]
    }
  );
}

const StoryBody = ({
  isCollapsed,
  story,
  terria
}: {
  isCollapsed: boolean;
  story: Story;
  terria?: Terria;
}) =>
  story.text && story.text !== "" ? (
    <StoryContainer isCollapsed={isCollapsed} column>
      <Text
        css={`
          display: flex;
          flex-direction: column;
          gap: 5px;
        `}
        medium
        textDark
      >
        {sourceBasedParse(story, terria)}
      </Text>
    </StoryContainer>
  ) : null;

export default StoryBody;
