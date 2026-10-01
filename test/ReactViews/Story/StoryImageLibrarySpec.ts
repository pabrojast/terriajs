import { chooseStoryImage } from "../../../lib/ReactViews/Generic/storyImageLibrary";

describe("Story image library", function () {
  it("rejects a foreign origin before creating a picker", async function () {
    await chooseStoryImage("https://other.invalid/images").then(
      () => fail("Foreign library must be rejected"),
      (error) => expect(error.message).toContain("IHP portal")
    );
    expect(document.querySelector('dialog[aria-label="My images"]')).toBeNull();
  });

  it("ignores messages from other windows and closes after a valid selection", async function () {
    const choice = chooseStoryImage("/story-images/library");
    const dialog = document.querySelector('dialog[aria-label="My images"]')!;
    const frame = dialog.querySelector("iframe")!;
    const image = {
      id: "example",
      url: location.origin + "/story-images/example",
      alt: "A lake"
    };
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: window,
        data: { type: "ckan-story-image-selected", image }
      })
    );
    expect(document.body.contains(dialog)).toBe(true);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://other.invalid",
        source: frame.contentWindow,
        data: { type: "ckan-story-image-selected", image }
      })
    );
    expect(document.body.contains(dialog)).toBe(true);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: frame.contentWindow,
        data: { type: "ckan-story-image-selected", image }
      })
    );
    expect((await choice)?.url).toBe(image.url);
    expect(document.body.contains(dialog)).toBe(false);
  });

  it("cancels without inserting anything", async function () {
    const choice = chooseStoryImage("/story-images/library");
    document
      .querySelector<HTMLButtonElement>(
        'dialog[aria-label="My images"] button'
      )!
      .click();
    expect(await choice).toBeUndefined();
  });
});
