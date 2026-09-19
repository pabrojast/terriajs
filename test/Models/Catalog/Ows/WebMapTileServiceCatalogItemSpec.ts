import i18next from "i18next";
import { autorun, runInAction } from "mobx";
import WebMapTileServiceCatalogItem, {
  matchCapabilitiesProtocol
} from "../../../../lib/Models/Catalog/Ows/WebMapTileServiceCatalogItem";
import Terria from "../../../../lib/Models/Terria";

describe("WebMapTileServiceCatalogItem", function () {
  let terria: Terria;
  let wmts: WebMapTileServiceCatalogItem;
  beforeEach(function () {
    terria = new Terria();
    wmts = new WebMapTileServiceCatalogItem("test", terria);
  });

  it("uses https tile templates when the capabilities came over https from the same host", function () {
    const template =
      "http://tiles.example.com/wmts/layer/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg";
    const https = template.replace("http://", "https://");

    expect(
      matchCapabilitiesProtocol(
        template,
        "https://tiles.example.com/wmts/1.0.0/WMTSCapabilities.xml"
      )
    ).toBe(https);
    // Different host, http capabilities, relative capabilities or already-https templates are left alone.
    expect(
      matchCapabilitiesProtocol(template, "https://other.example.com/caps.xml")
    ).toBe(template);
    expect(
      matchCapabilitiesProtocol(template, "http://tiles.example.com/caps.xml")
    ).toBe(template);
    expect(matchCapabilitiesProtocol(template, "test/WMTS/caps.xml")).toBe(
      template
    );
    expect(matchCapabilitiesProtocol(template, undefined)).toBe(template);
    expect(
      matchCapabilitiesProtocol(https, "https://tiles.example.com/caps.xml")
    ).toBe(https);
  });

  it("has a type", function () {
    expect(wmts.type).toBe("wmts");
  });

  it("derives getCapabilitiesUrl from url if getCapabilitiesUrl is not specifiied", function () {
    wmts.setTrait("definition", "url", "http://www.example.com");
    expect(wmts.url).toBeDefined();
    expect(
      wmts.getCapabilitiesUrl &&
        wmts.getCapabilitiesUrl.indexOf(wmts.url || "undefined") === 0
    ).toBeTruthy();
  });

  it("updates description from a GetCapabilities", async function () {
    runInAction(() => {
      wmts.setTrait("definition", "url", "test/WMTS/with_tilematrix.xml");
      wmts.setTrait("definition", "layer", "Some_Layer1");
    });

    let description: string | undefined;
    const cleanup = autorun(() => {
      if (wmts.info !== undefined) {
        const descSection = wmts.info.find(
          (section) =>
            section.name ===
            i18next.t("models.webMapTileServiceCatalogItem.dataDescription")
        );
        if (
          descSection !== undefined &&
          descSection.content !== undefined &&
          descSection.content !== null
        ) {
          description = descSection.content;
        }
      }
    });

    try {
      await wmts.loadMetadata();
      expect(description).toBe("description foo bar baz");
    } finally {
      cleanup();
    }
  });

  // it("correctly contstructs ImageryProvider with ResourceUrl", async function() {
  //   runInAction(() => {
  //     wmts.setTrait("definition", "url", "test/WMTS/with_tilematrix.xml");
  //     wmts.setTrait("definition", "layer", "Some_Layer1");
  //   });

  //   let mapItems: ImageryParts[] = [];

  //   const cleanup = autorun(() => {
  //     mapItems = wmts.mapItems.slice();
  //   });

  //   try {
  //     await wmts.loadMapItems();

  //     expect(mapItems.length).toBe(1);
  //     expect(mapItems[0].alpha).toBeCloseTo(0.8);
  //     expect(
  //       mapItems[0].imageryProvider instanceof WebMapTileServiceImageryProvider
  //     ).toBeTruthy();
  //     if (
  //       mapItems[0].imageryProvider instanceof WebMapTileServiceImageryProvider
  //     ) {
  //       expect(mapItems[0].imageryProvider.url).toBe(
  //         "https://some.provider/wmts/Some_Layer1/default/GoogleMapsCompatible_Level9/{TileMatrix}/{TileRow}/{TileCol}.png"
  //       );
  //     }
  //   } finally {
  //     cleanup();
  //   }
  // });

  // it("correctly contstructs ImageryProvider", async function() {
  //   runInAction(() => {
  //     wmts.setTrait("definition", "url", "test/WMTS/with_tilematrix.xml");
  //     wmts.setTrait("definition", "layer", "Some_Layer3");
  //   });

  //   let mapItems: ImageryParts[] = [];

  //   const cleanup = autorun(() => {
  //     mapItems = wmts.mapItems.slice();
  //   });

  //   try {
  //     await wmts.loadMapItems();

  //     expect(mapItems.length).toBe(1);
  //     expect(mapItems[0].alpha).toBeCloseTo(0.8);
  //     expect(
  //       mapItems[0].imageryProvider instanceof WebMapTileServiceImageryProvider
  //     ).toBeTruthy();
  //     if (
  //       mapItems[0].imageryProvider instanceof WebMapTileServiceImageryProvider
  //     ) {
  //       const url = new URI(mapItems[0].imageryProvider.url)
  //         .search("")
  //         .toString();
  //       expect(url).toEqual("test/WMTS/with_tilematrix.xml");
  //     }
  //   } finally {
  //     cleanup();
  //   }
  // });

  it("calculates correct tileMatrixSet", async function () {
    runInAction(() => {
      wmts.setTrait("definition", "url", "test/WMTS/with_tilematrix.xml");
      wmts.setTrait("definition", "layer", "Some_Layer1");
    });

    await wmts.loadMapItems();
    expect(wmts.tileMatrixSet).toBeDefined();
    expect(wmts.tileMatrixSet!.id).toEqual("GoogleMapsCompatible_Level9");
    expect(wmts.tileMatrixSet!.labels.length).toBe(10);
    expect(wmts.tileMatrixSet!.maxLevel).toBe(9);
    expect(wmts.tileMatrixSet!.minLevel).toBe(0);
    expect(wmts.tileMatrixSet!.tileWidth).toEqual(256);
    expect(wmts.tileMatrixSet!.tileHeight).toEqual(256);
  });

  it("non existing tile matrix set", async function () {
    runInAction(() => {
      wmts.setTrait("definition", "url", "test/WMTS/with_tilematrix.xml");
      wmts.setTrait("definition", "layer", "Layer_With_Bad_Tilematrixset");
    });
    await wmts.loadMapItems();

    expect(wmts.tileMatrixSet!.id).toEqual(
      "urn:ogc:def:wkss:OGC:1.0:GoogleMapsCompatible"
    );
    expect(wmts.tileMatrixSet!.labels.length).toBe(0);
    expect(wmts.tileMatrixSet!.maxLevel).toBe(0);
    expect(wmts.tileMatrixSet!.minLevel).toBe(0);
    expect(wmts.tileMatrixSet!.tileWidth).toEqual(256);
    expect(wmts.tileMatrixSet!.tileHeight).toEqual(256);
  });
});
