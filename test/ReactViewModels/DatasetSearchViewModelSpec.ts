import { runInAction } from "mobx";
import { http, HttpResponse } from "msw";
import type { Polygon } from "geojson";
import Terria from "../../lib/Models/Terria";
import CkanSession from "../../lib/Models/CkanSession";
import { mapContext } from "../../lib/Models/DataAssistant/MapEdits";
import ViewState from "../../lib/ReactViewModels/ViewState";
import { getDatasetSearch } from "../../lib/ReactViewModels/DatasetSearchViewModel";
import { getDataAssistant } from "../../lib/ReactViewModels/DataAssistantViewModel";
import {
  CatalogSearch,
  DataSourceRef
} from "../../lib/Models/DataAssistant/Types";
import { worker } from "../mocks/browser";

describe("DatasetSearch catalogue workflow", () => {
  let terria: Terria;
  let viewState: ViewState;
  let session: CkanSession;
  const base = "/api/terriassistant/data";
  const rid = "12345678-1234-1234-1234-123456789abc";
  const source: DataSourceRef = {
    id: "ckan:" + rid,
    resource_id: rid,
    dataset_id: "dataset",
    name: "Water",
    format: "GeoJSON"
  };
  const area: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0]
      ]
    ]
  };
  const result = {
    sources: [source],
    datasets_found: 1,
    candidates_found: 1,
    examined: 1,
    unknown_coverage: 0,
    truncated: false
  };
  beforeEach(() => {
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
        HttpResponse.json({
          enabled: false,
          csrf_token: "catalog-csrf",
          capabilities: { spatial_search: 1 }
        })
      )
    );
  });
  afterEach(() => {
    viewState.dispose();
    session.dispose();
  });

  it("searches an area without text or an AI conversation, retaining filters and area across tools and chat resets", async () => {
    const vm = getDatasetSearch(viewState);
    let body: CatalogSearch | undefined;
    worker.use(
      http.post(base + "/catalog/search", async ({ request }) => {
        expect(request.headers.get("X-CSRFToken")).toBe("catalog-csrf");
        body = (await request.json()) as CatalogSearch;
        return HttpResponse.json(result);
      })
    );
    vm.setArea(area);
    vm.setFilter("format", "GeoJSON");
    vm.setFilter("organization", "water");
    vm.setFilter("tags", "rivers, water");
    await vm.search();
    expect(body).toEqual({
      query: "",
      polygon: area,
      formats: ["GeoJSON"],
      organization: "water",
      tags: ["rivers", "water"]
    });
    vm.deactivate();
    getDataAssistant(viewState).reset(false);
    expect(getDatasetSearch(viewState)).toBe(vm);
    expect(vm.polygon).toEqual(area);
    expect(vm.result?.sources).toEqual([source]);
    expect(vm.error).toBe("");
  });
  it("continues empty partial pages with the same spatial filters and deduplicates resources", async () => {
    const vm = getDatasetSearch(viewState);
    let count = 0;
    worker.use(
      http.post(base + "/catalog/search", async ({ request }) => {
        const body = (await request.json()) as CatalogSearch;
        expect(body.polygon).toEqual(area);
        count++;
        if (count === 1)
          return HttpResponse.json({
            ...result,
            sources: [],
            truncated: true,
            next_cursor: "100:0"
          });
        expect(body.cursor).toBe(count === 2 ? "100:0" : "101:0");
        return HttpResponse.json({
          ...result,
          next_cursor: count === 2 ? "101:0" : null,
          truncated: count === 2
        });
      })
    );
    vm.setArea(area);
    await vm.search();
    await vm.search(true);
    await vm.search(true);
    expect(count).toBe(3);
    expect(vm.result?.sources).toEqual([source]);
  });
  it("clears stale results and cancels a pending response when a filter changes", async () => {
    const vm = getDatasetSearch(viewState);
    let started!: () => void;
    let release!: () => void;
    const received = new Promise<void>((resolve) => {
      started = resolve;
    });
    const response = new Promise<void>((resolve) => {
      release = resolve;
    });
    worker.use(
      http.post(base + "/catalog/search", async () => {
        started();
        await response;
        return HttpResponse.json(result);
      })
    );
    const pending = vm.search();
    await received;
    vm.setFilter("query", "different query");
    release();
    await pending;
    expect(vm.result).toBeUndefined();
    expect(vm.request).toBeUndefined();
    expect(vm.searching).toBe(false);
    expect(vm.error).toBe("");
  });
  it("hands the area to the assistant explicitly without coupling future filters", () => {
    const vm = getDatasetSearch(viewState);
    vm.setArea(area);
    const assistant = getDataAssistant(viewState);
    expect(assistant.polygon).toBeUndefined();
    assistant.useArea(vm.polygon!);
    vm.clearArea();
    expect(assistant.polygon).toEqual(area);
  });
  it("loads the chosen saved view only on Add and retains its presentation", async () => {
    const vm = getDatasetSearch(viewState);
    worker.use(
      http.get(base + `/sources/${rid}/map`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("view_id")).toBe(
          "saved-view"
        );
        return HttpResponse.json({
          source,
          views: [],
          model: {
            type: "geojson",
            name: "Saved water map",
            opacity: 0.6,
            style: { fill: "#ff0000" },
            geoJsonData: { type: "FeatureCollection", features: [] }
          }
        });
      })
    );
    vm.setView(rid, "saved-view");
    expect(terria.workbench.items.length).toBe(0);
    await vm.add(source);
    expect(vm.error).toBe("");
    expect(terria.workbench.items.length).toBe(1);
    expect(vm.isAdded(source)).toBe(true);
    expect(mapContext(terria).layers[0].traits.opacity).toBe(0.6);
    await vm.add(source);
    expect(terria.workbench.items.length).toBe(1);
  });
  it("discards all private search state on logout and never adds a resource loaded for a previous account", async () => {
    const vm = getDatasetSearch(viewState);
    vm.setArea(area);
    vm.setFilter("organization", "private-team");
    worker.use(
      http.get(base + `/sources/${rid}/map`, () => {
        runInAction(() => {
          session.status = "anonymous";
          session.user = undefined;
        });
        return HttpResponse.json({
          source,
          views: [],
          model: { type: "geojson", shareable: false }
        });
      })
    );
    await vm.add(source);
    expect(terria.workbench.items.length).toBe(0);
    expect(vm.polygon).toBeUndefined();
    expect(vm.organization).toBe("");
    expect(vm.mapSources.size).toBe(0);
    expect(vm.loadingSource).toBe(false);
  });
});
