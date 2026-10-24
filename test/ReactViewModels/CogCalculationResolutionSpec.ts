import { runInAction } from "mobx";
import Terria from "../../lib/Models/Terria";
import ViewState from "../../lib/ReactViewModels/ViewState";
import CogCalculationViewModel from "../../lib/ReactViewModels/CogCalculationViewModel";
import CogTimeSeriesCatalogItem from "../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import CommonStrata from "../../lib/Models/Definition/CommonStrata";
import updateModelFromJson from "../../lib/Models/Definition/updateModelFromJson";
import Result from "../../lib/Core/Result";
import CogCalculationToolController from "../../lib/ReactViews/Tools/CogCalculation/CogCalculationToolController";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("Area analysis resolution lifecycle", () => {
  let terria: Terria;
  let viewState: ViewState;
  let item: CogTimeSeriesCatalogItem;
  let vm: CogCalculationViewModel;
  beforeEach(async () => {
    terria = new Terria();
    viewState = new ViewState({ terria, catalogSearchProvider: undefined });
    item = new CogTimeSeriesCatalogItem("series", terria);
    updateModelFromJson(item, CommonStrata.definition, {
      activeResolutionId: "monthly",
      unit: "mg m-3",
      resolutions: [
        {
          id: "monthly",
          name: "Monthly",
          timeEntries: [
            { time: "2024-06-01T12:00:00Z", cogs: ["monthly.tif"] },
            { time: "2024-08-31T12:00:00Z", cogs: ["monthly-end.tif"] }
          ]
        },
        {
          id: "annual",
          name: "Annual",
          timeEntries: [{ time: "2024-01-01T00:00:00Z", cogs: ["annual.tif"] }]
        },
        {
          id: "daily",
          name: "Daily",
          valueScale: 0.1,
          timeEntries: [{ time: "2024-06-03T12:00:00Z", cogs: ["daily.tif"] }]
        }
      ]
    });
    spyOn(item, "loadMapItems").and.returnValue(Promise.resolve(Result.none()));
    await terria.workbench.add(item);
    vm = new CogCalculationViewModel(viewState, item.uniqueId);
    await vm.loadResolution();
    runInAction(() => {
      vm.polygon = {
        type: "Polygon",
        coordinates: [
          [
            [34, 48],
            [35, 48],
            [35, 49],
            [34, 48]
          ]
        ]
      };
      vm.phase = "configuring";
    });
  });
  afterEach(() => {
    vm.dispose();
    viewState.dispose();
    terria.mainViewer.destroy();
  });

  it("deduplicates metadata requests, caches each source and retries a failed request", async () => {
    jasmine.Ajax.install();
    const remote = new CogTimeSeriesCatalogItem("remote", terria);
    try {
      updateModelFromJson(remote, CommonStrata.definition, {
        resolutions: [
          { id: "monthly", url: "https://example.com/months.json" },
          { id: "daily", url: "https://example.com/days.json" }
        ]
      });
      jasmine.Ajax.stubRequest("https://example.com/months.json").andReturn({
        responseJSON: { times: [{ time: "2024-06-01", cogs: ["monthly.tif"] }] }
      });
      await Promise.all([
        remote.loadTimeSeriesMetadata(),
        remote.loadTimeSeriesMetadata()
      ]);
      expect(jasmine.Ajax.requests.count()).toBe(1);
      remote.setActiveResolution(CommonStrata.user, "daily");
      jasmine.Ajax.stubRequest("https://example.com/days.json").andReturn({
        status: 503
      });
      let failed = false;
      try {
        await remote.loadTimeSeriesMetadata();
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
      jasmine.Ajax.stubRequest("https://example.com/days.json").andReturn({
        responseJSON: { times: [{ time: "2024-06-03", cogs: ["daily.tif"] }] }
      });
      await remote.loadTimeSeriesMetadata();
      expect(remote.timeEntries?.[0].cogs[0]).toBe("daily.tif");
      remote.setActiveResolution(CommonStrata.user, "monthly");
      await remote.loadTimeSeriesMetadata();
      expect(remote.timeEntries?.[0].cogs[0]).toBe("monthly.tif");
      expect(jasmine.Ajax.requests.count()).toBe(3);
    } finally {
      jasmine.Ajax.uninstall();
    }
  });

  it("disables calculation when the selected period has no source dates", async () => {
    vm.setDateRange("2030-01", "2030-12");
    const calculate = spyOn<any>(vm, "_calculateTimeSeries");
    await vm.startCalculation();
    expect(vm.estimatedWork.timeSteps).toBe(0);
    expect(calculate).not.toHaveBeenCalled();
  });

  it("synchronizes both directions and includes the last day of each period", async () => {
    vm.setDateRange("2024-06", "2024-08");
    expect(vm.estimatedWork.timeSteps).toBe(2);
    vm.setResolution("annual");
    await vm.loadResolution();
    expect(item.activeResolutionId).toBe("annual");
    expect(vm.startDate).toBe("2024-01-01");
    expect(vm.endDate).toBe("2024-12-31");
    expect(vm.estimatedWork.timeSteps).toBe(1);
    item.setActiveResolution(CommonStrata.user, "monthly");
    expect(vm.startDate).toBe("2024-01-01");
    expect(vm.endDate).toBe("2024-12-31");
    vm.setDateRange(undefined, undefined);
    vm.setResolution("daily");
    expect(vm.startDate).toBeUndefined();
    expect(vm.endDate).toBeUndefined();
    expect(vm.timeEntries[0].cogs[0]).toBe("daily.tif");
    expect(item.valueScale).toBe(0.1);
  });

  it("aborts an old calculation and ignores its late success after switching resolution", async () => {
    const old = deferred<any[]>();
    let signal!: AbortSignal;
    spyOn<any>(vm, "_calculateTimeSeries").and.callFake(
      (controller: AbortController) => {
        signal = controller.signal;
        return old.promise;
      }
    );
    const calculation = vm.startCalculation();
    expect(vm.isCalculating).toBe(true);
    vm.setResolution("annual");
    expect(signal.aborted).toBe(true);
    old.resolve([{ time: "2024-06-01", statistics: { mean: 999 } }]);
    await calculation;
    expect(vm.timeSeriesResults).toBeUndefined();
    expect(vm.phase).toBe("configuring");
    expect(vm.isCalculating).toBe(false);
  });

  it("ignores obsolete metadata errors and allows retry of the current resolution", async () => {
    const old = deferred<void>();
    const latest = deferred<void>();
    spyOn(item, "loadTimeSeriesMetadata").and.returnValues(
      old.promise,
      latest.promise,
      Promise.resolve()
    );
    const first = vm.loadResolution();
    const second = vm.loadResolution();
    old.reject(new Error("obsolete"));
    await first;
    expect(vm.resolutionError).toBeUndefined();
    expect(vm.isLoadingResolution).toBe(true);
    latest.reject(new Error("offline"));
    await second;
    expect(vm.resolutionError).toBeDefined();
    await vm.loadResolution();
    expect(vm.resolutionError).toBeUndefined();
    expect(vm.isLoadingResolution).toBe(false);
  });

  it("keeps cancelled and disposed calculations from publishing late errors", async () => {
    const pending = deferred<any[]>();
    spyOn<any>(vm, "_calculateTimeSeries").and.returnValue(pending.promise);
    const calculation = vm.startCalculation();
    vm.cancelCalculation();
    vm.dispose();
    pending.reject(new Error("late failure"));
    await calculation;
    expect(vm.error).toBeUndefined();
    expect(vm.timeSeriesResults).toBeUndefined();
    expect(vm.phase).toBe("idle");
  });

  it("uses the current tool as the shortcut state and disposes drawing on close", () => {
    const controller = new CogCalculationToolController(viewState);
    controller.activate();
    expect(controller.active).toBe(true);
    vm.startDrawing();
    expect(terria.mapInteractionModeStack.length).toBe(1);
    viewState.closeTool();
    expect(controller.active).toBe(false);
    expect(terria.overlays.items.length).toBe(0);
    expect(terria.mapInteractionModeStack.length).toBe(0);
  });
});
