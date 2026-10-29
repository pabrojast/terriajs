import markdownToHtml from "../../Core/markdownToHtml";

/** Answers may format text, but cannot load media, run custom components or navigate. */
export default function formatAnswer(answer: string): string {
  return markdownToHtml(answer, false, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "code",
      "pre",
      "blockquote",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td"
    ],
    ALLOWED_ATTR: []
  });
}
