import {
  buildStacItemsGetUrl,
  buildStacSearchBody,
  resolveStacItemsQueryMode,
  resolveStacSearchUrl
} from "../../../../lib/Models/Catalog/Stac/stacItemsLoader";

describe("stacItemsLoader", function () {
  it("uses items mode by default", function () {
    const mode = resolveStacItemsQueryMode({});
    expect(mode).toBe("items");
  });

  it("uses search mode when filter expression is set in auto mode", function () {
    const mode = resolveStacItemsQueryMode({
      itemsQueryMode: "auto",
      filterExpression: "eo:cloud_cover < 20"
    });
    expect(mode).toBe("search");
  });

  it("uses explicit search mode when requested", function () {
    const mode = resolveStacItemsQueryMode({
      itemsQueryMode: "search"
    });
    expect(mode).toBe("search");
  });

  it("builds items GET URL with filters and additional params", function () {
    const url = buildStacItemsGetUrl({
      itemsUrl: "https://stac.example.com/collections/test/items",
      limit: 10,
      dateTimeFilter: "2026-01-01/2026-01-31",
      bboxFilter: [4.0, 50.0, 5.0, 51.0],
      sortBy: "-datetime",
      additionalQueryParameters: {
        fields: ["id", "bbox"]
      }
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(parsed.searchParams.get("datetime")).toBe("2026-01-01/2026-01-31");
    expect(parsed.searchParams.get("bbox")).toBe("4,50,5,51");
    expect(parsed.searchParams.get("sortby")).toBe("-datetime");
    expect(parsed.searchParams.getAll("fields")).toEqual(["id", "bbox"]);
  });

  it("builds search body with cql2 defaults", function () {
    const body = buildStacSearchBody({
      collectionId: "terrascope-s2-rhow-v1",
      limit: 25,
      filterExpression: "eo:cloud_cover < 20",
      bboxFilter: [4.0, 50.0, 5.0, 51.0]
    });

    expect(body.collections).toEqual(["terrascope-s2-rhow-v1"]);
    expect(body.limit).toBe(25);
    expect(body.filter).toBe("eo:cloud_cover < 20");
    expect(body["filter-lang"]).toBe("cql2-text");
    expect(body.bbox).toEqual([4.0, 50.0, 5.0, 51.0]);
  });

  it("resolves STAC search URL from collection links", function () {
    const url = resolveStacSearchUrl(
      {
        id: "test",
        links: [
          {
            rel: "search",
            href: "https://stac.example.com/search"
          }
        ]
      },
      "https://stac.example.com/collections/test"
    );

    expect(url).toBe("https://stac.example.com/search");
  });

  it("derives STAC search URL from collection URL when no link is available", function () {
    const url = resolveStacSearchUrl(
      {
        id: "test",
        links: []
      },
      "https://stac.example.com/collections/test"
    );

    expect(url).toBe("https://stac.example.com/search");
  });
});
