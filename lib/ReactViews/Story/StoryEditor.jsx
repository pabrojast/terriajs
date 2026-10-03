import {
  storyComposition,
  storyPresentation
} from "../../Models/StoryComposition";
import StoryCompositionEditor from "./StoryCompositionEditor";
import editStoryReference from "./editStoryReference";
import { lazy, Component, Suspense } from "react";
import { createPortal } from "react-dom";
import StoryLayoutPreview from "./StoryLayoutPreview";
import PropTypes from "prop-types";
import classNames from "classnames";
import Styles from "./story-editor.scss";
import { withTranslation } from "react-i18next";
import isDefined from "../../Core/isDefined";
import { getName } from "../../ModelMixins/CatalogMemberMixin";
import hasTraits from "../../Models/Definition/hasTraits";
import LegendOwnerTraits from "../../Traits/TraitsClasses/LegendOwnerTraits";
import { withViewState } from "../Context";

// Lazy load the Editor component as the tinyMCE library is large
const Editor = lazy(() => import("../Generic/Editor.jsx"));
const LEGEND_TAG = "terria-legend";
const LEGEND_EDITOR_STYLE = `
  ${LEGEND_TAG} {
    display: block;
    padding: 8px;
    border: 1px dashed #b3b3b3;
    background: #f7f7f7;
  }

  ${LEGEND_TAG}::before {
    content: attr(data-title);
    display: block;
    color: #555;
    font-size: 12px;
  }
`;

const escapeAttributeValue = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");

const buildLegendHtml = (itemId, title) => {
  const escapedId = escapeAttributeValue(itemId);
  const escapedTitle = title ? escapeAttributeValue(title) : "";
  const titleAttr = escapedTitle ? ` data-title="${escapedTitle}"` : "";
  return `<p><${LEGEND_TAG} data-id="${escapedId}"${titleAttr}></${LEGEND_TAG}></p>`;
};

export class StoryEditor extends Component {
  constructor(props) {
    super(props);
    this.state = {
      title: "",
      text: "",
      id: undefined,
      inView: false
    };

    const story = props.story;
    Object.assign(this.state, {
      title: story.title || "",
      text: story.text || "",
      id: story.id,
      presentation: storyPresentation(story),
      composition: storyComposition(story.composition)
    });
    this.saveStory = this.saveStory.bind(this);
    this.cancelEditing = this.cancelEditing.bind(this);
    this.updateTitle = this.updateTitle.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.setupEditor = this.setupEditor.bind(this);
    this.containFocus = this.containFocus.bind(this);
  }

  componentDidMount() {
    this.mounted = true;
    this.previousFocus = document.activeElement;
    document.addEventListener("focusin", this.containFocus);
    this.slideInTimer = setTimeout(() => {
      this.setState({ inView: true });
      this.titleInput?.focus();
    }, 0);
  }

  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.slideInTimer);
    document.removeEventListener("focusin", this.containFocus);
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }

  containFocus(event) {
    // CKAN pickers use the top layer; TinyMCE menus/dialogs use a body portal.
    if (document.querySelector("dialog[open]")) return;
    if (event.target.closest?.(".tox-tinymce-aux")) return;
    const boundary = this.state.discardOpen ? this.discardDialog : this.dialog;
    if (boundary && !boundary.contains(event.target)) {
      boundary
        .querySelector("button:not(:disabled), input, [tabindex='0']")
        ?.focus();
    }
  }

  focusEdge(last) {
    const boundary = this.state.discardOpen ? this.discardDialog : this.dialog;
    const items = [
      ...boundary.querySelectorAll(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), iframe, summary, [tabindex='0']"
      )
    ].filter(
      (item) => item.getClientRects().length && !item.closest("[hidden]")
    );
    items[last ? items.length - 1 : 0]?.focus();
  }

  updateTitle(event) {
    this.setState({
      title: event.target.value
    });
    this._updateDirty(event.target.value, this.state.text);
  }

  async saveStory() {
    if (this.saving || !this.state.title.trim() || !this.state.editorReady)
      return;
    this.saving = true;
    this.editor.mode.set("readonly");
    this.setState({ saving: true, uploadError: null });
    try {
      const results = await this.editor?.uploadImages();
      if (!this.mounted) return;
      if (
        results?.some((result) => !result.status) ||
        this.editor
          ?.getBody()
          .querySelector('img[src^="blob:"],img[src^="data:"]')
      )
        throw new Error(
          "Some images have not uploaded. Retry the upload before saving; your draft has been kept."
        );
      const text = this.editor?.getContent() ?? this.state.text;
      this.props.saveStory({
        title: this.state.title,
        text,
        id: this.state.id,
        presentation: this.state.presentation,
        composition:
          this.props.story.composition ||
          this.state.compositionDirty ||
          this.state.presentation === "composed"
            ? this.state.composition
            : undefined
      });

      // Saved — clear dirty flag
      this.props.viewState.setStoryHasUnsavedChanges(false);
    } catch (error) {
      if (this.mounted)
        this.setState({
          uploadError:
            error.message || this.props.t("story.editor.design.uploadFailed")
        });
    } finally {
      this.saving = false;
      if (this.mounted) {
        this.editor?.mode.set("design");
        this.setState({ saving: false });
      }
    }
  }

  cancelEditing() {
    if (this.saving) return;
    if (this.isDirty(this.state.title, this.state.text)) {
      this.setState({ discardOpen: true }, () =>
        this.discardDialog?.querySelector("button")?.focus()
      );
    } else this.discardChanges();
  }

  discardChanges() {
    this.props.viewState.setStoryHasUnsavedChanges(false);
    this.props.exitEditingMode();
  }

  keepEditing() {
    this.setState({ discardOpen: false }, () => this.titleInput?.focus());
  }

  onKeyDown(event) {
    if (document.querySelector("dialog[open], .tox-dialog, .tox-menu")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (this.state.discardOpen) this.keepEditing();
      else this.cancelEditing();
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!this.state.discardOpen) this.saveStory();
    }
  }

  isDirty(title, text) {
    const initial = this.props.story;
    return (
      (title || "") !== (initial.title || "") ||
      (text || "") !== (initial.text || "") ||
      this.state.presentation !== storyPresentation(initial) ||
      JSON.stringify(this.state.composition) !==
        JSON.stringify(storyComposition(initial.composition))
    );
  }

  _updateDirty(title, text) {
    this.props.viewState.setStoryHasUnsavedChanges(this.isDirty(title, text));
  }

  async linkVisualization() {
    if (this.state.presentation !== "composed") return;
    const editor = this.editor;
    if (
      !editor ||
      (!editor.selection.getContent({ format: "text" }).trim() &&
        !editor.dom.getParent(
          editor.selection.getNode(),
          'a[href^="#story-ref-"]'
        ))
    ) {
      this.setState({
        uploadError: "Select the narrative text to link first."
      });
      return;
    }
    const bookmark = editor.selection.getBookmark(2, true);
    const anchor = editor.dom.getParent(
      editor.selection.getNode(),
      'a[href^="#story-ref-"]'
    );
    const selectedId = anchor?.getAttribute("href")?.replace("#story-ref-", "");
    const result = await editStoryReference(
      this.state.composition,
      this.props.terria.stories,
      selectedId
    );
    if (!result) return;
    editor.selection.moveToBookmark(bookmark);
    if (result.reference)
      editor.execCommand("mceInsertLink", false, {
        href: "#story-ref-" + result.reference.id
      });
    else editor.execCommand("unlink");
    this.setState({
      composition: result.composition,
      compositionDirty: true,
      text: editor.getContent(),
      uploadError: null
    });
    this.props.viewState.setStoryHasUnsavedChanges(true);
  }

  setupEditor(editor) {
    editor.on("keydown", this.onKeyDown);
    editor.on("init", () => {
      if (this.mounted) this.setState({ editorReady: true });
    });
    editor.ui.registry.addButton("storyreference", {
      text: this.props.t("story.editor.design.linkVisualization"),
      onAction: () => this.linkVisualization(),
      onSetup: (api) => {
        this.referenceButton = api;
        api.setEnabled(this.state.presentation === "composed");
        return () => {
          this.referenceButton = undefined;
        };
      }
    });
    editor.ui.registry.addMenuButton("legend", {
      text: this.props.t("story.editor.legend.insert"),
      fetch: (callback) => {
        const terria = this.props.terria;
        const legendItems = terria?.workbench?.items
          ?.filter((item) => isDefined(item.uniqueId))
          .filter(
            (item) =>
              hasTraits(item, LegendOwnerTraits, "legends") &&
              isDefined(item.legends) &&
              item.legends.length > 0
          )
          .map((item) => {
            const itemName = getName(item) || item.uniqueId;
            return {
              type: "menuitem",
              text: itemName,
              onAction: () => {
                if (!item.uniqueId) return;
                editor.insertContent(buildLegendHtml(item.uniqueId, itemName));
              }
            };
          });

        if (!legendItems || legendItems.length === 0) {
          callback([
            {
              type: "menuitem",
              text: this.props.t("story.editor.legend.empty"),
              onAction: () => {},
              disabled: true
            }
          ]);
          return;
        }

        callback(legendItems);
      }
    });
  }

  render() {
    const { t } = this.props;
    const tr = (key) => t(`story.editor.design.${key}`);
    const composed = this.state.presentation === "composed";
    return createPortal(
      <div
        className={classNames(Styles.popupEditor, {
          [Styles.isMounted]: this.state.inView
        })}
        onKeyDown={this.onKeyDown}
      >
        <span
          tabIndex={0}
          className={Styles.focusGuard}
          onFocus={() => this.focusEdge(true)}
        />
        <div
          ref={(node) => (this.dialog = node)}
          className={Styles.inner}
          role="dialog"
          aria-modal="true"
          aria-labelledby="story-editor-heading"
          aria-describedby="story-editor-intro"
          aria-hidden={this.state.discardOpen || undefined}
        >
          <header className={Styles.header}>
            <div>
              <span className={Styles.eyebrow}>{tr("eyebrow")}</span>
              <h2 id="story-editor-heading">
                {tr(this.state.id ? "editChapter" : "newChapter")}
              </h2>
              <p id="story-editor-intro">{tr("intro")}</p>
            </div>
            <button
              type="button"
              className={Styles.closeButton}
              onClick={this.cancelEditing}
              disabled={this.state.saving}
              aria-label={tr("close")}
            >
              <span aria-hidden="true">×</span>
            </button>
          </header>
          <div className={Styles.workspace}>
            <section className={Styles.contentPane} aria-label={tr("content")}>
              <label className={Styles.label} htmlFor="story-title">
                {tr("title")}{" "}
                <span className={Styles.required}>{tr("required")}</span>
              </label>
              <input
                ref={(node) => (this.titleInput = node)}
                placeholder={tr("titlePlaceholder")}
                autoComplete="off"
                className={Styles.titleInput}
                type="text"
                id="story-title"
                value={this.state.title}
                onChange={this.updateTitle}
                disabled={this.state.saving}
                required
              />
              <div className={Styles.contentHeading}>
                <h3>{tr("content")}</h3>
                <span>{tr("contentHint")}</span>
              </div>
              <div className={Styles.body}>
                <Suspense
                  fallback={
                    <div className={Styles.loading} role="status">
                      {tr("loading")}
                    </div>
                  }
                >
                  <Editor
                    html={this.state.text}
                    onChange={(_value, editor) => {
                      const text = editor.getBody().innerHTML;
                      this.setState({ text });
                      this._updateDirty(this.state.title, text);
                    }}
                    terria={this.props.terria}
                    toolbarItems="legend storyreference"
                    setup={(editor) => {
                      this.editor = editor;
                      this.setupEditor(editor);
                    }}
                    customElements={LEGEND_TAG}
                    extendedValidElements={`${LEGEND_TAG}[data-id|data-title]`}
                    contentStyle={
                      LEGEND_EDITOR_STYLE +
                      " body { font-family: Inter, Arial, sans-serif; color: #263b4d; font-size: 16px; line-height: 1.7; padding: 16px 20px; } img { max-width: 100%; height: auto; }"
                    }
                  />
                </Suspense>
              </div>
              <p className={Styles.hint}>{tr("imageHint")}</p>
            </section>
            <aside className={Styles.settingsPane} aria-label={tr("settings")}>
              <fieldset className={Styles.section} disabled={this.state.saving}>
                <legend>{t("story.editor.presentationLabel")}</legend>
                <div className={Styles.formatChoices}>
                  {["classic", "composed"].map((format) => (
                    <label
                      key={format}
                      className={Styles.choice}
                      data-selected={this.state.presentation === format}
                    >
                      <input
                        type="radio"
                        name="story-presentation"
                        value={format}
                        checked={this.state.presentation === format}
                        onChange={() => {
                          this.referenceButton?.setEnabled(
                            format === "composed"
                          );
                          this.setState({ presentation: format }, () =>
                            this._updateDirty(this.state.title, this.state.text)
                          );
                        }}
                      />
                      <StoryLayoutPreview
                        layout={format === "classic" ? "classic" : "map"}
                      />
                      <strong>
                        {t(
                          `story.editor.${
                            format === "classic"
                              ? "presentationClassic"
                              : "presentationComposed"
                          }`
                        )}
                      </strong>
                      <span>
                        {tr(
                          format === "classic"
                            ? "classicShort"
                            : "composedShort"
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                <p className={Styles.hint}>
                  {tr(composed ? "composedHelp" : "classicHelp")}
                </p>
              </fieldset>
              {composed && (
                <StoryCompositionEditor
                  value={this.state.composition}
                  terria={this.props.terria}
                  disabled={this.state.saving}
                  onReference={() => this.linkVisualization()}
                  onChange={(composition) => {
                    this.setState({ composition, compositionDirty: true }, () =>
                      this._updateDirty(this.state.title, this.state.text)
                    );
                  }}
                />
              )}
              {!composed && (
                <div className={Styles.classicNote}>
                  <span className={Styles.eyebrow}>{tr("yourMap")}</span>
                  <h3>{tr("classicNoteTitle")}</h3>
                  <p>{tr("classicNote")}</p>
                </div>
              )}
            </aside>
          </div>
          <footer className={Styles.footer}>
            <div className={Styles.feedback}>
              {this.state.uploadError ? (
                <p className={Styles.error} role="alert">
                  {this.state.uploadError}
                </p>
              ) : (
                <p className={Styles.hint} role="status">
                  {tr(this.state.saving ? "saving" : "saveHint")}
                </p>
              )}
            </div>
            <div className={Styles.actions}>
              <button
                className={Styles.secondaryButton}
                type="button"
                disabled={this.state.saving}
                onClick={this.cancelEditing}
              >
                {t("story.editor.cancelEditing")}
              </button>
              <button
                className={Styles.primaryButton}
                type="button"
                disabled={
                  !this.state.title.trim() ||
                  this.state.saving ||
                  !this.state.editorReady
                }
                onClick={this.saveStory}
              >
                {tr(this.state.saving ? "savingButton" : "saveChapter")}
              </button>
            </div>
          </footer>
        </div>
        {this.state.discardOpen && (
          <div className={Styles.discardBackdrop}>
            <div
              className={Styles.discardDialog}
              ref={(node) => (this.discardDialog = node)}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="story-discard-title"
              aria-describedby="story-discard-description"
            >
              <h2 id="story-discard-title">{tr("discardTitle")}</h2>
              <p id="story-discard-description">{tr("discardDescription")}</p>
              <div className={Styles.actions}>
                <button
                  type="button"
                  className={Styles.primaryButton}
                  onClick={() => this.keepEditing()}
                >
                  {tr("keepEditing")}
                </button>
                <button
                  type="button"
                  className={Styles.secondaryButton}
                  onClick={() => this.discardChanges()}
                >
                  {tr("discard")}
                </button>
              </div>
            </div>
          </div>
        )}
        <span
          tabIndex={0}
          className={Styles.focusGuard}
          onFocus={() => this.focusEdge(false)}
        />
      </div>,
      document.body
    );
  }
}

StoryEditor.propTypes = {
  story: PropTypes.object,
  removeStory: PropTypes.func,
  saveStory: PropTypes.func,
  exitEditingMode: PropTypes.func,
  t: PropTypes.func.isRequired,
  terria: PropTypes.object,
  viewState: PropTypes.shape({
    setStoryHasUnsavedChanges: PropTypes.func
  })
};

StoryEditor.defaultProps = { story: { title: "", text: "", id: undefined } };
export default withViewState(withTranslation()(StoryEditor));
