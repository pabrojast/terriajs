import { StoryEditor } from "../../../lib/ReactViews/Story/StoryEditor.jsx";
import { storyComposition } from "../../../lib/Models/StoryComposition";

describe("Story editor draft lifecycle", function () {
  let editor, props, body;
  beforeEach(function () {
    props = {
      story: { title: "", text: "" },
      saveStory: jasmine.createSpy("save"),
      exitEditingMode: jasmine.createSpy("exit"),
      viewState: { setStoryHasUnsavedChanges: jasmine.createSpy("dirty") },
      t: (key) => key
    };
    editor = new StoryEditor(props);
    // Exercise async draft transitions independently of TinyMCE's iframe lifecycle.
    editor.setState = (patch, done) => {
      Object.assign(editor.state, patch);
      done?.();
    };
    editor.mounted = true;
    editor.state.editorReady = true;
    body = document.createElement("div");
    editor.editor = {
      mode: { set: jasmine.createSpy("mode") },
      uploadImages: jasmine
        .createSpy("upload")
        .and.returnValue(Promise.resolve([])),
      getBody: () => body,
      getContent: () => "<p>Saved narrative</p>"
    };
  });

  it("rejects blank titles through the keyboard save path", async function () {
    editor.state.title = "   ";
    editor.onKeyDown(
      new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true })
    );
    await Promise.resolve();
    expect(editor.editor.uploadImages).not.toHaveBeenCalled();
    expect(props.saveStory).not.toHaveBeenCalled();
  });

  it("does not treat TinyMCE HTML normalization as an author edit", function () {
    props.story.text = "<p>One</p><p>Two</p>";
    editor.initialEditorText = "<p>One</p>\n<p>Two</p>";
    editor.state.text = editor.initialEditorText;
    editor.cancelEditing();
    expect(props.exitEditingMode).toHaveBeenCalled();
    expect(editor.state.discardOpen).toBeUndefined();
    expect(editor.isDirty("", "<p>Changed</p>")).toBe(true);
  });

  it("keeps a failed upload draft editable and prevents duplicate saves or closure while pending", async function () {
    let finish;
    editor.state.title = "A chapter";
    editor.state.text = "<p>A draft</p>";
    editor.editor.uploadImages.and.returnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const saving = editor.saveStory();
    await editor.saveStory();
    editor.cancelEditing();
    expect(editor.editor.uploadImages.calls.count()).toBe(1);
    expect(props.exitEditingMode).not.toHaveBeenCalled();
    finish([{ status: false }]);
    await saving;
    expect(props.saveStory).not.toHaveBeenCalled();
    expect(editor.state.text).toBe("<p>A draft</p>");
    expect(editor.state.uploadError).toContain("draft has been kept");
    expect(editor.state.saving).toBe(false);
    expect(editor.editor.mode.set).toHaveBeenCalledWith("design");
  });

  it("blocks temporary image URLs and retries without losing composition metadata", async function () {
    editor.state.title = "A chapter";
    editor.state.presentation = "composed";
    editor.state.composition = storyComposition({ version: 1, layout: "full" });
    body.innerHTML = '<img src="blob:pending" />';
    await editor.saveStory();
    expect(props.saveStory).not.toHaveBeenCalled();
    body.innerHTML = '<img src="/story-images/permanent" />';
    await editor.saveStory();
    expect(props.saveStory.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        presentation: "composed",
        composition: editor.state.composition,
        text: "<p>Saved narrative</p>"
      })
    );
  });

  it("preserves the classic default without adding composition metadata", async function () {
    editor.state.title = "Classic chapter";
    await editor.saveStory();
    expect(props.saveStory.calls.mostRecent().args[0].presentation).toBe(
      "classic"
    );
    expect(
      props.saveStory.calls.mostRecent().args[0].composition
    ).toBeUndefined();
  });

  it("requires an explicit discard for a changed draft and leaves nested dialogs in charge of Escape", function () {
    editor.state.title = "Changed";
    editor.cancelEditing();
    expect(props.exitEditingMode).not.toHaveBeenCalled();
    expect(editor.state.discardOpen).toBe(true);
    editor.keepEditing();
    const dialog = document.createElement("dialog");
    document.body.append(dialog);
    dialog.showModal();
    try {
      editor.onKeyDown(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(editor.state.discardOpen).toBe(false);
    } finally {
      dialog.close();
      dialog.remove();
    }
    editor.discardChanges();
    expect(props.exitEditingMode).toHaveBeenCalled();
    expect(props.viewState.setStoryHasUnsavedChanges).toHaveBeenCalledWith(
      false
    );
  });
});
