import { runInAction } from "mobx";
import { http, HttpResponse } from "msw";
import Terria from "../../lib/Models/Terria";
import CkanSession from "../../lib/Models/CkanSession";
import ViewState from "../../lib/ReactViewModels/ViewState";
import DataAssistantViewModel, {
  dataCsv
} from "../../lib/ReactViewModels/DataAssistantViewModel";
import CsvCatalogItem from "../../lib/Models/Catalog/CatalogItems/CsvCatalogItem";
import CogTimeSeriesCatalogItem from "../../lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import GeoJsonCatalogItem from "../../lib/Models/Catalog/CatalogItems/GeoJsonCatalogItem";
import CommonStrata from "../../lib/Models/Definition/CommonStrata";
import updateModelFromJson from "../../lib/Models/Definition/updateModelFromJson";
import { worker } from "../mocks/browser";

describe("DataAssistant session and tool flow", function () {
  let terria: Terria;
  let viewState: ViewState;
  let vm: DataAssistantViewModel;
  let session: CkanSession;
  const base = "/api/terriassistant/data";
  beforeEach(function () {
    terria = new Terria({ baseUrl: "./" });
    terria.configParameters.dataAssistant = { enabled: true };
    viewState = new ViewState({ terria, catalogSearchProvider: undefined });
    session = new CkanSession(terria, { checkOnFocus: false });
    spyOn(session, "refresh").and.returnValue(Promise.resolve());
    runInAction(() => {
      terria.ckanSession = session;
      session.status = "authenticated";
      session.user = { name: "alice", displayName: "Alice", sysadmin: false };
    });
    worker.use(
      http.get(base + "/bootstrap", () =>
        HttpResponse.json({ enabled: true, csrf_token: "test-csrf" })
      ),
      http.post(base + "/conversations", () =>
        HttpResponse.json({ id: "conversation" })
      ),
      http.delete(base + "/conversations/conversation", () =>
        HttpResponse.json({ deleted: true })
      ),
      http.post(base + "/turns/turn/cancel", () =>
        HttpResponse.json({ status: "cancelled" })
      )
    );
  });
  afterEach(function () {
    vm?.dispose();
    session.dispose();
    viewState.dispose();
  });
  it("uses the selected tables' full dates, preserving manual dates until the selection changes", () => {
    const first = new CsvCatalogItem("first", terria, undefined);
    const second = new CsvCatalogItem("second", terria, undefined);
    runInAction(() => {
      first.dataColumnMajor = [
        ["date", "2024-03-02", "", "2024-01-15"],
        ["value", "1", "2", "3"]
      ];
      second.dataColumnMajor = [
        ["date", "2023-01-01", "2025-01-01"],
        ["value", "4", "5"]
      ];
      terria.workbench.items = [first, second];
    });
    vm = new DataAssistantViewModel(viewState);
    expect([vm.start, vm.end]).toEqual(["2023-01-01", "2025-01-01"]);
    vm.toggleSource("layer:second");
    expect([vm.start, vm.end]).toEqual(["2024-01-15", "2024-03-02"]);
    vm.setDates("2024-02-01", "2024-02-29");
    runInAction(() => {
      first.dataColumnMajor = [
        ["date", "2024-01-01", "2024-05-01"],
        ["value", "1", "2"]
      ];
    });
    expect([vm.start, vm.end]).toEqual(["2024-02-01", "2024-02-29"]);
    vm.useDataDates();
    expect([vm.start, vm.end]).toEqual(["2024-01-01", "2024-05-01"]);
    vm.setDates("2024-02-01", "2024-02-29");
    vm.toggleSource("layer:second");
    expect(vm.datesAutomatic).toBe(true);
    expect([vm.start, vm.end]).toEqual(["2023-01-01", "2025-01-01"]);
  });
  it("fills dates when a selected table finishes loading and clears them if it is removed", () => {
    const item = new CsvCatalogItem("loading", terria, undefined);
    runInAction(() => {
      terria.workbench.items = [item];
    });
    vm = new DataAssistantViewModel(viewState);
    expect([vm.start, vm.end]).toEqual(["", ""]);
    runInAction(() => {
      item.dataColumnMajor = [
        ["date", "2025-11-07", "2026-03-19"],
        ["value", "1", "2"]
      ];
    });
    expect([vm.start, vm.end]).toEqual(["2025-11-07", "2026-03-19"]);
    runInAction(() => {
      terria.workbench.remove(item);
    });
    expect([vm.start, vm.end]).toEqual(["", ""]);
  });
  it("does not treat numeric values or identifiers as dates", () => {
    const item = new CsvCatalogItem("numbers", terria, undefined);
    runInAction(() => {
      item.dataColumnMajor = [
        ["id", "1", "2"],
        ["value", "2024", "2025"]
      ];
      terria.workbench.items = [item];
    });
    vm = new DataAssistantViewModel(viewState);
    expect([vm.start, vm.end]).toEqual(["", ""]);
  });
  it("uses GeoJSON observation dates", async () => {
    const item = new GeoJsonCatalogItem("observations", terria);
    runInAction(() => {
      item.setTrait(CommonStrata.definition, "geoJsonData", {
        type: "FeatureCollection",
        features: ["2025-11-07", "2026-03-19"].map((date) => ({
          type: "Feature",
          properties: { date, value: 2 },
          geometry: { type: "Point", coordinates: [55, -4] }
        }))
      });
      terria.workbench.items = [item];
    });
    vm = new DataAssistantViewModel(viewState);
    (await item.loadMapItems()).throwIfError();
    expect([vm.start, vm.end]).toEqual(["2025-11-07", "2026-03-19"]);
  });
  it("uses all raster steps instead of the current map instant and updates after a manifest change", () => {
    const item = new CogTimeSeriesCatalogItem("satellite", terria);
    updateModelFromJson(item, CommonStrata.definition, {
      currentTime: "2024-02-01",
      timeEntries: [
        { time: "2024-03-01", cogs: ["https://example.org/mar.tif"] },
        { time: "invalid", cogs: [] },
        { time: "2024-01-01", cogs: ["https://example.org/jan.tif"] }
      ]
    });
    runInAction(() => {
      terria.workbench.items = [item];
    });
    vm = new DataAssistantViewModel(viewState);
    expect([vm.start, vm.end]).toEqual(["2024-01-01", "2024-03-01"]);
    updateModelFromJson(item, CommonStrata.definition, {
      timeEntries: [
        { time: "2023-01-01", cogs: [] },
        { time: "2026-01-01", cogs: [] }
      ]
    });
    expect([vm.start, vm.end]).toEqual(["2023-01-01", "2026-01-01"]);
    item.dispose();
  });
  it("executes a requested table tool and returns calculated evidence", async function () {
    const item = new CsvCatalogItem("sample", terria, undefined);
    runInAction(() => {
      item.dataColumnMajor = [["value", "1", "2", "3", ""]];
      terria.workbench.items = [item];
    });
    vm = new DataAssistantViewModel(viewState);
    let received: unknown;
    worker.use(
      http.post(base + "/conversations/conversation/turns", ({ request }) => {
        expect(request.headers.get("X-CSRFToken")).toBe("test-csrf");
        return HttpResponse.json({
          id: "turn",
          status: "awaiting_tools",
          pending: [
            {
              id: "tool",
              name: "query_data",
              arguments: {
                source_id: "layer:sample",
                operation: "statistics",
                column: "value"
              }
            }
          ]
        });
      }),
      http.post(base + "/turns/turn/tool-results", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({
          id: "turn",
          status: "completed",
          answer: "Mean 2 [E1]"
        });
      })
    );
    await vm.ask("What is the mean?");
    expect(vm.error).toBe("");
    expect(vm.entries[0].turn?.status).toBe("completed");
    const payload = received as {
      results: { result: { statistics: Record<string, number> } }[];
    };
    expect(payload.results[0].result.statistics.mean).toBe(2);
    expect(payload.results[0].result.statistics.missing).toBe(1);
  });
  it("does not send anonymous questions", async function () {
    runInAction(() => {
      session.status = "anonymous";
      session.user = undefined;
    });
    vm = new DataAssistantViewModel(viewState);
    await vm.ask("Question");
    expect(vm.entries.length).toBe(0);
    expect(vm.busy).toBe(false);
  });
  it("handles an expired session when CKAN returns an HTML error page", async function () {
    const unauthorized = spyOn(session, "handleUnauthorized");
    worker.use(
      http.get(
        base + "/bootstrap",
        () => new HttpResponse("<html>Sign in</html>", { status: 401 })
      )
    );
    vm = new DataAssistantViewModel(viewState);
    await vm.initialize();
    expect(unauthorized).toHaveBeenCalledWith(401);
    expect(vm.ready).toBe(false);
    expect(vm.error).not.toContain("JSON");
    expect(vm.error).not.toContain("<html>");
  });
  it("discards late results after the account changes", async function () {
    vm = new DataAssistantViewModel(viewState);
    let release!: () => void;
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    worker.use(
      http.post(base + "/conversations/conversation/turns", async () => {
        started();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return HttpResponse.json({
          id: "turn",
          status: "completed",
          answer: "Alice's private data"
        });
      })
    );
    const asking = vm.ask("Private question");
    await requestStarted;
    runInAction(() => {
      session.user = { name: "bob", displayName: "Bob", sysadmin: false };
    });
    release();
    await asking;
    expect(vm.entries.length).toBe(0);
    expect(vm.busy).toBe(false);
    expect(vm.error).toBe("");
  });
  it("escapes spreadsheet formula strings while preserving numeric negatives", function () {
    const csv = dataCsv([
      { name: '=HYPERLINK("https://example.invalid")', value: -2 }
    ]);
    expect(csv).toContain("'=");
    expect(csv).toContain('"-2"');
    expect(dataCsv([{ value: "-2" }], false)).toContain('"-2"');
  });
});
