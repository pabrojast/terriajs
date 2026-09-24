import { uploadStoryImage } from "../../../lib/ReactViews/Generic/uploadStoryImage";

describe("Story image upload", function () {
  beforeEach(function () {
    jasmine.Ajax.install();
  });
  afterEach(function () {
    jasmine.Ajax.uninstall();
  });

  it("rejects a foreign upload endpoint before sending the CKAN session", async function () {
    const fetch = spyOn(window, "fetch");
    await uploadStoryImage(
      "https://other.invalid/upload",
      new Blob([], { type: "image/gif" }),
      "photo.gif",
      () => {}
    ).then(
      () => fail("Foreign uploads must be rejected"),
      (error) => expect(error.message).toContain("CKAN portal")
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps an expired-session upload from being treated as a saved image", async function () {
    spyOn(window, "fetch").and.returnValue(
      Promise.resolve(new Response("Login", { status: 403 }))
    );
    await uploadStoryImage(
      "/pages_upload",
      new Blob(["GIF89a"], { type: "image/gif" }),
      "photo.gif",
      () => {}
    ).then(
      () => fail("Expired sessions must be rejected"),
      (error) => expect(error.message).toContain("Sign in")
    );
    expect(jasmine.Ajax.requests.count()).toBe(0);
  });

  it("returns the persistent CKAN URL and carries its CSRF token", async function () {
    spyOn(window, "fetch").and.returnValue(
      Promise.resolve(
        new Response(
          JSON.stringify({ csrf_token: "test-csrf", max_bytes: 1000 }),
          { headers: { "Content-Type": "application/json" } }
        )
      )
    );
    jasmine.Ajax.stubRequest(/pages_upload/).andReturn({
      status: 200,
      contentType: "application/json",
      responseText: JSON.stringify({
        uploaded: 1,
        url: "/uploads/page_images/photo.gif"
      })
    });
    const result = await uploadStoryImage(
      "/pages_upload",
      new Blob(["GIF89a"], { type: "image/gif" }),
      "photo.gif",
      () => {}
    );
    expect(result).toBe(location.origin + "/uploads/page_images/photo.gif");
    expect(
      jasmine.Ajax.requests.mostRecent().requestHeaders["X-CSRFToken"]
    ).toBe("test-csrf");
  });
});
