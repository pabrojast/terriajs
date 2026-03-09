import Terria from "../../../../lib/Models/Terria";
import StacCollectionCatalogItem from "../../../../lib/Models/Catalog/Stac/StacCollectionCatalogItem";
import CommonStrata from "../../../../lib/Models/Definition/CommonStrata";
import { getTerrascopeAuthSession } from "../../../../lib/Models/Catalog/Stac/TerrascopeAuth";

// Sample STAC Collection JSON for testing
const _SAMPLE_STAC_COLLECTION = {
  id: "test-collection",
  type: "Collection",
  stac_version: "1.1.0",
  title: "Test STAC Collection",
  description: "A test STAC collection for unit testing",
  license: "CC-BY-4.0",
  keywords: ["test", "stac", "cog"],
  providers: [
    {
      name: "Test Provider",
      roles: ["producer"],
      url: "https://example.com"
    }
  ],
  extent: {
    spatial: {
      bbox: [[-180, -90, 180, 90]]
    },
    temporal: {
      interval: [["2020-01-01T00:00:00Z", null]]
    }
  },
  links: [
    {
      rel: "self",
      href: "https://example.com/collections/test-collection",
      type: "application/json"
    },
    {
      rel: "items",
      href: "https://example.com/collections/test-collection/items",
      type: "application/geo+json"
    }
  ],
  summaries: {
    bands: [
      {
        name: "data",
        data_type: "uint16",
        unit: "m"
      }
    ]
  },
  item_assets: {
    data: {
      type: "image/tiff; application=geotiff; profile=cloud-optimized",
      title: "Data",
      roles: ["data"]
    }
  },
  renders: {
    default: {
      title: "Default Render",
      assets: ["data"],
      rescale: [[0, 1000]],
      colormap_name: "viridis"
    }
  }
};

describe("StacCollectionCatalogItem", function () {
  let item: StacCollectionCatalogItem;
  let terria: Terria;

  beforeEach(function () {
    terria = new Terria();
    item = new StacCollectionCatalogItem("test-stac", terria);
  });

  it("should have a type 'stac-collection'", function () {
    expect(item.type).toEqual("stac-collection");
  });

  it("can be instantiated", function () {
    expect(item).toBeDefined();
  });

  describe("traits", function () {
    it("can set url trait", function () {
      item.setTrait(
        CommonStrata.user,
        "url",
        "https://stac.terrascope.be/collections/terrascope-s2-chl-v1"
      );
      expect(item.url).toBe(
        "https://stac.terrascope.be/collections/terrascope-s2-chl-v1"
      );
    });

    it("can set collectionId trait", function () {
      item.setTrait(CommonStrata.user, "collectionId", "my-collection");
      expect(item.collectionId).toBe("my-collection");
    });

    it("can set maximumItems trait", function () {
      item.setTrait(CommonStrata.user, "maximumItems", 5);
      expect(item.maximumItems).toBe(5);
    });

    it("can set previewRequestSizeLimit trait", function () {
      item.setTrait(CommonStrata.user, "previewRequestSizeLimit", 4);
      expect(item.previewRequestSizeLimit).toBe(4);
    });

    it("can set previewRequestNumberLimit trait", function () {
      item.setTrait(CommonStrata.user, "previewRequestNumberLimit", 2);
      expect(item.previewRequestNumberLimit).toBe(2);
    });

    it("can set dateTimeFilter trait", function () {
      item.setTrait(
        CommonStrata.user,
        "dateTimeFilter",
        "2023-01-01/2023-12-31"
      );
      expect(item.dateTimeFilter).toBe("2023-01-01/2023-12-31");
    });

    it("can set bboxFilter trait", function () {
      item.setTrait(CommonStrata.user, "bboxFilter", [-10, -10, 10, 10]);
      expect(item.bboxFilter).toEqual([-10, -10, 10, 10]);
    });

    it("can set itemsQueryMode trait", function () {
      item.setTrait(CommonStrata.user, "itemsQueryMode", "search");
      expect(item.itemsQueryMode).toBe("search");
    });

    it("can set itemsPageSize trait", function () {
      item.setTrait(CommonStrata.user, "itemsPageSize", 25);
      expect(item.itemsPageSize).toBe(25);
    });

    it("can set itemsPageLimit trait", function () {
      item.setTrait(CommonStrata.user, "itemsPageLimit", 4);
      expect(item.itemsPageLimit).toBe(4);
    });

    it("can set sortBy trait", function () {
      item.setTrait(CommonStrata.user, "sortBy", "-datetime");
      expect(item.sortBy).toBe("-datetime");
    });

    it("can set filterExpression and filterLanguage traits", function () {
      item.setTrait(
        CommonStrata.user,
        "filterExpression",
        "eo:cloud_cover < 20"
      );
      item.setTrait(CommonStrata.user, "filterLanguage", "cql2-text");
      expect(item.filterExpression).toBe("eo:cloud_cover < 20");
      expect(item.filterLanguage).toBe("cql2-text");
    });

    it("can set intersectsGeometry trait", function () {
      item.setTrait(CommonStrata.user, "intersectsGeometry", {
        type: "Point",
        coordinates: [4.4, 50.9]
      });
      expect(item.intersectsGeometry?.type).toBe("Point");
    });

    it("can set additionalQueryParameters trait", function () {
      item.setTrait(CommonStrata.user, "additionalQueryParameters", {
        foo: "bar",
        limit: 999
      });
      expect(item.additionalQueryParameters?.foo).toBe("bar");
    });

    it("can set request controls traits", function () {
      item.setTrait(CommonStrata.user, "requestTimeoutSeconds", 45);
      item.setTrait(CommonStrata.user, "requestRetryAttempts", 2);
      item.setTrait(CommonStrata.user, "requestRetryDelaySeconds", 1.5);
      expect(item.requestTimeoutSeconds).toBe(45);
      expect(item.requestRetryAttempts).toBe(2);
      expect(item.requestRetryDelaySeconds).toBe(1.5);
    });

    it("can set asset configuration", function () {
      item.setTrait(CommonStrata.user, "asset", {
        assetKey: "CHL",
        bandName: undefined
      });
      expect(item.asset?.assetKey).toBe("CHL");
    });

    it("can set render configuration", function () {
      item.setTrait(CommonStrata.user, "render", {
        renderKey: "chl",
        colormapName: "viridis",
        rescale: undefined
      });
      expect(item.render?.renderKey).toBe("chl");
      expect(item.render?.colormapName).toBe("viridis");
    });

    it("can set auth configuration", function () {
      item.setTrait(CommonStrata.user, "auth", {
        mode: "oidc_password",
        tokenUrl: "https://sso.example.com/token",
        clientId: "public",
        scope: undefined,
        tokenPersistence: undefined
      });
      expect(item.auth?.mode).toBe("oidc_password");
      expect(item.auth?.tokenUrl).toBe("https://sso.example.com/token");
      expect(item.auth?.clientId).toBe("public");
    });

    it("can set timeSeries configuration", function () {
      item.setTrait(CommonStrata.user, "timeSeries", {
        enabled: true,
        chartEnabled: true,
        providerCacheSize: 5,
        valueBand: 2
      });
      expect(item.timeSeries?.enabled).toBe(true);
      expect(item.timeSeries?.chartEnabled).toBe(true);
      expect(item.timeSeries?.providerCacheSize).toBe(5);
      expect(item.timeSeries?.valueBand).toBe(2);
    });
  });

  describe("typeName", function () {
    it("returns STAC Collection", function () {
      expect(item.typeName).toBe("STAC Collection");
    });
  });

  describe("asset auth handling", function () {
    it("preserves auth refs from collection assets when no items are available", function () {
      const stratum = {
        firstItem: undefined,
        collection: {
          assets: {
            CHL: {
              href: "https://services.terrascope.be/download/chl.tif",
              type: "image/tiff; application=geotiff; profile=cloud-optimized",
              "auth:refs": ["oidc"]
            }
          },
          item_assets: {}
        }
      } as any;

      const cogAsset = (item as any).findCogAsset(stratum);

      expect(cogAsset?.key).toBe("CHL");
      expect(cogAsset?.["auth:refs"]).toEqual(["oidc"]);
    });

    it("collects preview candidates from all items", function () {
      const stratum = {
        items: [
          {
            bbox: [31, 48, 32, 49],
            assets: {
              QUICKLOOK: {
                href: "https://services.terrascope.be/download/quicklook-1.png",
                roles: ["thumbnail"],
                type: "image/png"
              }
            }
          },
          {
            bbox: [32, 48, 33, 49],
            assets: {
              preview: {
                href: "https://titiler.terrascope.be/preview-2.png",
                roles: ["thumbnail", "overview"],
                type: "image/png"
              }
            }
          }
        ],
        firstItem: undefined,
        collection: {
          assets: {},
          extent: {
            spatial: { bbox: [[0, 0, 1, 1]] }
          }
        }
      } as any;

      const previewCandidates = (item as any).getPreviewCandidates(stratum);

      expect(previewCandidates.length).toBe(2);
      expect(previewCandidates[0].hrefs[0]).toContain("quicklook-1.png");
      expect(previewCandidates[1].hrefs[0]).toContain("preview-2.png");
    });

    it("applies previewRequestSizeLimit when collecting preview candidates", function () {
      item.setTrait(CommonStrata.user, "previewRequestSizeLimit", 1);

      const stratum = {
        items: [
          {
            bbox: [31, 48, 32, 49],
            assets: {
              QUICKLOOK: {
                href: "https://services.terrascope.be/download/quicklook-1.png",
                roles: ["thumbnail"],
                type: "image/png"
              }
            }
          },
          {
            bbox: [32, 48, 33, 49],
            assets: {
              preview: {
                href: "https://titiler.terrascope.be/preview-2.png",
                roles: ["thumbnail", "overview"],
                type: "image/png"
              }
            }
          }
        ],
        firstItem: undefined,
        collection: {
          assets: {},
          extent: {
            spatial: { bbox: [[0, 0, 1, 1]] }
          }
        }
      } as any;

      const previewCandidates = (item as any).getPreviewCandidates(stratum);

      expect(previewCandidates.length).toBe(1);
      expect(previewCandidates[0].hrefs[0]).toContain("quicklook-1.png");
    });

    it("keeps fallback preview URLs per item when available", function () {
      const stratum = {
        items: [
          {
            bbox: [31, 48, 32, 49],
            assets: {
              QUICKLOOK: {
                href: "https://services.terrascope.be/download/quicklook-1.png",
                roles: ["thumbnail"],
                type: "image/png"
              },
              preview: {
                href: "https://titiler.terrascope.be/preview-1.png",
                roles: ["thumbnail", "overview"],
                type: "image/png"
              }
            }
          }
        ],
        firstItem: undefined,
        collection: {
          assets: {},
          extent: {
            spatial: { bbox: [[0, 0, 1, 1]] }
          }
        }
      } as any;

      const previewCandidates = (item as any).getPreviewCandidates(stratum);

      expect(previewCandidates.length).toBe(1);
      expect(previewCandidates[0].hrefs.length).toBe(2);
      expect(previewCandidates[0].hrefs[0]).toContain("preview-1.png");
      expect(previewCandidates[0].hrefs[1]).toContain("quicklook-1.png");
    });

    it("normalizes 3D item bbox values when collecting preview candidates", function () {
      const stratum = {
        items: [
          {
            bbox: [31, 48, 0, 32, 49, 1000],
            assets: {
              preview: {
                href: "https://titiler.terrascope.be/preview-3d.png",
                roles: ["thumbnail", "overview"],
                type: "image/png"
              }
            }
          }
        ],
        firstItem: undefined,
        collection: {
          assets: {},
          extent: {
            spatial: { bbox: [[0, 0, 1, 1]] }
          }
        }
      } as any;

      const previewCandidates = (item as any).getPreviewCandidates(stratum);
      expect(previewCandidates.length).toBe(1);
      expect(previewCandidates[0].bbox).toEqual([31, 48, 32, 49]);
    });

    it("uses projected bbox metadata to improve preview alignment", async function () {
      const candidate = {
        hrefs: ["https://example.com/preview.png"],
        bbox: [
          5.81551011356698, 50.38212225093181, 7.450589699013681,
          51.41589769639834
        ],
        projectedBbox: [699960.0, 5590200.0, 809760.0, 5700000.0],
        projectedCode: "EPSG:32631"
      };

      const resolvedBbox = await (item as any).resolvePreviewCandidateBbox(
        candidate
      );

      expect(resolvedBbox[0]).toBeCloseTo(5.8155, 3);
      expect(resolvedBbox[1]).toBeCloseTo(50.4297, 3);
      expect(resolvedBbox[2]).toBeCloseTo(7.4505, 3);
      expect(resolvedBbox[3]).toBeCloseTo(51.3666, 3);
    });

    it("skips invalid imagery providers when building mapItems", function () {
      (item as any)._imageryProviders = [{ rectangle: undefined }];

      const mapItems = item.mapItems;
      expect(mapItems.length).toBe(0);
    });

    it("groups STAC items into discrete time-series steps", function () {
      item.setTrait(
        CommonStrata.user,
        "url",
        "https://example.com/collections/test-collection"
      );
      item.setTrait(CommonStrata.user, "timeSeries", {
        enabled: true,
        chartEnabled: true,
        providerCacheSize: undefined,
        valueBand: undefined
      });

      (item as any)._stacStratum = {
        collection: _SAMPLE_STAC_COLLECTION,
        items: [
          {
            id: "item-1",
            properties: { datetime: "2026-01-01T00:00:00Z" },
            assets: {
              data: {
                href: "https://example.com/a-1.tif",
                type: "image/tiff",
                roles: ["data"]
              },
              preview: {
                href: "https://example.com/a-1.png",
                type: "image/png",
                roles: ["thumbnail"]
              }
            }
          },
          {
            id: "item-2",
            properties: { datetime: "2026-01-01T00:00:00Z" },
            assets: {
              data: {
                href: "https://example.com/a-2.tif",
                type: "image/tiff",
                roles: ["data"]
              }
            }
          },
          {
            id: "item-3",
            properties: { datetime: "2026-01-02T00:00:00Z" },
            assets: {
              data: {
                href: "https://example.com/b-1.tif",
                type: "image/tiff",
                roles: ["data"]
              }
            }
          }
        ]
      } as any;

      expect(item.timeSeriesEntries).toEqual([
        {
          time: "2026-01-01T00:00:00Z",
          tag: "2026-01-01T00:00:00Z",
          cogs: ["https://example.com/a-1.tif", "https://example.com/a-2.tif"],
          requiresAuthentication: false
        },
        {
          time: "2026-01-02T00:00:00Z",
          tag: "2026-01-02T00:00:00Z",
          cogs: ["https://example.com/b-1.tif"],
          requiresAuthentication: false
        }
      ]);
      expect(item.discreteTimes).toEqual([
        {
          time: "2026-01-01T00:00:00Z",
          tag: "2026-01-01T00:00:00Z"
        },
        {
          time: "2026-01-02T00:00:00Z",
          tag: "2026-01-02T00:00:00Z"
        }
      ]);
      expect(item.canUseTimeSeriesRendering).toBe(true);
    });

    it("requires an authenticated Terrascope session before enabling protected time-series rendering", function () {
      const terrascopeUrl =
        "https://stac.terrascope.be/collections/terrascope-s2-chl-v1";
      item.setTrait(CommonStrata.user, "url", terrascopeUrl);
      item.setTrait(CommonStrata.user, "timeSeries", {
        enabled: true,
        chartEnabled: true,
        providerCacheSize: undefined,
        valueBand: undefined
      });
      (item as any)._stacStratum = {
        collection: _SAMPLE_STAC_COLLECTION,
        items: [
          {
            id: "protected-item",
            properties: { datetime: "2026-01-01T00:00:00Z" },
            assets: {
              data: {
                href: "https://services.terrascope.be/download/protected.tif",
                type: "image/tiff",
                roles: ["data"],
                "auth:refs": ["oidc"]
              }
            }
          }
        ]
      } as any;

      expect(item.canUseTimeSeriesRendering).toBe(false);
      expect(item.discreteTimes).toBeUndefined();

      const session = getTerrascopeAuthSession(
        terria,
        "https://services.terrascope.be/download/protected.tif",
        item.authConfig
      )!;
      (session as any).accessToken = "test-access-token";
      session.headers.Authorization = "Bearer test-access-token";

      const authenticatedItem = new StacCollectionCatalogItem(
        "test-stac-authenticated",
        terria
      );
      authenticatedItem.setTrait(CommonStrata.user, "url", terrascopeUrl);
      authenticatedItem.setTrait(CommonStrata.user, "timeSeries", {
        enabled: true,
        chartEnabled: true,
        providerCacheSize: undefined,
        valueBand: undefined
      });
      (authenticatedItem as any)._stacStratum = (item as any)._stacStratum;

      expect(authenticatedItem.canUseTimeSeriesRendering).toBe(true);
      expect(authenticatedItem.discreteTimes?.length).toBe(1);

      session.clear();
    });

    it("builds time-series feature info context from CSV data", function () {
      item.setTrait(
        CommonStrata.user,
        "url",
        "https://example.com/collections/test-collection"
      );
      item.setTrait(CommonStrata.user, "timeSeries", {
        enabled: true,
        chartEnabled: true,
        providerCacheSize: undefined,
        valueBand: undefined
      });
      (item as any)._stacStratum = {
        collection: _SAMPLE_STAC_COLLECTION,
        items: [
          {
            id: "item-1",
            properties: { datetime: "2026-01-01T00:00:00Z" },
            assets: {
              data: {
                href: "https://example.com/a-1.tif",
                type: "image/tiff",
                roles: ["data"]
              }
            }
          }
        ]
      } as any;

      const context = item.featureInfoContext({
        id: "feature-1",
        data: "time,value\n2026-01-01T00:00:00Z,1"
      } as any) as any;

      expect(context.terria?.timeSeries?.data).toBe(
        "time,value\n2026-01-01T00:00:00Z,1"
      );
    });
  });
});
