import { cleanup, fireEvent } from "@testing-library/react";
import i18next from "i18next";
import { runInAction } from "mobx";
import Terria from "../../../lib/Models/Terria";
import ViewState from "../../../lib/ReactViewModels/ViewState";
import CogCalculationViewModel from "../../../lib/ReactViewModels/CogCalculationViewModel";
import CogTimeSeriesCatalogItem from "../../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import CommonStrata from "../../../lib/Models/Definition/CommonStrata";
import { SelectableDimensionEnum } from "../../../lib/Models/SelectableDimensions/SelectableDimensions";
import updateModelFromJson from "../../../lib/Models/Definition/updateModelFromJson";
import SimpleDashboardButton from "../../../lib/ReactViews/Map/Panels/SimpleDashboardButton";
import { getShareData } from "../../../lib/ReactViews/Map/Panels/SharePanel/BuildShareLink";
import cogStatisticHelp from "../../../lib/ReactViews/Workbench/Controls/cogStatisticHelp";
import waterDashboardDraft from "../../../lib/ReactViews/WaterQuality/waterDashboardDraft";
import openCogCalculationTool from "../../../lib/ReactViews/Tools/CogCalculation/openCogCalculationTool";
import { renderWithContexts } from "../withContext";
import english from "../../../wwwroot/languages/en/translation.json";
import spanish from "../../../wwwroot/languages/es/translation.json";

describe("Water panel controls", () => {
  let terria: Terria;
  let viewState: ViewState;
  let item: CogTimeSeriesCatalogItem;
  beforeEach(() => {
    terria = new Terria({ baseUrl: "./" });
    viewState = new ViewState({ terria, catalogSearchProvider: undefined });
    item = new CogTimeSeriesCatalogItem("water", terria);
    updateModelFromJson(item, CommonStrata.definition, {
      name: "Madagascar CHL",
      unit: "mg/m³",
      waterQuality: {
        pilotId: "madagascar",
        product: "CHL",
        dataUrl: "https://example.org/analytics"
      },
      activeResolutionId: "monthly",
      activeBandId: "mean",
      resolutions: [
        {
          id: "monthly",
          bands: [
            { id: "median", name: "Median", band: 1 },
            { id: "mean", name: "Mean", band: 2 }
          ]
        }
      ]
    });
    runInAction(() => {
      terria.workbench.items = [item];
      terria.configParameters.simpleDashboards = { enabled: true };
    });
  });
  afterEach(() => {
    cleanup();
    item.dispose();
    viewState.dispose();
    terria.mainViewer.destroy();
  });
  it("toggles the dashboard from both desktop and mobile without dropping its reference", () => {
    const reference = {
      id: "12345678-1234-1234-1234-123456789012",
      revision: 2
    };
    runInAction(() => {
      terria.simpleDashboard = reference;
    });
    for (const smallScreen of [false, true]) {
      const rendered = renderWithContexts(
        <SimpleDashboardButton smallScreen={smallScreen} />,
        viewState
      );
      const button = rendered.getByRole("button");
      fireEvent.click(button);
      expect(terria.simpleDashboardOpen).toBe(true);
      fireEvent.click(button);
      expect(terria.simpleDashboardOpen).toBe(false);
      expect(terria.simpleDashboard).toEqual(reference);
      rendered.unmount();
    }
  });
  it("translates cached map choices and explains their separate water-body meaning", async () => {
    // Use real resources without depending on other suites' global i18n setup.
    const translations = i18next.createInstance();
    await translations.init({
      lng: "en",
      resources: {
        en: { translation: english },
        es: { translation: spanish }
      }
    });
    spyOn(i18next, "t").and.callFake(translations.t.bind(translations));
    const dimension = item.selectableDimensions.find(
      (dim) => dim.id === "cog-series-band"
    ) as SelectableDimensionEnum;
    await translations.changeLanguage("es");
    const es = cogStatisticHelp(dimension, item) as any;
    expect(es.options[1].name).toBe("Promedio (media)");
    expect(es.description).toContain("este selector no cambia ese resumen");
    await translations.changeLanguage("en");
    expect((cogStatisticHelp(dimension, item) as any).options[1].name).toBe(
      "Mean (average)"
    );
    const custom = {
      ...dimension,
      type: "select" as const,
      options: [{ id: "mean", name: "Custom calibrated result" }]
    };
    expect((cogStatisticHelp(custom, item) as any).options[0].name).toBe(
      "Custom calibrated result"
    );
  });
  it("shares closed state and validated water-panel position independently of the dashboard", async () => {
    runInAction(() => {
      terria.waterQualityPanelClosed = true;
      terria.waterQualityPanelPosition = { x: 0.3, y: 0.2 };
      terria.simpleDashboardPosition = { x: 0.7, y: 0.6 };
    });
    const share = getShareData(terria, viewState, { includeStories: false });
    const init = share.initSources[0] as any;
    expect(init.waterQualityPanel).toEqual({
      closed: true,
      position: { x: 0.3, y: 0.2 }
    });
    await terria.applyInitData({
      initData: { waterQualityPanel: init.waterQualityPanel }
    });
    expect(terria.waterQualityPanelClosed).toBe(true);
    expect(terria.simpleDashboardPosition).toEqual({ x: 0.7, y: 0.6 });
    await terria.applyInitData({
      initData: {
        waterQualityPanel: { closed: false, position: { x: -1, y: 0 } }
      }
    });
    expect(terria.waterQualityPanelClosed).toBe(false);
    expect(terria.waterQualityPanelPosition).toBeUndefined();
  });
  it("creates an unsaved body-specific draft with the selected resolution and inclusive month end", () => {
    const bodies = [1, 2, 3].map((id) => ({
      id,
      name: `Lake ${id}`,
      kind: "lake",
      area: 1,
      lat: 0,
      lon: 0,
      bbox: [0, 0, 1, 1]
    }));
    const draft = waterDashboardDraft(item, bodies, "2024-02", "en");
    expect(draft.sources[0].resolution).toBe("monthly");
    expect(draft.blocks.length).toBe(6);
    expect(draft.blocks.map((b) => b.body_id)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(draft.state).toEqual({ start: "2024-01-01", end: "2024-02-29" });
    expect(terria.simpleDashboard).toBeUndefined();
    expect(item.activeBandId).toBe("mean");
  });
  it("opens calculation for the clicked layer and initially reads the same band as the map", () => {
    runInAction(() => {
      terria.simpleDashboardOpen = true;
      viewState.useSmallScreenInterface = true;
      viewState.switchMobileView("nowViewing");
    });
    openCogCalculationTool(viewState, item.uniqueId);
    expect(viewState.currentTool?.params?.itemId).toBe(item.uniqueId);
    expect(viewState.mobileView).toBeNull();
    expect(terria.simpleDashboardOpen).toBe(false);
    const vm = new CogCalculationViewModel(viewState, item.uniqueId);
    expect(vm.selectedBand).toBe(2);
    vm.dispose();
  });
});
