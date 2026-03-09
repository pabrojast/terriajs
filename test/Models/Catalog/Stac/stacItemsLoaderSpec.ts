import {
  buildStacItemsGetUrl,
  buildStacSearchBody,
  parseSortByString,
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

  it("uses search mode when sortBy is set in auto mode", function () {
    const mode = resolveStacItemsQueryMode({
      sortBy: "-datetime"
    });
    expect(mode).toBe("search");
  });

  it("uses explicit items mode even when sortBy is set", function () {
    const mode = resolveStacItemsQueryMode({
      itemsQueryMode: "items",
      sortBy: "-datetime"
    });
    expect(mode).toBe("items");
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

  it("builds search body with sortby in STAC Sort Extension format", function () {
    const body = buildStacSearchBody({
      collectionId: "terrascope-s2-chl-v1",
      limit: 12,
      sortBy: "-datetime"
    });

    expect(body.sortby).toEqual([
      { field: "properties.datetime", direction: "desc" }
    ]);
  });

  it("builds search body with multiple sortby fields", function () {
    const body = buildStacSearchBody({
      collectionId: "test",
      limit: 10,
      sortBy: "-datetime,+eo:cloud_cover"
    });

    expect(body.sortby).toEqual([
      { field: "properties.datetime", direction: "desc" },
      { field: "properties.eo:cloud_cover", direction: "asc" }
    ]);
  });

  it("parseSortByString handles descending shorthand", function () {
    expect(parseSortByString("-datetime")).toEqual([
      { field: "properties.datetime", direction: "desc" }
    ]);
  });

  it("parseSortByString handles ascending shorthand", function () {
    expect(parseSortByString("+datetime")).toEqual([
      { field: "properties.datetime", direction: "asc" }
    ]);
  });

  it("parseSortByString defaults to ascending", function () {
    expect(parseSortByString("datetime")).toEqual([
      { field: "properties.datetime", direction: "asc" }
    ]);
  });

  it("parseSortByString preserves top-level STAC fields without prefix", function () {
    expect(parseSortByString("-id,+collection")).toEqual([
      { field: "id", direction: "desc" },
      { field: "collection", direction: "asc" }
    ]);
  });

  it("parseSortByString preserves existing properties. prefix", function () {
    expect(parseSortByString("-properties.datetime")).toEqual([
      { field: "properties.datetime", direction: "desc" }
    ]);
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
