import { cleanup, fireEvent } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
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
import SelectableDimensionSection from "../../../lib/ReactViews/Workbench/Controls/SelectableDimensionSection";
import CogCalculationSource from "../../../lib/ReactViews/Tools/CogCalculation/CogCalculationSource";
import CogCalculationResultsPanel from "../../../lib/ReactViews/Tools/CogCalculation/CogCalculationResultsPanel";
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
  it("keeps a restored raster choice behind closed advanced options without resetting it", async () => {
    const translations = i18next.createInstance();
    await translations.init({
      lng: "es",
      resources: { es: { translation: spanish } }
    });
    spyOn(i18next, "t").and.callFake(translations.t.bind(translations));
    item.setActiveBand(CommonStrata.user, "mean");
    const rendered = renderWithContexts(
      <I18nextProvider i18n={translations}>
        <SelectableDimensionSection item={item} placement="default" />
      </I18nextProvider>,
      viewState
    );
    const details = rendered.getByText("Opciones avanzadas del mapa")
      .parentElement as HTMLDetailsElement;
    const input = rendered.getByLabelText("Resumen de cada píxel:");
    expect(details.open).toBe(false);
    expect(input).not.toBeVisible();
    fireEvent.click(details.querySelector("summary")!);
    expect(input).toBeVisible();
    expect(item.activeBandId).toBe("mean");
    fireEvent.click(details.querySelector("summary")!);
    expect(input).not.toBeVisible();
    expect(item.activeBandId).toBe("mean");
    const vm = new CogCalculationViewModel(viewState, item.uniqueId);
    expect(vm.selectedBand).toBe(2);
    vm.dispose();
  });
  it("identifies a custom analysis band instead of claiming it matches the map", async () => {
    const translations = i18next.createInstance();
    await translations.init({
      lng: "es",
      resources: { es: { translation: spanish } }
    });
    const vm = new CogCalculationViewModel(viewState, item.uniqueId);
    const rendered = renderWithContexts(
      <I18nextProvider i18n={translations}>
        <CogCalculationSource vm={vm} />
      </I18nextProvider>,
      viewState
    );
    expect(
      rendered.getByText("Se utilizan los valores mostrados en el mapa.")
    ).toBeVisible();
    fireEvent.click(rendered.getByText("Ver datos utilizados"));
    expect(rendered.getByText(/banda 2/)).toBeVisible();
    vm.setBand(1);
    rendered.rerender(
      <I18nextProvider i18n={translations}>
        <CogCalculationSource vm={vm} />
      </I18nextProvider>
    );
    expect(
      rendered.queryByText("Se utilizan los valores mostrados en el mapa.")
    ).toBeNull();
    expect(rendered.getByText(/Se utiliza otra variante/)).toBeVisible();
    expect(item.activeBandId).toBe("mean");
    // Daily series may have a rendering band without named statistical bands.
    updateModelFromJson(item, CommonStrata.user, {
      resolutions: [{ id: "daily", renderOptions: { single: { band: 1 } } }]
    });
    item.setActiveResolution(CommonStrata.user, "daily");
    rendered.rerender(
      <I18nextProvider i18n={translations}>
        <CogCalculationSource vm={vm} />
      </I18nextProvider>
    );
    expect(
      rendered.getByText("Se utilizan los valores mostrados en el mapa.")
    ).toBeVisible();
    vm.dispose();
  });
  it("labels area results with their processed month in Spanish and English", async () => {
    const translations = i18next.createInstance();
    await translations.init({
      lng: "es",
      resources: { es: { translation: spanish }, en: { translation: english } }
    });
    const vm = new CogCalculationViewModel(viewState, item.uniqueId);
    runInAction(() => {
      vm.timeSeriesResults = [
        {
          time: "2026-09-01T00:00:00Z",
          statistics: {
            mean: 2,
            min: 1,
            max: 3,
            median: 2,
            sum: 6,
            count: 3,
            noDataCount: 0,
            stddev: 1
          }
        }
      ];
    });
    const rendered = renderWithContexts(
      <I18nextProvider i18n={translations}>
        <CogCalculationResultsPanel vm={vm} />
      </I18nextProvider>,
      viewState
    );
    expect(
      rendered.getByRole("heading", {
        name: "Promedio dentro del área dibujada"
      })
    ).toBeVisible();
    expect(
      rendered.getByRole("heading", { name: "septiembre de 2026" })
    ).toBeVisible();
    await translations.changeLanguage("en");
    rendered.rerender(
      <I18nextProvider i18n={translations}>
        <CogCalculationResultsPanel vm={vm} />
      </I18nextProvider>
    );
    expect(
      rendered.getByRole("heading", { name: "Mean within the drawn area" })
    ).toBeVisible();
    expect(
      rendered.getByRole("heading", { name: "September 2026" })
    ).toBeVisible();
    vm.dispose();
  });
});
