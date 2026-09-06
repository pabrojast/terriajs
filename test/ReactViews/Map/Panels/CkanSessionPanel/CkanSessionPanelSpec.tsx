import { runInAction } from "mobx";
import { act } from "react-dom/test-utils";
import { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import CkanSession, {
  CkanSessionStatus,
  CkanSessionUser
} from "../../../../../lib/Models/CkanSession";
import CommonStrata from "../../../../../lib/Models/Definition/CommonStrata";
import { BaseModel } from "../../../../../lib/Models/Definition/Model";
import Terria from "../../../../../lib/Models/Terria";
import ViewState from "../../../../../lib/ReactViewModels/ViewState";
import CkanSessionPanel from "../../../../../lib/ReactViews/Map/Panels/CkanSessionPanel/CkanSessionPanel";
import MobileMenuItem from "../../../../../lib/ReactViews/Mobile/MobileMenuItem";
import { createWithContexts } from "../../../withContext";

const GROUP_ID = "ckan-private-catalog";
const ALICE: CkanSessionUser = {
  name: "alice",
  displayName: "Alice",
  sysadmin: false
};

describe("CkanSessionPanel", function () {
  let terria: Terria;
  let viewState: ViewState;
  let session: CkanSession;
  let testRenderer: ReactTestRenderer | undefined;

  beforeEach(function () {
    terria = new Terria({
      baseUrl: "./"
    });
    viewState = new ViewState({
      terria: terria,
      catalogSearchProvider: undefined
    });
    session = installSession({ checkOnFocus: false });
  });

  afterEach(function () {
    act(() => {
      testRenderer?.unmount();
    });
    testRenderer = undefined;
    session.dispose();
  });

  /** Creates a CkanSession that never hits the network and attaches it to terria. */
  function installSession(
    config: ConstructorParameters<typeof CkanSession>[1]
  ): CkanSession {
    const created = new CkanSession(terria, config);
    spyOn(created, "refresh").and.returnValue(Promise.resolve());
    runInAction(() => {
      terria.ckanSession = created;
    });
    return created;
  }

  function setSession(status: CkanSessionStatus, user?: CkanSessionUser) {
    runInAction(() => {
      session.status = status;
      session.user = user;
    });
  }

  function render(smallScreen = false): ReactTestRenderer {
    act(() => {
      testRenderer = createWithContexts(
        viewState,
        <CkanSessionPanel smallScreen={smallScreen} />
      );
    });
    return testRenderer!;
  }

  /** Host elements whose direct children contain the given text node. */
  function findByText(
    renderer: ReactTestRenderer,
    text: string
  ): ReactTestInstance[] {
    return renderer.root.findAll((node) => {
      if (typeof node.type !== "string") return false;
      const children = node.props.children;
      if (typeof children === "string") return children === text;
      return Array.isArray(children) && children.includes(text);
    });
  }

  function closest(node: ReactTestInstance, type: string): ReactTestInstance {
    let current: ReactTestInstance | null = node;
    while (current !== null) {
      if (current.type === type) return current;
      current = current.parent;
    }
    throw new Error(`No ancestor <${type}> found`);
  }

  function addPrivateGroup(): BaseModel {
    terria.catalog.group
      .addMembersFromJson(CommonStrata.definition, [
        { id: GROUP_ID, type: "group", name: "Private datasets (Alice)" }
      ])
      .throwIfError();
    return terria.getModelById(BaseModel, GROUP_ID)!;
  }

  function openPanel(renderer: ReactTestRenderer): void {
    const toggle = renderer.root.find(
      (node) =>
        node.type === "button" &&
        node.props.title === "ckanSession.btnTitleAuthenticated"
    );
    act(() => {
      toggle.props.onClick({ nativeEvent: {} });
    });
  }

  it("renders nothing when terria.ckanSession is undefined", function () {
    runInAction(() => {
      terria.ckanSession = undefined;
    });
    const renderer = render();
    expect(renderer.toJSON()).toBeNull();
  });

  it("renders a clickable checking button while the status is unknown", function () {
    const renderer = render();
    const button = renderer.root.findByType("button");
    expect(button.props.disabled).toBeFalsy();
    expect(findByText(renderer, "ckanSession.checking").length).toBe(1);
    act(() => {
      button.props.onClick();
    });
    expect(session.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders a login link opening a new tab with came_from when anonymous", function () {
    setSession("anonymous");
    const openSpy = spyOn(window, "open");
    const renderer = render();

    const link = renderer.root.findByType("a");
    expect(link.props.href).toMatch(/^\/user\/login\?came_from=/);
    expect(decodeURIComponent(link.props.href.split("came_from=")[1])).toBe(
      window.location.pathname
    );
    expect(link.props.target).toBe("_blank");
    expect(link.props.rel).toContain("noopener");
    expect(findByText(renderer, "ckanSession.btnLogin").length).toBe(1);
    expect(renderer.root.findAllByType("button").length).toBe(0);

    act(() => {
      link.props.onClick({ currentTarget: { href: "" } });
    });
    expect(session.pendingLogin).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("renders the pending-login button and prompt after the login link is clicked", function () {
    setSession("anonymous");
    const renderer = render();
    act(() => {
      renderer.root
        .findByType("a")
        .props.onClick({ currentTarget: { href: "" } });
    });

    expect(renderer.root.findAllByType("a").length).toBe(0);
    const pending = closest(
      findByText(renderer, "ckanSession.pendingLogin")[0],
      "button"
    );
    expect(pending.props.disabled).toBeFalsy();
    expect(findByText(renderer, "ckanSession.pendingLoginPrompt").length).toBe(
      1
    );
    act(() => {
      pending.props.onClick();
    });
    expect(session.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders a MobileMenuItem link when anonymous on a small screen", function () {
    setSession("anonymous");
    const renderer = render(true);

    const item = renderer.root.findByType(MobileMenuItem);
    expect(item.props.href).toMatch(/^\/user\/login\?came_from=/);
    const link = renderer.root.findByType("a");
    expect(link.props.target).toBe("_blank");
    act(() => {
      link.props.onClick({ currentTarget: { href: "" } });
    });
    expect(session.pendingLogin).toBe(true);
  });

  it("renders a MobileMenuItem button (no href) while checking on a small screen", function () {
    const renderer = render(true);
    const item = renderer.root.findByType(MobileMenuItem);
    expect(item.props.href).toBeUndefined();
    expect(item.props.caption).toBe("ckanSession.checking");
    act(() => {
      renderer.root.findByType("button").props.onClick();
    });
    expect(session.refresh).toHaveBeenCalledTimes(1);
  });

  it("renders the user name and the panel actions when authenticated", function () {
    setSession("authenticated", ALICE);
    const renderer = render();

    expect(findByText(renderer, "Alice").length).toBeGreaterThan(0);
    expect(findByText(renderer, "ckanSession.logout").length).toBe(0);

    openPanel(renderer);

    expect(findByText(renderer, "ckanSession.openPrivateCatalog").length).toBe(
      1
    );
    expect(findByText(renderer, "ckanSession.refresh").length).toBe(1);
    expect(findByText(renderer, "ckanSession.logout").length).toBe(1);
    // No profile url in this configuration.
    expect(findByText(renderer, "ckanSession.profile").length).toBe(0);
    expect(findByText(renderer, "ckanSession.sysadmin").length).toBe(0);

    const refreshButton = closest(
      findByText(renderer, "ckanSession.refresh")[0],
      "button"
    );
    expect(refreshButton.props.disabled).toBeFalsy();
    act(() => {
      refreshButton.props.onClick();
    });
    expect(session.refresh).toHaveBeenCalledTimes(1);

    const logout = closest(findByText(renderer, "ckanSession.logout")[0], "a");
    expect(logout.props.href).toMatch(/^\/user\/_logout\?came_from=/);
    expect(logout.props.target).toBe("_blank");
    expect(logout.props.rel).toContain("noopener");
    act(() => {
      logout.props.onClick({ currentTarget: { href: "" } });
    });
    expect(session.pendingLogout).toBe(true);
  });

  it("renders the profile link and the administrator hint when available", function () {
    session.dispose();
    session = installSession({
      checkOnFocus: false,
      profileUrl: "/user/{{user}}"
    });
    setSession("authenticated", { ...ALICE, sysadmin: true });
    const renderer = render();
    openPanel(renderer);

    expect(findByText(renderer, "ckanSession.sysadmin").length).toBe(1);
    const profile = closest(
      findByText(renderer, "ckanSession.profile")[0],
      "a"
    );
    expect(profile.props.href).toBe("/user/alice");
    expect(profile.props.target).toBe("_blank");
  });

  it("opens the explorer on the private tab from 'open my private datasets'", async function () {
    runInAction(() => {
      terria.configParameters.tabbedCatalog = true;
    });
    addPrivateGroup();
    setSession("authenticated", ALICE);
    const renderer = render();
    openPanel(renderer);

    const open = closest(
      findByText(renderer, "ckanSession.openPrivateCatalog")[0],
      "button"
    );
    await act(async () => {
      open.props.onClick();
    });

    expect(viewState.explorerPanelIsVisible).toBe(true);
    expect(viewState.activeTabCategory).toBe("data-catalog");
    expect(viewState.activeTabIdInCategory).toBe(GROUP_ID);
    expect(viewState.previewedItem?.uniqueId).toBe(GROUP_ID);
  });

  it("renders a retry button when the session check failed", function () {
    setSession("error");
    const renderer = render();

    const button = renderer.root.findByType("button");
    expect(button.props.disabled).toBeFalsy();
    expect(button.props.title).toBe("ckanSession.error");
    expect(findByText(renderer, "ckanSession.errorShort").length).toBe(1);
    act(() => {
      button.props.onClick();
    });
    expect(session.refresh).toHaveBeenCalledTimes(1);
  });

  it("clears the active tab and the previewed item when the private group disappears", async function () {
    runInAction(() => {
      terria.configParameters.tabbedCatalog = true;
    });
    const group = addPrivateGroup();
    setSession("authenticated", ALICE);
    render();

    await viewState.viewCatalogMember(group, true, CommonStrata.user, false);
    runInAction(() => {
      viewState.activeTabIdInCategory = GROUP_ID;
    });
    expect(viewState.previewedItem).toBe(group);

    // While the group still exists nothing is cleared.
    act(() => {
      runInAction(() => {
        session.catalogGeneration++;
      });
    });
    expect(viewState.activeTabIdInCategory).toBe(GROUP_ID);
    expect(viewState.previewedItem).toBe(group);

    act(() => {
      runInAction(() => {
        terria.catalog.group.remove(CommonStrata.definition, group);
        terria.removeModelReferences(group);
        session.catalogGeneration++;
      });
    });
    expect(viewState.activeTabIdInCategory).toBeUndefined();
    expect(viewState.previewedItem).toBeUndefined();
  });
});
