import { runInAction } from "mobx";
import { http, HttpResponse } from "msw";
import Terria from "../../lib/Models/Terria";
import CkanSession from "../../lib/Models/CkanSession";
import ViewState from "../../lib/ReactViewModels/ViewState";
import DataAssistantViewModel, {
  dataCsv
} from "../../lib/ReactViewModels/DataAssistantViewModel";
import CsvCatalogItem from "../../lib/Models/Catalog/CatalogItems/CsvCatalogItem";
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
    const unauthorized = spyOn(session, "handleUnauthorized").and.callThrough();
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
