import {
  buildTerrascopeViewerUrl,
  findStacPreviewAsset,
  findStacPreviewAssets,
  getStacAssetAccessLink,
  hasValidCesiumRectangle,
  normalizeStacBbox,
  normalizeStacRawBbox,
  resolveStacHref,
  shouldForcePreviewForProtectedTerrascopeAsset
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

  it("returns preview assets sorted by preference", function () {
    const previewAssets = findStacPreviewAssets(
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

    expect(previewAssets.length).toBe(2);
    expect(previewAssets[0].key).toBe("preview");
    expect(previewAssets[1].key).toBe("QUICKLOOK");
  });

  it("ignores non-image assets even if keys look like previews", function () {
    const previewAsset = findStacPreviewAsset(
      {
        thumbnail_json: {
          href: "https://example.com/thumbnail.json",
          type: "application/json",
          roles: ["thumbnail"]
        },
        QUICKLOOK: {
          href: "https://example.com/quicklook.png",
          type: "image/png",
          roles: ["thumbnail"]
        }
      },
      "https://example.com/collection"
    );

    expect(previewAsset?.key).toBe("QUICKLOOK");
    expect(previewAsset?.resolvedHref).toBe(
      "https://example.com/quicklook.png"
    );
  });

  it("prefers titiler preview over quicklook for Terrascope catalogs", function () {
    const previewAsset = findStacPreviewAsset(
      {
        preview: {
          href: "https://titiler.terrascope.be/collections/terrascope-s2-rhow-v1/items/S2A_ITEM/preview?assets=B04&assets=B03&assets=B02&format=png",
          type: "image/png",
          roles: ["thumbnail", "overview"]
        },
        QUICKLOOK: {
          href: "https://services.terrascope.be/download/Sentinel2/RHOW_V1/2026/02/09/S2A_ITEM/S2A_ITEM_QUICKLOOK_V121.png",
          type: "image/png",
          roles: ["thumbnail"]
        }
      },
      "https://stac.terrascope.be/collections/terrascope-s2-rhow-v1"
    );

    expect(previewAsset?.key).toBe("preview");
    expect(previewAsset?.resolvedHref).toContain("titiler.terrascope.be");
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

  it("normalizes 3D STAC bbox arrays to lon/lat values", function () {
    const normalized = normalizeStacBbox([31.3, 48.9, 0, 33.7, 49.7, 1000]);
    expect(normalized).toEqual([31.3, 48.9, 33.7, 49.7]);
  });

  it("normalizes projected 3D bbox arrays without geographic range checks", function () {
    const normalized = normalizeStacRawBbox([
      699960.0, 5590200.0, 0, 809760.0, 5700000.0, 0
    ]);
    expect(normalized).toEqual([699960.0, 5590200.0, 809760.0, 5700000.0]);
  });

  it("builds Terrascope viewer URL using normalized 3D bbox values", function () {
    const viewerUrl = buildTerrascopeViewerUrl({
      collectionId: "terrascope-s2-chl-v1",
      bbox: [31.3, 48.9, 0, 33.7, 49.7, 1000],
      datetime: "2025-05-03T10:30:00Z"
    });

    expect(viewerUrl).toBeDefined();
    const parsed = new URL(viewerUrl!);
    expect(parsed.searchParams.get("bbox")).toBe("31.3,48.9,33.7,49.7");
    expect(parsed.searchParams.get("layer")).toBe("terrascope-s2-chl-v1_chl");
  });

  it("validates Cesium rectangle-like objects", function () {
    expect(
      hasValidCesiumRectangle({
        west: 0,
        south: 0,
        east: 1,
        north: 1
      })
    ).toBe(true);
    expect(
      hasValidCesiumRectangle({
        west: 0,
        south: 0,
        east: Number.NaN,
        north: 1
      })
    ).toBe(false);
    expect(hasValidCesiumRectangle(undefined)).toBe(false);
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

  it("forces preview for protected Terrascope assets", function () {
    const shouldForcePreview = shouldForcePreviewForProtectedTerrascopeAsset({
      asset: {
        href: "https://services.terrascope.be/download/secure-data.tif",
        "auth:refs": ["oidc"]
      },
      resolvedAssetHref:
        "https://services.terrascope.be/download/secure-data.tif",
      catalogUrl: "https://stac.terrascope.be/collections/terrascope-s2-chl-v1"
    });

    expect(shouldForcePreview).toBe(true);
  });

  it("does not force preview for protected non-Terrascope assets", function () {
    const shouldForcePreview = shouldForcePreviewForProtectedTerrascopeAsset({
      asset: {
        href: "https://example.com/download/secure-data.tif",
        "auth:refs": ["oidc"]
      },
      resolvedAssetHref: "https://example.com/download/secure-data.tif",
      catalogUrl: "https://example.com/stac"
    });

    expect(shouldForcePreview).toBe(false);
  });
});
