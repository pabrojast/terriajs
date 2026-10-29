import { runInAction } from "mobx";
import Terria from "../../../lib/Models/Terria";
import { validDashboardRef } from "../../../lib/Models/SimpleDashboard/Types";
import {
  storyComposition,
  emptyDashboardState
} from "../../../lib/Models/StoryComposition";
import { getShareData } from "../../../lib/ReactViews/Map/Panels/SharePanel/BuildShareLink";
const id = "12345678-1234-1234-1234-123456789012";
describe("Simple dashboards", () => {
  it("accepts immutable references and rejects URLs, fractional revisions and missing revisions", () => {
    expect(validDashboardRef({ id, revision: 1 })).toBe(true);
    for (const value of [
      { id },
      { id, revision: 0 },
      { id, revision: 1.5 },
      { id: "https://example.org", revision: 1 }
    ])
      expect(validDashboardRef(value)).toBe(false);
  });
  it("restores a shared revision without requiring embedded data or credentials", async () => {
    const terria = new Terria({ baseUrl: "./" });
    await terria.applyInitData({
      initData: { simpleDashboard: { id, revision: 3 } }
    });
    expect(terria.simpleDashboard).toEqual({ id, revision: 3 });
    expect(terria.simpleDashboardOpen).toBe(true);
    const share = getShareData(terria);
    const init = share.initSources.find(
      (s) => typeof s === "object" && "simpleDashboard" in s
    ) as any;
    expect(init.simpleDashboard).toEqual({ id, revision: 3 });
    expect(Object.keys(init.simpleDashboard)).toEqual(["id", "revision"]);
    runInAction(() => {
      terria.simpleDashboardOpen = false;
    });
    expect(JSON.stringify(getShareData(terria))).not.toContain(
      '"simpleDashboard"'
    );
  });
  it("retains legacy CKAN dashboards beside native dashboard revisions", () => {
    const composition = storyComposition();
    composition.dashboards = [
      {
        id: "old",
        view_id: id,
        title: "Existing CKAN",
        state: emptyDashboardState()
      },
      {
        id: "native",
        view_id: id,
        kind: "simple",
        simple: { id, revision: 2 },
        title: "Simple",
        state: emptyDashboardState()
      }
    ];
    expect(storyComposition(composition).dashboards.length).toBe(2);
    composition.dashboards[1].simple!.revision = 0;
    expect(storyComposition(composition).dashboards.length).toBe(1);
  });
});
