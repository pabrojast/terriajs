import { runInAction } from "mobx";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PickedFeatures from "../../lib/Map/PickedFeatures/PickedFeatures";
import CompositeCatalogItem from "../../lib/Models/Catalog/CatalogItems/CompositeCatalogItem";
import CommonStrata from "../../lib/Models/Definition/CommonStrata";
import TerriaFeature from "../../lib/Models/Feature/Feature";
import Terria from "../../lib/Models/Terria";
import ViewState from "../../lib/ReactViewModels/ViewState";
import {
  FeatureInfoPanel,
  determineCatalogItem
} from "../../lib/ReactViews/FeatureInfo/FeatureInfoPanel";
import SimpleCatalogItem from "../Helpers/SimpleCatalogItem";
import { renderWithContexts } from "./withContext";

describe("FeatureInfoPanel", function () {
  let terria: Terria;
  let viewState: ViewState;
  let originalInnerWidth: number;
  let originalInnerHeight: number;

  beforeEach(function () {
    terria = new Terria({
      baseUrl: "./"
    });
    viewState = new ViewState({
      terria: terria
    });

    originalInnerWidth = window.innerWidth;
    originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 900
    });
  });

  afterEach(function () {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight
    });
  });

  it("has isVisible class when viewState.featureInfoPanelIsVisible is true", function () {
    runInAction(() => {
      viewState.featureInfoPanelIsVisible = true;
    });
    const { container } = renderWithContexts(
      <FeatureInfoPanel viewState={viewState} t={(key) => key} />,
      viewState
    );
    expect(container.querySelector('[class*="is-visible"]')).toBeTruthy();
  });

  it("displays loader while asychronously loading feature information", function () {
    const pickedFeatures = new PickedFeatures();
    pickedFeatures.allFeaturesAvailablePromise = Promise.resolve();
    runInAction(() => {
      terria.pickedFeatures = pickedFeatures;
    });
    renderWithContexts(
      <FeatureInfoPanel viewState={viewState} t={(key) => key} />,
      viewState
    );
    // Loader renders a spinning icon (svg) and optional message text
    expect(screen.getByText("loader.loadingMessage")).toBeInTheDocument();
  });

  it("does not have isVisible class when viewState.featureInfoPanelIsVisible is false", function () {
    runInAction(() => {
      viewState.featureInfoPanelIsVisible = false;
    });
    const { container } = renderWithContexts(
      <FeatureInfoPanel viewState={viewState} t={(key) => key} />,
      viewState
    );
    expect(container.querySelector('[class*="is-visible"]')).toBeNull();
  });

  it("applies stored size and position to the draggable wrapper", async function () {
    spyOn(HTMLElement.prototype, "getBoundingClientRect").and.callFake(
      function (this: HTMLElement) {
        const width = parseFloat(this.style.width || "500");
        const height = parseFloat(this.style.height || "260");
        const transform = this.style.transform.match(
          /translate3d\(([^,]+)px,\s*([^,]+)px,\s*0(?:px)?\)/
        );
        const x = transform ? parseFloat(transform[1]) : 0;
        const y = transform ? parseFloat(transform[2]) : 0;

        return {
          x,
          y,
          left: x,
          top: y,
          right: x + width,
          bottom: y + height,
          width,
          height,
          toJSON() {
            return {};
          }
        } as DOMRect;
      }
    );

    terria.featureInfoPanelState = {
      position: { x: 20, y: 30 },
      dimensions: { width: 320, height: 240 }
    };
    viewState.featureInfoPanelIsVisible = true;

    const { container } = render(
      <FeatureInfoPanel
        viewState={viewState}
        t={((key: string) => key) as any}
      />
    );
    const wrapper = container.firstElementChild as HTMLElement;

    await waitFor(() => {
      if (wrapper.dataset.sizeMode !== "manual")
        throw new Error("Waiting for stored panel layout");
    });
    expect(wrapper.style.width).toBe("320px");
    expect(wrapper.style.height).toBe("240px");
    expect(wrapper.style.transform).toBe("translate3d(20px, 30px, 0px)");
  });

  it("does not freeze the loading panel dimensions in automatic mode", async function () {
    viewState.featureInfoPanelIsVisible = true;
    runInAction(() => {
      terria.featureInfoPanelState = { sizeMode: "auto" };
    });
    const { container } = render(
      <FeatureInfoPanel viewState={viewState} t={(key) => key} />
    );
    await waitFor(() => {
      const wrapper = container.querySelector<HTMLElement>(
        '[data-size-mode="auto"]'
      );
      if (!wrapper) throw new Error("Waiting for automatic panel layout");
      expect(wrapper!.style.height).toBe("");
      expect(terria.featureInfoPanelState?.dimensions).toBeUndefined();
    });
  });

  // This test won't work for two reasons:
  //   - the behaviour it tests occurs in ComponentDidMount
  //   - FeatureInfoPanel doesn't have FeatureInfoSections - there is a FeatureInfoCatalogItem layer in between.
  //
  // it('shows an open section even if none have any info', function() {
  //     const feature1 = new Entity({
  //         name: 'Foo'
  //     });
  //     const feature2 = new Entity({
  //         name: 'Bar'
  //     });
  //     var pickedFeatures = new PickedFeatures();
  //     pickedFeatures.allFeaturesAvailablePromise = runLater(function() {
  //         pickedFeatures.features = [feature1, feature2];
  //     });
  //     terria.pickedFeatures = pickedFeatures;
  //     const panel = <FeatureInfoPanel viewState={viewState}/>;
  //     const result = getShallowRenderedOutput(panel);
  //     const sections = findAllWithType(result, FeatureInfoSection);
  //     expect(sections.length).toEqual(2);
  //     expect(sections[0].props.isOpen).toBe(true);
  // });
  it("shows a feature info sections", async function () {
    const simple1 = new SimpleCatalogItem("simple1", terria);
    const feature1 = new TerriaFeature({
      name: "Foo"
    });
    feature1._catalogItem = simple1;

    const feature2 = new TerriaFeature({
      name: "Bar"
    });
    const simple2 = new SimpleCatalogItem("simple2", terria);
    feature2._catalogItem = simple2;

    const pickedFeatures = new PickedFeatures();
    pickedFeatures.allFeaturesAvailablePromise = Promise.resolve();
    runInAction(() => {
      pickedFeatures.features = [feature1, feature2];
      pickedFeatures.isLoading = false;
    });

    terria.pickedFeatures = pickedFeatures;
    terria.workbench.items = [simple1, simple2];
    renderWithContexts(
      <FeatureInfoPanel viewState={viewState} t={(key) => key} />,
      viewState
    );
    await waitFor(() =>
      expect(
        screen.queryByText("loader.loadingMessage")
      ).not.toBeInTheDocument()
    );

    expect(screen.queryByText("loader.loadingMessage")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "simple1 - Foo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "simple2 - Bar" })).toBeVisible();
  });

  it('opens a feature info section with "featureInfo.noInfoAvailable" message when the feature has no properties', async function () {
    const feature = new TerriaFeature({
      name: "Foo"
    });
    const simple = new SimpleCatalogItem("simple", terria);
    feature._catalogItem = simple;

    const pickedFeatures = new PickedFeatures();
    pickedFeatures.allFeaturesAvailablePromise = Promise.resolve();
    runInAction(() => {
      pickedFeatures.features = [feature];
      pickedFeatures.isLoading = false;
    });
    terria.pickedFeatures = pickedFeatures;
    terria.workbench.items = [simple];
    renderWithContexts(
      <FeatureInfoPanel viewState={viewState} t={() => {}} />,
      viewState
    );
    await waitFor(() =>
      expect(
        screen.queryByText("loader.loadingMessage")
      ).not.toBeInTheDocument()
    );
    const button = screen.getByRole("button", { name: "simple - Foo" });
    expect(button).toBeVisible();
    await userEvent.click(button);

    expect(screen.getByText("featureInfo.noInfoAvailable")).toBeInTheDocument();
  });

  it("opens a feature info section with feature properties", async function () {
    const feature = new TerriaFeature({
      name: "Foo",
      properties: {
        prop1: "Value 1",
        prop2: "Value 2"
      }
    });
    const simple = new SimpleCatalogItem("simple", terria);
    feature._catalogItem = simple;

    const pickedFeatures = new PickedFeatures();
    pickedFeatures.allFeaturesAvailablePromise = Promise.resolve();
    runInAction(() => {
      pickedFeatures.features = [feature];
      pickedFeatures.isLoading = false;
    });
    terria.pickedFeatures = pickedFeatures;
    terria.workbench.items = [simple];
    renderWithContexts(
      <FeatureInfoPanel viewState={viewState} t={() => {}} />,
      viewState
    );
    await waitFor(() =>
      expect(
        screen.queryByText("loader.loadingMessage")
      ).not.toBeInTheDocument()
    );
    const button = screen.getByRole("button", { name: "simple - Foo" });
    expect(button).toBeVisible();
    await userEvent.click(button);
    expect(screen.getByText("prop1")).toBeInTheDocument();
    expect(screen.getByText("Value 1")).toBeInTheDocument();
    expect(screen.getByText("prop2")).toBeInTheDocument();
    expect(screen.getByText("Value 2")).toBeInTheDocument();
  });

  describe("determineCatalogItem", function () {
    let simple1: SimpleCatalogItem,
      simple2: SimpleCatalogItem,
      composite: CompositeCatalogItem;
    let feature1: TerriaFeature, feature2: TerriaFeature;
    beforeEach(function () {
      feature1 = new TerriaFeature({});
      simple1 = new SimpleCatalogItem("simple1", terria);
      feature1._catalogItem = simple1;
      feature2 = new TerriaFeature({});
      simple2 = new SimpleCatalogItem("simple2", terria);
      feature2._catalogItem = simple2;
      composite = new CompositeCatalogItem("composite", terria);
      composite.add(CommonStrata.definition, simple1);
      composite.add(CommonStrata.definition, simple2);
    });
    it("determines which catalog item a feature belongs to", function () {
      terria.workbench.items = [simple1, simple2];
      expect(determineCatalogItem(terria.workbench, feature1)).toBe(simple1);
      expect(determineCatalogItem(terria.workbench, feature2)).toBe(simple2);
    });
    it("special cases features from composite models", function () {
      terria.workbench.items = [composite];
      expect(determineCatalogItem(terria.workbench, feature1)).toBe(simple1);
      expect(determineCatalogItem(terria.workbench, feature2)).toBe(simple2);
    });
  });
});
