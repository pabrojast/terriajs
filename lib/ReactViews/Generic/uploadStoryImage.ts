/** Upload through CKAN's same-origin session, never through the map proxy. */
export async function uploadStoryImage(
  endpoint: string,
  original: Blob,
  filename: string,
  progress: (percent: number) => void
): Promise<string> {
  const url = new URL(endpoint, location.href);
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol))
    throw new Error("Image uploads must use the CKAN portal on this site.");
  if (
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
      original.type
    )
  )
    throw new Error("Choose a JPEG, PNG, WebP or GIF image.");
  const response = await fetch(url.href, {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("json"))
    throw new Error(
      "Sign in to CKAN before uploading images. Your draft has been kept."
    );
  const settings = await response.json();
  // CKAN validates and optimizes once, identically for all editors.
  const blob = original;
  if (Number.isFinite(settings.max_bytes) && blob.size > settings.max_bytes)
    throw new Error(
      "This image exceeds the portal upload limit. Choose a smaller image."
    );
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url.href);
    xhr.timeout = 120000;
    xhr.withCredentials = true;
    if (settings.csrf_token)
      xhr.setRequestHeader("X-CSRFToken", settings.csrf_token);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress((event.loaded / event.total) * 100);
    };
    xhr.onerror = xhr.ontimeout = () =>
      reject(
        new Error(
          "Image upload interrupted. Please retry; your draft has been kept."
        )
      );
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (
          xhr.status < 200 ||
          xhr.status >= 300 ||
          result.uploaded !== 1 ||
          !result.url
        )
          throw new Error(
            result.error?.message || "Image upload failed. Sign in and retry."
          );
        const imageUrl = new URL(result.url, location.origin);
        if (!/^https?:$/.test(imageUrl.protocol))
          throw new Error("Invalid uploaded image URL.");
        resolve(imageUrl.href);
      } catch (error) {
        reject(
          error instanceof Error ? error : new Error("Image upload failed.")
        );
      }
    };
    const form = new FormData();
    form.append("upload", blob, filename || "story-image");
    if (settings.csrf_token) form.append("_csrf_token", settings.csrf_token);
    xhr.send(form);
  });
}
