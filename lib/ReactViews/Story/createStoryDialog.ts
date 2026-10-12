import i18next from "i18next";
import Styles from "./story-editor.scss";

/** Shared visual shell; CKAN still owns picker contents and authentication. */
export default function createStoryDialog(title: string, picker = false) {
  const dialog = document.createElement("dialog");
  dialog.className = Styles.resourceDialog;
  dialog.classList.toggle(Styles.pickerDialog, picker);
  dialog.setAttribute("aria-label", title);
  const header = document.createElement("header");
  header.className = Styles.dialogHeader;
  const heading = document.createElement("h2");
  heading.textContent = title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = Styles.closeButton;
  close.setAttribute(
    "aria-label",
    i18next.t("story.editor.design.closeDialog")
  );
  close.textContent = "×";
  const body = document.createElement("div");
  body.className = Styles.dialogBody;
  header.append(heading, close);
  dialog.append(header, body);
  return { dialog, body, close };
}
