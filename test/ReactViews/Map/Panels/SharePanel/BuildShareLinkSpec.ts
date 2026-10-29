import { action, runInAction } from "mobx";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import queryToObject from "terriajs-cesium/Source/Core/queryToObject";
import Entity from "terriajs-cesium/Source/DataSources/Entity";
import SplitDirection from "terriajs-cesium/Source/Scene/SplitDirection";
import URI from "urijs";
import { USER_ADDED_CATEGORY_ID } from "../../../../../lib/Core/addedByUser";
import PickedFeatures from "../../../../../lib/Map/PickedFeatures/PickedFeatures";
import addUserCatalogMember from "../../../../../lib/Models/Catalog/addUserCatalogMember";
import CogTimeSeriesCatalogItem from "../../../../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import GeoJsonCatalogItem from "../../../../../lib/Models/Catalog/CatalogItems/GeoJsonCatalogItem";
import WebMapServiceCatalogItem from "../../../../../lib/Models/Catalog/Ows/WebMapServiceCatalogItem";
import CommonStrata from "../../../../../lib/Models/Definition/CommonStrata";
import { BaseModel } from "../../../../../lib/Models/Definition/Model";
import TerriaFeature from "../../../../../lib/Models/Feature/Feature";
import {
  InitSourceData,
  StoryData
} from "../../../../../lib/Models/InitSource";
import Terria from "../../../../../lib/Models/Terria";
import { setViewerMode } from "../../../../../lib/Models/ViewerMode";
import ViewState from "../../../../../lib/ReactViewModels/ViewState";
import {
  buildShareLink,
  isShareable,
  SHARE_VERSION
} from "../../../../../lib/ReactViews/Map/Panels/SharePanel/BuildShareLink";

import bikeRacksGeoJson from "../../../../../wwwroot/test/GeoJSON/bike_racks.geojson" with { type: "json" };

let terria: Terria;
let viewState: ViewState;

beforeEach(function () {
  terria = new Terria({
    baseUrl: "./"
  });
  // terria.baseMap = {
  //   name: "Bing Maps Aerial"
  // };

  viewState = new ViewState({
    terria: terria
  });
});

const decodeAndParseStartHash = (url: string) => {
  const parsed = URI.parse(url);
  if (parsed.fragment) {
    return JSON.parse(queryToObject(parsed.fragment)["start"]);
  }
};

const flattenInitSources = (initSources: InitSourceData[]): InitSourceData =>
  initSources.reduce(
    (acc: InitSourceData, initSource: InitSourceData) =>
      Object.assign(acc, initSource),
    {}
  );

describe("BuildShareLink", function () {
  it("should generate a url with default catalog related flags missing/undefined", function () {
    const shareLink = buildShareLink(terria, viewState);
    const params = decodeAndParseStartHash(shareLink);
    const initSources = flattenInitSources(params.initSources);

    expect(params.version).toBe(SHARE_VERSION);
    expect(initSources.previewedItemId).toBeUndefined();
  });

  it("strips the CKAN proxy token from private catalog items", function () {
    const privateId = "__ckan_private_catalog__/nonce/resource/r1/view/0";
    const publicId = "public-wms";
    for (const id of [privateId, publicId]) {
      const model = new WebMapServiceCatalogItem(id, terria);
      model.setTrait(
        CommonStrata.definition,
        "url",
        "/api/terria/resource/r1/content/a.tif?token=123.abc&keep=1"
      );
      terria.addModel(model);
    }
    // This verifies serialization of already loaded layers. Fetching an
    // unstubbed WMS here fails to add it and never exercises token removal.
    runInAction(() => {
      terria.workbench.items = [privateId, publicId].map(
        (id) => terria.getModelById(BaseModel, id)!
      );
    });

    const params = decodeAndParseStartHash(buildShareLink(terria, viewState));
    const models = flattenInitSources(params.initSources).models as any;

    expect(models[privateId].url).toBe(
      "/api/terria/resource/r1/content/a.tif?keep=1"
    );
    expect(models[publicId].url).toContain("token=123.abc");
  });

  describe("user added model containing local data", function () {
    it("should not be serialized", async function () {
      const modelId = "Test";
      const model = new GeoJsonCatalogItem(modelId, terria);

      const blob = new Blob([JSON.stringify(bikeRacksGeoJson)], {
        type: "application/json"
      });

      model.setFileInput(blob as File);
      terria.addModel(model);

      expect(terria.getModelById(BaseModel, modelId)).toBe(model);
      expect(isShareable(terria)(modelId)).toBe(false);
      await addUserCatalogMember(terria, model);

      const shareLink = buildShareLink(terria, viewState);
      const params = decodeAndParseStartHash(shareLink);
      const initSources = flattenInitSources(params.initSources);

      expect(
        initSources.models?.[USER_ADDED_CATEGORY_ID].members
      ).not.toContain(model.uniqueId);
    });

    it("should not be added to workbench in generated url", async function () {
      const modelId = "Test";
      const model = new GeoJsonCatalogItem(modelId, terria);

      const blob = new Blob([JSON.stringify(bikeRacksGeoJson)], {
        type: "application/json"
      });

      model.setFileInput(blob as File);
      terria.addModel(model);
      await addUserCatalogMember(terria, model);

      await terria.workbench.add(model);

      const shareLink = buildShareLink(terria, viewState);
      const params = decodeAndParseStartHash(shareLink);
      const initSources = flattenInitSources(params.initSources);

      expect(initSources.workbench).not.toContain(model.uniqueId);
    });
  });

  describe("user added model containing no local data", function () {
    let model: BaseModel;

    beforeEach(function () {
      model = new WebMapServiceCatalogItem("Test", terria);
      runInAction(() => {
        model.setTrait(
          CommonStrata.definition,
          "url",
          "test/WMS/single_metadata_url.xml"
        );
      });
      terria.addModel(model);
    });

    it("should be serialized", async function () {
      await addUserCatalogMember(terria, model);
      const shareLink = buildShareLink(terria, viewState);
      const params = decodeAndParseStartHash(shareLink);
      const initSources = flattenInitSources(params.initSources);

      expect(model.uniqueId).toBeDefined();
      expect(isShareable(terria)(model.uniqueId ?? "")).toBe(true);
      expect(initSources.models?.[USER_ADDED_CATEGORY_ID].members).toContain(
        model.uniqueId
      );
    });

    it("should be added to workbench in generated url", async function () {
      await addUserCatalogMember(terria, model);

      await terria.workbench.add(model);

      const shareLink = buildShareLink(terria, viewState);
      const params = decodeAndParseStartHash(shareLink);
      const initSources = flattenInitSources(params.initSources);

      expect(initSources.workbench).toContain(model.uniqueId);
    });
  });

  describe("should generate a url that opens to the catalog", function () {
    beforeEach(function () {
      terria.catalog.userAddedDataGroup.addMembersFromJson(CommonStrata.user, [
        {
          id: "ABC",
          name: "abc",
          type: "wms",
          url: "test/WMS/single_metadata_url.xml"
        }
      ]);
    });

    // sharing active tab category not implemented in mobx yet
    // it("when the explorer window is open without a previewed catalog item", function() {
    //   viewState.openAddData();
    //   const shareLink = buildShareLink(terria, viewState);
    //   const params = decodeAndParseStartHash(shareLink);
    //   const initSources = flattenInitSources(params.initSources);

    //   expect(initSources.previewedItemId).toBe(undefined);
    //   // expect(initSources.sharedFromExplorerPanel).toBe(true);
    //   // expect(viewState.activeTabCategory).toBe(DATA_CATALOG_NAME);
    // });

    describe("opening to the user added tab", function () {
      // below case is impossible with the UI at the moment, but we might want to
      // share the 'empty-user-catalog-as-drag-and-drop' state in the future
      // it("without a previewed item", function() {
      //   viewState.openUserData();
      //   const shareLink = buildShareLink(terria, viewState);
      //   const params = decodeAndParseStartHash(shareLink);
      //   const initSources = flattenInitSources(params.initSources);

      //   expect(initSources.previewedItemId).toBe(undefined);
      //   // expect(initSources.sharedFromExplorerPanel).toBe(true);
      //   // expect(viewState.activeTabCategory).toBe(USER_DATA_NAME);
      // });

      it("viewing a previewed item", async function () {
        const model = terria.catalog.userAddedDataGroup.memberModels[0];

        // preview the user added item & the share link should reflect that
        await viewState.viewCatalogMember(model);
        const shareLink = buildShareLink(terria, viewState);
        let params = decodeAndParseStartHash(shareLink);
        let initSources = flattenInitSources(params.initSources);
        expect(initSources.previewedItemId).toBe(model.uniqueId);

        // close the catalog & the share link should reflect that
        viewState.closeCatalog();
        params = decodeAndParseStartHash(buildShareLink(terria, viewState));
        initSources = flattenInitSources(params.initSources);
        expect(initSources.previewedItemId).toBeUndefined();
      });
    });
  });

  describe("sharing picked features", function () {
    it(
      "captures the picked position",
      action(function () {
        terria.pickedFeatures = new PickedFeatures();
        terria.pickedFeatures.pickPosition = new Cartesian3(
          17832.12,
          83234.52,
          952313.73
        );
        terria.pickedFeatures.features.push(new TerriaFeature({}));
        const shareLink = buildShareLink(terria, viewState);
        const params = decodeAndParseStartHash(shareLink);
        const initSources = flattenInitSources(params.initSources);
        const pickCoords = initSources.pickedFeatures?.pickCoords;
        expect(pickCoords?.lat.toFixed(2)).toEqual("84.93");
        expect(pickCoords?.lng.toFixed(2)).toEqual("77.91");
        expect(pickCoords?.height.toFixed(2)).toEqual("-5400810.41");
      })
    );

    it(
      "captures the tile coordinates of the picked imagery providers",
      action(function () {
        terria.pickedFeatures = new PickedFeatures();
        terria.pickedFeatures.pickPosition = new Cartesian3(
          17832.12,
          83234.52,
          952313.73
        );
        terria.pickedFeatures.providerCoords = {
          "https://foo": { x: 123, y: 456, level: 7 },
          "https://bar": { x: 42, y: 42, level: 4 }
        };
        terria.pickedFeatures.features.push(new TerriaFeature({}));
        const shareLink = buildShareLink(terria, viewState);
        const params = decodeAndParseStartHash(shareLink);
        const initSources = flattenInitSources(params.initSources);
        const providerCoords = initSources.pickedFeatures?.providerCoords;
        expect(providerCoords).toEqual({
          "https://foo": { x: 123, y: 456, level: 7 },
          "https://bar": { x: 42, y: 42, level: 4 }
        });
      })
    );

    it(
      "captures the selected feature",
      action(function () {
        terria.pickedFeatures = new PickedFeatures();
        terria.pickedFeatures.pickPosition = new Cartesian3(
          17832.12,
          83234.52,
          952313.73
        );
        const feature = new Entity({ name: "testFeature" }) as TerriaFeature;
        terria.pickedFeatures.features.push(feature);
        terria.selectedFeature = feature;
        const shareLink = buildShareLink(terria, viewState);
        const params = decodeAndParseStartHash(shareLink);
        const initSources = flattenInitSources(params.initSources);
        const current = initSources.pickedFeatures?.current;
        expect(current?.name).toEqual("testFeature");
        expect(current?.hash).toBeDefined();
      })
    );

    it(
      "captures all picked vector features",
      action(function () {
        terria.pickedFeatures = new PickedFeatures();
        terria.pickedFeatures.pickPosition = new Cartesian3(
          17832.12,
          83234.52,
          952313.73
        );
        terria.pickedFeatures.features.push(
          new TerriaFeature({ name: "testFeature1" })
        );
        terria.pickedFeatures.features.push(
          new TerriaFeature({ name: "testFeature2" })
        );
        const shareLink = buildShareLink(terria, viewState);
        const params = decodeAndParseStartHash(shareLink);
        const initSources = flattenInitSources(params.initSources);
        const entities = initSources.pickedFeatures?.entities;
        expect(entities?.[0].name).toEqual("testFeature1");
        expect(entities?.[0].hash).toBeDefined();
        expect(entities?.[1].name).toEqual("testFeature2");
        expect(entities?.[1].hash).toBeDefined();
      })
    );

    it(
      "captures the feature info panel geometry",
      action(function () {
        terria.pickedFeatures = new PickedFeatures();
        terria.pickedFeatures.pickPosition = new Cartesian3(
          17832.12,
          83234.52,
          952313.73
        );
        terria.pickedFeatures.features.push(new TerriaFeature({}));
        terria.featureInfoPanelState = {
          position: { x: 24, y: 36, xRatio: 0.25, yRatio: 0.5 },
          dimensions: { width: 360, height: 280 }
        };

        const shareLink = buildShareLink(terria, viewState);
        const params = decodeAndParseStartHash(shareLink);
        const initSources = flattenInitSources(params.initSources);

        expect(initSources.featureInfoPanel).toEqual({
          position: { x: 24, y: 36, xRatio: 0.25, yRatio: 0.5 },
          dimensions: { width: 360, height: 280 }
        });
      })
    );

    it("does not capture feature info panel geometry without picked features", function () {
      terria.featureInfoPanelState = {
        position: { x: 12, y: 18, xRatio: 0.1, yRatio: 0.2 },
        dimensions: { width: 300, height: 220 }
      };

      const shareLink = buildShareLink(terria, viewState);
      const params = decodeAndParseStartHash(shareLink);
      const initSources = flattenInitSources(params.initSources);

      expect(initSources.featureInfoPanel).toBeUndefined();
    });
  });

  describe("sharing accumulated point series", function () {
    [false, true].forEach((emptyPick) => {
      it(`preserves series with ${
        emptyPick ? "an empty" : "no"
      } feature selection`, async function () {
        const item = new CogTimeSeriesCatalogItem("chl-dnipro", terria);
        item.setTrait(CommonStrata.definition, "unit", "mg m-3");
        terria.addModel(item);
        await terria.workbench.add(item);
        for (const [index, lat] of [48.63, 48.57].entries()) {
          item.addAccumulatedSeries({
            key: `point-${index}`,
            name: `P${index + 1}`,
            color: "#0072B2",
            units: "mg m-3",
            points: [{ x: 1717200000000, y: 40 + index }],
            meta: { kind: "point", lat, lon: 34.42 }
          });
        }
        runInAction(() => {
          terria.pickedFeatures = emptyPick ? new PickedFeatures() : undefined;
        });

        const params = decodeAndParseStartHash(
          buildShareLink(terria, viewState)
        );
        const initSource = flattenInitSources(params.initSources);
        expect(initSource.pickedFeatures).toBeUndefined();
        expect(initSource.accumulatedChartSeries?.[item.uniqueId!]).toEqual(
          item.accumulatedChartSeries
        );

        const restored = new Terria({ baseUrl: "./" });
        await restored.applyInitData({ initData: initSource });
        const restoredItem = restored.getModelById(
          CogTimeSeriesCatalogItem,
          item.uniqueId!
        );
        expect(restoredItem?.accumulatedChartSeries).toEqual(
          item.accumulatedChartSeries
        );
      });
    });
  });

  describe("sharing a story", function () {
    const story: StoryData = {
      id: "story-1",
      title: "Test story",
      text: "Some text",
      shareData: { version: SHARE_VERSION, initSources: [] }
    };

    const shareInitSources = (options?: { includeStories: boolean }) =>
      flattenInitSources(
        decodeAndParseStartHash(buildShareLink(terria, viewState, options))
          .initSources
      );

    it("includes the current camera when the story does not start by itself", function () {
      runInAction(() => {
        terria.stories = [story];
      });

      const initSources = shareInitSources();

      expect(initSources.initialCamera).toBeDefined();
      expect(initSources.settings?.storyAutoStart).toBe(false);
    });

    it("omits the current camera when the story starts by itself", function () {
      runInAction(() => {
        terria.stories = [story];
        terria.updateParameters({ storyAutoStart: true });
      });

      const initSources = shareInitSources();

      expect(initSources.initialCamera).toBeUndefined();
      // the home camera is not the current view, so it is still shared
      expect(initSources.homeCamera).toBeDefined();
      expect(initSources.stories?.length).toBe(1);
      expect(initSources.settings?.storyAutoStart).toBe(true);
    });

    it("includes the current camera when there is no story to start", function () {
      runInAction(() => {
        terria.updateParameters({ storyAutoStart: true });
      });

      const initSources = shareInitSources();

      expect(initSources.initialCamera).toBeDefined();
      expect(initSources.settings?.storyAutoStart).toBeUndefined();
    });

    it("includes the current camera when the story is excluded from the share", function () {
      runInAction(() => {
        terria.stories = [story];
        terria.updateParameters({ storyAutoStart: true });
      });

      const initSources = shareInitSources({ includeStories: false });

      expect(initSources.initialCamera).toBeDefined();
      expect(initSources.stories).toBeUndefined();
      expect(initSources.settings?.storyAutoStart).toBeUndefined();
    });

    it("records the `playStory` hash parameter over the config parameter", function () {
      runInAction(() => {
        terria.stories = [story];
        terria.userProperties.set("playStory", "1");
      });

      const initSources = shareInitSources();

      expect(initSources.initialCamera).toBeUndefined();
      expect(initSources.settings?.storyAutoStart).toBe(true);
    });
  });

  describe("hash parameters of the current url", function () {
    const setDocumentUrl = (url: string) =>
      Object.defineProperty(document, "URL", {
        value: url,
        configurable: true
      });

    const shareLinkHashParams = () =>
      queryToObject(
        URI.parse(buildShareLink(terria, viewState)).fragment ?? ""
      );

    afterEach(function () {
      // remove the shadowing own property, exposing `Document.prototype.URL` again
      delete (document as any).URL;
    });

    it("are carried over as key and value pairs", function () {
      setDocumentUrl("http://example.com/#playStory=1&hideExplorerPanel=1");

      const params = shareLinkHashParams();

      expect(params["playStory"]).toBe("1");
      expect(params["hideExplorerPanel"]).toBe("1");
      // an encoded `=` would be read back as the name of an init file to load
      expect(Object.keys(params)).not.toContain("playStory=1");
    });

    it("drop the state the new link replaces", function () {
      setDocumentUrl("http://example.com/#share=some-token&playStory=1");

      const params = shareLinkHashParams();

      expect(params["share"]).toBeUndefined();
      expect(params["start"]).toBeDefined();
      expect(params["playStory"]).toBe("1");
    });

    it("do not lose their value to an unset user property", function () {
      setDocumentUrl("http://example.com/#activeTabId=my-tab");

      expect(shareLinkHashParams()["activeTabId"]).toBe("my-tab");
    });
  });

  describe("map settings", function () {
    it("serialises correctly", async function () {
      const testBaseMap = new GeoJsonCatalogItem(
        "test-basemap",
        terria,
        undefined
      );
      testBaseMap.setTrait(
        CommonStrata.definition,
        "geoJsonString",
        `{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[145.5908203125,-40.17887331434695],[143.349609375,-42.08191667830631],[146.35986328124997,-44.040218713142124],[149.08447265625,-42.859859815062784],[148.55712890625,-41.36031866306708],[145.5908203125,-40.17887331434695]]]}},{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[75.9375,51.069016659603896],[59.94140624999999,39.095962936305476],[79.453125,42.032974332441405],[80.15625,46.800059446787316],[75.673828125,51.45400691005982],[75.9375,51.069016659603896]]]}}]}`
      );

      terria.setBaseMaximumScreenSpaceError(1);
      terria.setUseNativeResolution(true);
      setViewerMode("2d", terria.mainViewer);
      terria.timelineStack.setAlwaysShowTimeline(true);
      await terria.mainViewer.setBaseMap(testBaseMap);
      terria.terrainSplitDirection = SplitDirection.LEFT;
      terria.depthTestAgainstTerrainEnabled = true;

      const shareLink = buildShareLink(terria, viewState);
      const params = decodeAndParseStartHash(shareLink);
      const initSources = flattenInitSources(params.initSources);

      expect(initSources.viewerMode).toBe("2d");

      expect(initSources.settings).toEqual({
        baseMaximumScreenSpaceError: 1,
        useNativeResolution: true,
        alwaysShowTimeline: true,
        baseMapId: "test-basemap",
        terrainSplitDirection: -1,
        depthTestAgainstTerrainEnabled: true
      });
    });
  });
});
