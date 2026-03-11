import { lazy, Component, Suspense } from "react";
import PropTypes from "prop-types";
import classNames from "classnames";
import Styles from "./story-editor.scss";
import { withTranslation } from "react-i18next";
import tinymce from "tinymce";
import isDefined from "../../Core/isDefined";
import { getName } from "../../ModelMixins/CatalogMemberMixin";
import hasTraits from "../../Models/Definition/hasTraits";
import Text from "../../Styled/Text";
import Box from "../../Styled/Box";
import Button from "../../Styled/Button";
import LegendOwnerTraits from "../../Traits/TraitsClasses/LegendOwnerTraits";
import { withViewState } from "../Context";

// Lazy load the Editor component as the tinyMCE library is large
const Editor = lazy(() => import("../Generic/Editor.tsx"));
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

class StoryEditor extends Component {
  constructor(props) {
    super(props);
    this.state = {
      title: "",
      text: "",
      id: undefined,
      inView: false
    };

    this.keys = {
      ctrl: false,
      enter: false
    };

    this.saveStory = this.saveStory.bind(this);
    this.cancelEditing = this.cancelEditing.bind(this);
    this.updateTitle = this.updateTitle.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.setupEditor = this.setupEditor.bind(this);

    this.onKeyUp = this.onKeyUp.bind(this);
    this.slideInTimer = null;
    this.slideOutTimer = null;
    this.escKeyListener = null;
  }

  UNSAFE_componentWillMount() {
    const story = this.props.story;
    this.setState({
      title: story.title,
      text: story.text,
      id: story.id
    });
  }

  componentDidMount() {
    this.slideIn();
  }

  slideIn() {
    this.slideInTimer = setTimeout(() => {
      this.setState({
        inView: true
      });

      this.titleInput.focus();
    }, 300);
  }

  slideOut() {
    this.slideOutTimer = this.setState({
      inView: false
    });
    setTimeout(() => {
      this.cancelEditing();
    }, 300);
  }

  componentWillUnmount() {
    clearTimeout(this.slideInTimer);
    if (this.slideOutTimer) {
      clearTimeout(this.slideOutTimer);
    }
    this.setState({
      title: "",
      text: "",
      id: undefined
    });
  }

  updateTitle(event) {
    this.setState({
      title: event.target.value
    });
    this._updateDirty(event.target.value, this.state.text);
  }

  saveStory() {
    this.props.saveStory({
      title: this.state.title,
      text: this.state.text,
      id: this.state.id
    });

    this.setState({
      isPopupEditorOpen: false
    });
    // Saved — clear dirty flag
    this.props.viewState.setStoryHasUnsavedChanges(false);
  }

  cancelEditing() {
    this.props.exitEditingMode();
    this.setState({
      title: this.props.story.title,
      text: this.props.story.text
    });
    // Cancel — clear dirty flag
    this.props.viewState.setStoryHasUnsavedChanges(false);
  }

  onKeyDown(event) {
    if (event.keyCode === 27) {
      this.cancelEditing();
    }
    if (event.keyCode === 13) {
      this.keys.enter = true;
    }
    if (event.keyCode === 17) {
      this.keys.ctrl = true;
    }
  }

  onKeyUp(event) {
    if (
      (event.keyCode === 13 || event.keyCode === 17) &&
      this.keys.enter &&
      this.keys.ctrl
    ) {
      this.saveStory();
    }
    if (event.keyCode === 13) {
      this.keys.enter = false;
    }
    if (event.keyCode === 17) {
      this.keys.ctrl = false;
    }
  }

  handleChange(value) {
    this.setState({ text: value });
    this._updateDirty(this.state.title, value);
  }

  _updateDirty(title, text) {
    const initial = this.props.story || { title: "", text: "" };
    const dirty =
      (title || "") !== (initial.title || "") ||
      (text || "") !== (initial.text || "");
    this.props.viewState.setStoryHasUnsavedChanges(Boolean(dirty));
  }

  removeStory() {
    this.props.exitEditingMode();
    if (this.state.id) {
      this.props.removeStory(this.state.id);
    }
  }

  setupEditor(editor) {
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
    const maxImageHeight = "350px"; // TODO: where to put this to reduce coupling?
    return (
      <div
        onKeyDown={this.onKeyDown}
        onKeyUp={this.onKeyUp}
        className={classNames(Styles.popupEditor, {
          [Styles.isMounted]: this.state.inView
        })}
      >
        <div className={Styles.inner}>
          <div className={Styles.header}>
            <Text textLight as="h3" css={{ margin: "0" }}>
              {t("story.editor.modalHeader")}
            </Text>
          </div>
          <label htmlFor="title">
            <Text small textGreyLighter css={{ marginBottom: "8px" }}>
              {t("story.editor.titleLabel")}
            </Text>
          </label>
          <input
            ref={(titleInput) => (this.titleInput = titleInput)}
            placeholder={t("story.editor.placeholder")}
            autoComplete="off"
            className={Styles.field}
            type="text"
            id="title"
            value={this.state.title}
            onChange={this.updateTitle}
          />
          <div className={Styles.body}>
            <Text small textGreyLighter css={{ marginBottom: "8px" }}>
              {t("story.editor.descriptionLabel")}
            </Text>
            <Suspense fallback={<div>Loading...</div>}>
              <Editor
                language={this.props.i18n.language}
                html={this.state.text}
                onChange={(_newValue, editor) => {
                  // TODO: This makes StoryEditor tightly coupled to Editor. How to reduce coupling?
                  tinymce.activeEditor.dom.setStyles(
                    tinymce.activeEditor.dom.select("img"),
                    { "max-height": `${maxImageHeight}`, width: "auto" }
                  );
                  const text = editor.getBody().innerHTML;
                  this.setState({ text });
                }}
                terria={this.props.terria}
                toolbarItems="legend"
                setup={this.setupEditor}
                customElements={LEGEND_TAG}
                extendedValidElements={`${LEGEND_TAG}[data-id|data-title]`}
                contentStyle={LEGEND_EDITOR_STYLE}
              />
            </Suspense>
          </div>
          <Box centered gap={3}>
            <Button
              styledWidth={"240px"}
              transparentBg
              onClick={this.cancelEditing}
              type="button"
              title={t("story.editor.cancelBtn")}
              textProps={{
                textGreyLighter: true,
                medium: true
              }}
            >
              {t("story.editor.cancelEditing")}
            </Button>
            <Button
              styledWidth={"240px"}
              primary
              disabled={!this.state.title.length}
              onClick={this.saveStory}
              type="button"
              title={t("story.editor.saveBtn")}
              textProps={{
                medium: true
              }}
            >
              {t("story.editor.saveStory")}
            </Button>
          </Box>
        </div>
      </div>
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
