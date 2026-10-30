import { cleanup, fireEvent, screen } from "@testing-library/react";
import { runInAction } from "mobx";
import { http, HttpResponse } from "msw";
import Terria from "../../lib/Models/Terria";
import CkanSession from "../../lib/Models/CkanSession";
import ViewState from "../../lib/ReactViewModels/ViewState";
import DatasetSearchEntry from "../../lib/ReactViews/Tools/DatasetSearch/DatasetSearchEntry";
import DataAssistantTool from "../../lib/ReactViews/Tools/DataAssistant/DataAssistantTool";
import { renderWithContexts } from "./withContext";
import { worker } from "../mocks/browser";

describe("DatasetSearch entry and simplified assistant", () => {
  let terria: Terria;
  let viewState: ViewState;
  let session: CkanSession;
  beforeEach(() => {
    terria = new Terria({ baseUrl: "./" });
    terria.configParameters.dataAssistant = { enabled: true };
    viewState = new ViewState({ terria, catalogSearchProvider: undefined });
    session = new CkanSession(terria, { checkOnFocus: false });
    runInAction(() => {
      terria.ckanSession = session;
      session.status = "authenticated";
      session.user = { name: "alice", displayName: "Alice", sysadmin: false };
      viewState.useSmallScreenInterface = true;
    });
    worker.use(
      http.get("/api/terriassistant/data/bootstrap", () =>
        HttpResponse.json({
          enabled: true,
          csrf_token: "test",
          capabilities: { map_editing: 1 }
        })
      )
    );
  });
  afterEach(() => {
    cleanup();
    viewState.dispose();
    session.dispose();
  });
  it("opens dataset search from Add data and dismisses the catalogue overlay", () => {
    viewState.openAddData();
    const open = spyOn(viewState, "openTool");
    renderWithContexts(<DatasetSearchEntry viewState={viewState} />, viewState);
    fireEvent.click(
      screen.getByRole("button", { name: /datasetSearch.title/ })
    );
    expect(viewState.explorerPanelIsVisible).toBe(false);
    expect(open).toHaveBeenCalledWith(
      jasmine.objectContaining({ toolName: "dataset-search" })
    );
  });
  it("keeps the assistant context collapsed and omits search, upload and map link forms", () => {
    renderWithContexts(<DataAssistantTool viewState={viewState} />, viewState);
    expect(
      screen.getByRole("textbox", { name: "dataAssistant.question" })
    ).toBeVisible();
    const context = screen
      .getByText("dataAssistant.context")
      .closest("details");
    expect(context?.open).toBe(false);
    expect(screen.queryByText("dataAssistant.findAndLoad")).toBeNull();
    expect(screen.queryByText("dataAssistant.shareMap")).toBeNull();
    expect(screen.queryByText("dataAssistant.searchArea")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
