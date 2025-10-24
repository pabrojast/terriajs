import { Story } from "../Story";
import parseCustomHtmlToReact from "../../Custom/parseCustomHtmlToReact";
import styled from "styled-components";
import Box from "../../../Styled/Box";
import Text from "../../../Styled/Text";

const StoryContainer = styled(Box).attrs((props: { isCollapsed: boolean }) => ({
  paddedVertically: props.isCollapsed ? 0 : 2,
  scroll: true
}))<{ isCollapsed: boolean }>`
  background-color: ${(props) => props.theme.transparentDark};
  backdrop-filter: ${(props) => props.theme.blur};
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

function sourceBasedParse(story: Story) {
  if (shouldAddIframeTag(story)) {
    return parseCustomHtmlToReact(
      story.text,
      { showExternalLinkWarning: true },
      false,
      {
        ADD_TAGS: ["iframe"]
      }
    );
  } else {
    return parseCustomHtmlToReact(
      story.text,
      { showExternalLinkWarning: true },
      false,
      {}
    );
  }
}

const StoryBody = ({
  isCollapsed,
  story
}: {
  isCollapsed: boolean;
  story: Story;
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
      >
        {sourceBasedParse(story)}
      </Text>
    </StoryContainer>
  ) : null;

export default StoryBody;
