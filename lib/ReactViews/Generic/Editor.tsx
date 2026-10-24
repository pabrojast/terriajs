import { useRef } from "react";
import { Editor } from "@tinymce/tinymce-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import tinymce from "tinymce"; // must import despite being unused
import type { Editor as TinyMCEEditor } from "tinymce";
/* Required TinyMCE components */
import "tinymce/icons/default";
import "tinymce/themes/silver";
import "tinymce/models/dom";
/* Import a skin (can be a custom skin instead of the default) */
import "!!style-loader!css-loader!tinymce/skins/ui/oxide/skin.min.css";
import "!!style-loader!css-loader!./editor.skin.min.css"; // Custom borderless skin overrides

/* Import TinyMCE plugins */
import "tinymce/plugins/media";
import "tinymce/plugins/image";
import "tinymce/plugins/link";
import "tinymce/plugins/lists";
import "tinymce/plugins/table";
import "tinymce/plugins/autolink";

// Extra css to enable proper behaviour of tinymce, including image resize handles
import contentCss from "tinymce/skins/content/default/content.min.css";
import contentUiCss from "tinymce/skins/ui/oxide/content.min.css";
import Terria from "../../Models/Terria";
import { uploadStoryImage } from "./uploadStoryImage";
import { chooseStoryImage } from "./storyImageLibrary";

interface ITinyEditorProps {
  html: string;
  onChange: (html: string, editor: TinyMCEEditor) => void;
  language: string;
  baseUrl?: string;
  /** Enables the story image upload/library integrations when configured. */
  terria?: Terria;
  /** Extra toolbar items appended after the default toolbar. */
  toolbarItems?: string;
  /** Called with the editor instance once it is set up. */
  setup?: (editor: TinyMCEEditor) => void;
  customElements?: string;
  extendedValidElements?: string;
  contentStyle?: string;
}

export default function TinyEditor(props: ITinyEditorProps) {
  const { html, onChange, language, terria } = props;
  const editorRef = useRef<TinyMCEEditor | null>(null);
  const storyImageLibraryUrl = terria?.configParameters.storyImageLibraryUrl;
  const storyImageUploadUrl = terria?.configParameters.storyImageUploadUrl;

  const defaultToolbar =
    "blocks | bold italic forecolor | align |" +
    " bullist numlist table |" +
    "image " +
    (storyImageLibraryUrl ? "storyimages " : "") +
    "media link |" +
    "undo redo | removeformat";
  const toolbar = props.toolbarItems
    ? `${defaultToolbar} | ${props.toolbarItems}`
    : defaultToolbar;
  const contentStyles = [contentCss, contentUiCss];
  if (props.contentStyle) {
    contentStyles.push(props.contentStyle);
  }
  const setup = (editor: TinyMCEEditor) => {
    if (storyImageLibraryUrl) {
      editor.ui.registry.addButton("storyimages", {
        text: "My images",
        tooltip: "Insert from My images",
        onAction: async () => {
          const bookmark = editor.selection.getBookmark(2, true);
          try {
            const image = await chooseStoryImage(storyImageLibraryUrl);
            if (!image || editor.removed) return;
            editor.focus();
            editor.selection.moveToBookmark(bookmark);
            const photo = document.createElement("img");
            photo.src = image.url;
            photo.alt = image.alt;
            let html = photo.outerHTML;
            if (image.caption || image.credit) {
              const figure = document.createElement("figure");
              const caption = document.createElement("figcaption");
              caption.textContent = [image.caption, image.credit]
                .filter(Boolean)
                .join(" — ");
              figure.append(photo, caption);
              html = figure.outerHTML;
            }
            editor.insertContent(html);
          } catch (error) {
            editor.notificationManager.open({
              text: error instanceof Error ? error.message : String(error),
              type: "error"
            });
          }
        }
      });
    }
    if (props.setup) {
      props.setup(editor);
    }
  };

  return (
    <Editor
      key={language}
      licenseKey="gpl"
      onInit={(_evt, editor) => (editorRef.current = editor)}
      value={html}
      onEditorChange={onChange}
      init={{
        language: language,
        language_url: `languages/tinymce/${language}.js`,
        height: 450,
        skin: false,
        menubar: false,
        branding: false,
        statusbar: false,
        plugins: ["link", "image", "media", "table", "lists", "autolink"],
        toolbar,
        content_css: false,
        content_style: contentStyles.join("\n"),
        image_dimensions: true,
        image_caption: true,
        convert_urls: false,
        ...(storyImageUploadUrl
          ? {
              paste_data_images: true,
              automatic_uploads: true,
              images_upload_handler: (
                blobInfo: { blob: () => Blob; filename: () => string },
                progress: (percent: number) => void
              ) =>
                uploadStoryImage(
                  storyImageUploadUrl,
                  blobInfo.blob(),
                  blobInfo.filename(),
                  progress
                ),
              file_picker_types: "image",
              file_picker_callback: (
                callback: (value: string, meta?: Record<string, any>) => void
              ) => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/jpeg,image/png,image/webp,image/gif";
                input.onchange = async () => {
                  const file = input.files?.[0];
                  const editor = editorRef.current;
                  if (!file || !editor) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const cache = editor.editorUpload.blobCache;
                    const blob = cache.create(
                      "story-" + crypto.randomUUID(),
                      file,
                      String(reader.result).split(",")[1]
                    );
                    cache.add(blob);
                    callback(blob.blobUri(), { alt: file.name });
                  };
                  reader.readAsDataURL(file);
                };
                input.click();
              }
            }
          : {}),
        setup,
        ...(props.customElements
          ? { custom_elements: props.customElements }
          : {}),
        ...(props.extendedValidElements
          ? { extended_valid_elements: props.extendedValidElements }
          : {})
      }}
    />
  );
}
