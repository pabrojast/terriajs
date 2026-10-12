import { screen } from "@testing-library/dom";
import { ThemeProvider } from "styled-components";
import CatalogSearchProvider from "../../../lib/Models/SearchProviders/CatalogSearchProvider";
import SearchProviderResults from "../../../lib/Models/SearchProviders/SearchProviderResults";
import Terria from "../../../lib/Models/Terria";
import ViewState from "../../../lib/ReactViewModels/ViewState";
import SearchHeader from "../../../lib/ReactViews/Search/SearchHeader";
import { terriaTheme } from "../../../lib/ReactViews/StandardUserInterface";
import { renderWithContexts } from "../withContext";

describe("SearchHeader", function () {
  let viewState: ViewState;
  let results: SearchProviderResults;

  beforeEach(async function () {
    const terria = new Terria({ baseUrl: "./" });
    const provider = new CatalogSearchProvider("catalog", terria);
    viewState = new ViewState({ terria, catalogSearchProvider: provider });
    results = new SearchProviderResults(provider);
    await results.resultsCompletePromise;
  });

  function render(waitingHint?: string) {
    renderWithContexts(
      <ThemeProvider theme={terriaTheme}>
        <SearchHeader
          searchResults={results}
          isWaitingForSearchToStart
          waitingHint={waitingHint}
        />
      </ThemeProvider>,
      viewState
    );
  }

  it("shows the hint instead of a loader while an explicit search has not been submitted", function () {
    render("press enter");
    expect(screen.getByText("press enter")).toBeVisible();
    expect(screen.queryByText("loader.loadingMessage")).not.toBeInTheDocument();
  });

  it("keeps the loader while waiting when there is no hint", function () {
    render();
    expect(screen.queryByText("press enter")).not.toBeInTheDocument();
    expect(screen.getByText("loader.loadingMessage")).toBeVisible();
  });
});
