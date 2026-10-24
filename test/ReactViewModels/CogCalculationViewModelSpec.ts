import { runInAction } from "mobx";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import PickedFeatures from "../../lib/Map/PickedFeatures/PickedFeatures";
import Terria from "../../lib/Models/Terria";
import UserDrawing from "../../lib/Models/UserDrawing";
import MapInteractionMode from "../../lib/Models/MapInteractionMode";
import ViewState from "../../lib/ReactViewModels/ViewState";
import CogCalculationViewModel from "../../lib/ReactViewModels/CogCalculationViewModel";
import TerriaFeature from "../../lib/Models/Feature/Feature";

describe("Area analysis workflow", () => {
  let terria: Terria;
  let viewState: ViewState;
  let vm: CogCalculationViewModel;
  const pick = (lon: number, lat: number, first = false) => {
    const features = new PickedFeatures();
    features.pickPosition = Cartesian3.fromDegrees(lon, lat);
    if (first) {
      const drawing = terria.overlays.items[0] as UserDrawing;
      features.features = [
        TerriaFeature.fromEntity(drawing.pointEntities.entities.values[0])
      ];
    }
    runInAction(() => {
      terria.mapInteractionModeStack[
        terria.mapInteractionModeStack.length - 1
      ].pickedFeatures = features;
    });
  };
  beforeEach(() => {
    terria = new Terria();
    viewState = new ViewState({ terria, catalogSearchProvider: undefined });
    vm = new CogCalculationViewModel(viewState, "chosen-layer");
    vm.startDrawing();
  });
  afterEach(() => {
    vm.dispose();
    viewState.dispose();
    terria.mainViewer.destroy();
  });
  it("retains a closed polygon after explicit finish, cancellation and repeated cleanup", () => {
    expect(vm.selectedItemId).toBe("chosen-layer");
    pick(34, 48);
    pick(35, 48);
    expect(vm.canFinishDrawing).toBe(false);
    pick(35, 49);
    expect(vm.canFinishDrawing).toBe(true);
    vm.finishDrawing();
    expect(vm.phase).toBe("configuring");
    expect(vm.polygon?.coordinates[0].length).toBe(4);
    expect(terria.overlays.items.length).toBe(1);
    expect(terria.mapInteractionModeStack.length).toBe(0);
    expect(terria.allowFeatureInfoRequests).toBe(true);
    vm.cancelCalculation();
    expect(terria.overlays.items.length).toBe(1);
    const unrelated = new MapInteractionMode({ message: "unrelated" });
    runInAction(() => terria.mapInteractionModeStack.push(unrelated));
    vm.dispose();
    vm.dispose();
    expect(terria.overlays.items.length).toBe(0);
    expect(terria.mapInteractionModeStack[0]).toBe(unrelated);
  });
  it("closes through the first vertex without requiring Done", () => {
    pick(34, 48);
    pick(35, 48);
    pick(35, 49);
    pick(34, 48, true);
    expect(vm.phase).toBe("configuring");
    expect(terria.overlays.items.length).toBe(1);
    expect(terria.mapInteractionModeStack.length).toBe(0);
  });
  it("undoes and restarts without retaining old overlays or accepting crossings", () => {
    pick(34, 48);
    pick(35, 49);
    pick(34, 49);
    pick(35, 48);
    expect(vm.canFinishDrawing).toBe(false);
    vm.finishDrawing();
    expect(vm.phase).toBe("drawing");
    vm.undoDrawing();
    expect(vm.drawnPoints.length).toBe(3);
    expect(vm.canFinishDrawing).toBe(true);
    vm.startDrawing();
    expect(vm.drawnPoints.length).toBe(0);
    expect(terria.overlays.items.length).toBe(1);
    expect(terria.mapInteractionModeStack.length).toBe(1);
  });
});
