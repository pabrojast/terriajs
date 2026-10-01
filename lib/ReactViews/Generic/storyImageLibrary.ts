export interface StoryLibraryImage {
  id: string;
  url: string;
  alt: string;
  caption: string;
  credit: string;
}

/** Keep the cookie on the CKAN origin and only accept this picker window. */
export function chooseStoryImage(
  endpoint: string
): Promise<StoryLibraryImage | undefined> {
  const url = new URL(endpoint, location.href);
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) {
    return Promise.reject(
      new Error("The image library must use the IHP portal on this site.")
    );
  }
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "My images");
    dialog.style.cssText =
      "width:min(950px,calc(100vw - 32px));height:min(750px,calc(100vh - 32px));padding:12px;border:1px solid #aabbc9;border-radius:8px;background:white;z-index:100001";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.style.cssText =
      "display:block;padding:8px 16px;margin-bottom:8px;cursor:pointer";
    const frame = document.createElement("iframe");
    frame.title = "My images";
    frame.src = url.href;
    frame.style.cssText = "width:100%;height:calc(100% - 48px);border:0";
    function finish(image?: StoryLibraryImage) {
      window.removeEventListener("message", selected);
      dialog.close();
      dialog.remove();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
      resolve(image);
    }
    function selected(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.contentWindow ||
        event.data?.type !== "ckan-story-image-selected"
      )
        return;
      const image = event.data.image;
      try {
        const imageUrl = new URL(image.url, location.origin);
        if (
          imageUrl.origin !== location.origin ||
          !imageUrl.pathname.startsWith("/story-images/")
        )
          return;
        finish({
          id: String(image.id),
          url: imageUrl.href,
          alt: String(image.alt || ""),
          caption: String(image.caption || ""),
          credit: String(image.credit || "")
        });
      } catch (_) {
        /* Ignore malformed messages. */
      }
    }
    close.onclick = () => finish();
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish();
    });
    window.addEventListener("message", selected);
    dialog.append(close, frame);
    document.body.append(dialog);
    dialog.showModal();
  });
}
