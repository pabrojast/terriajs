import QueryRunner from "../../../lib/Models/SimpleDashboard/QueryRunner";
import {
  boundsPolygons,
  validBounds,
  validDashboardState
} from "../../../lib/Models/SimpleDashboard/Spatial";
import Terria from "../../../lib/Models/Terria";
import { getShareData } from "../../../lib/ReactViews/Map/Panels/SharePanel/BuildShareLink";
import type { DashboardResult } from "../../../lib/Models/SimpleDashboard/Types";

describe("Dashboard viewport", () => {
  it("splits an antimeridian extent and rejects invalid coordinates", () => {
    const bounds = { west: 170, east: -170, south: -10, north: 10 };
    expect(validBounds(bounds)).toBeTrue();
    expect(boundsPolygons(bounds).map((p) => p.coordinates[0][1][0])).toEqual([
      180, -170
    ]);
    expect(validBounds({ ...bounds, north: NaN })).toBeFalse();
    expect(
      validDashboardState({
        spatial: { mode: "viewport", bounds, quality: "native" }
      })
    ).toBeFalse();
  });
  it("shares fixed extents and dates independently of stories", async () => {
    const terria = new Terria({ baseUrl: "./" });
    const state = {
      start: "2024-01-01",
      end: "2024-12-31",
      spatial: {
        mode: "fixed" as const,
        quality: "native" as const,
        bounds: { west: -5, east: 5, south: -5, north: 5 }
      }
    };
    await terria.applyInitData({
      initData: {
        simpleDashboard: {
          id: "12345678-1234-1234-1234-123456789012",
          revision: 1,
          state
        }
      }
    });
    const init = getShareData(terria, undefined, {
      includeStories: false
    }).initSources.find(
      (s) => typeof s === "object" && "simpleDashboard" in s
    ) as any;
    const other = new Terria({ baseUrl: "./" });
    await other.applyInitData({ initData: init });
    expect(other.simpleDashboard?.state).toEqual(state);
  });
  describe("request scheduling", () => {
    let runner: QueryRunner;
    beforeEach(() => jasmine.clock().install());
    afterEach(() => {
      runner?.dispose();
      jasmine.clock().uninstall();
    });
    it("coalesces movement and waits for an existing server job before submitting the latest extent", async () => {
      const requests: string[] = [],
        displayed: string[] = [];
      let count = 0;
      runner = new QueryRunner(
        async (key) => {
          requests.push(key);
          return {
            status: ++count === 1 ? "pending" : "ready"
          } as DashboardResult;
        },
        (key) => displayed.push(key),
        fail
      );
      runner.update("A");
      jasmine.clock().tick(750);
      await Promise.resolve();
      runner.update("B");
      runner.update("C");
      jasmine.clock().tick(2000);
      await Promise.resolve();
      expect(requests).toEqual(["A", "A"]);
      expect(displayed).toEqual(["A"]);
      jasmine.clock().tick(750);
      await Promise.resolve();
      expect(requests).toEqual(["A", "A", "C"]);
      expect(displayed).toEqual(["A", "C"]);
    });
    it("does not submit work while disabled and releases timers on disposal", async () => {
      const request = jasmine.createSpy().and.resolveTo({ status: "ready" });
      runner = new QueryRunner(request, () => {}, fail);
      runner.update("A");
      runner.update(undefined);
      jasmine.clock().tick(1000);
      await Promise.resolve();
      expect(request).not.toHaveBeenCalled();
      runner.update("B");
      runner.dispose();
      jasmine.clock().tick(1000);
      expect(request).not.toHaveBeenCalled();
    });
  });
});
