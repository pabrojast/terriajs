import {
  buildTerrascopeViewerUrl,
  findStacPreviewAsset,
  getStacAssetAccessLink,
  resolveStacHref
} from "../../../../lib/Models/Catalog/Stac/stacAssetUtils";

describe("stacAssetUtils", function () {
  it("resolves relative STAC hrefs", function () {
    const href = resolveStacHref(
      "/collections/test/items/item-1",
      "https://stac.terrascope.be/"
    );

    expect(href).toBe(
      "https://stac.terrascope.be/collections/test/items/item-1"
    );
  });

  it("prefers preview assets with thumbnail roles", function () {
    const previewAsset = findStacPreviewAsset(
      {
        B04: {
          href: "https://example.com/b04.tif",
          type: "image/tiff",
          roles: ["data"]
        },
        QUICKLOOK: {
          href: "https://example.com/quicklook.png",
          type: "image/png",
          roles: ["thumbnail"]
        },
        preview: {
          href: "https://example.com/preview.png",
          type: "image/png",
          roles: ["thumbnail", "overview"]
        }
      },
      "https://example.com/collection"
    );

    expect(previewAsset?.key).toBe("preview");
    expect(previewAsset?.resolvedHref).toBe("https://example.com/preview.png");
  });

  it("builds a Terrascope viewer URL from collection and item metadata", function () {
    const viewerUrl = buildTerrascopeViewerUrl({
      collectionId: "terrascope-s2-rhow-v1",
      bbox: [31.3, 48.9, 33.7, 49.7],
      datetime: "2025-05-03T10:30:00Z"
    });

    expect(viewerUrl).toBeDefined();
    const parsed = new URL(viewerUrl!);
    expect(parsed.hostname).toBe("viewer.terrascope.be");
    expect(parsed.searchParams.get("date")).toBe("2025-05-03");
    expect(parsed.searchParams.get("bbox")).toBe("31.3,48.9,33.7,49.7");
    expect(parsed.searchParams.get("layer")).toBe("terrascope-s2-rhow-v1_rhow");
  });

  it("routes authenticated Terrascope asset links to the viewer", function () {
    const accessLink = getStacAssetAccessLink({
      asset: {
        href: "https://services.terrascope.be/download/secure-data.tif",
        type: "image/tiff",
        roles: ["data"],
        "auth:refs": ["oidc"]
      },
      resolvedAssetHref:
        "https://services.terrascope.be/download/secure-data.tif",
      catalogUrl:
        "https://stac.terrascope.be/collections/terrascope-s2-rhow-v1",
      terrascopeViewerUrl: "https://viewer.terrascope.be/?layer=test"
    });

    expect(accessLink.href).toBe("https://viewer.terrascope.be/?layer=test");
    expect(accessLink.requiresAuthentication).toBe(true);
    expect(accessLink.redirectsToTerrascopeLogin).toBe(true);
  });

  it("keeps direct links for public assets", function () {
    const accessLink = getStacAssetAccessLink({
      asset: {
        href: "https://example.com/public-preview.png",
        type: "image/png",
        roles: ["thumbnail"]
      },
      resolvedAssetHref: "https://example.com/public-preview.png",
      catalogUrl: "https://example.com/stac"
    });

    expect(accessLink.href).toBe("https://example.com/public-preview.png");
    expect(accessLink.requiresAuthentication).toBe(false);
    expect(accessLink.redirectsToTerrascopeLogin).toBe(false);
  });
});
