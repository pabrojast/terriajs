import { reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { FC, MouseEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { BaseModel } from "../../../../Models/Definition/Model";
import AnimatedSpinnerIcon from "../../../../Styled/AnimatedSpinnerIcon";
import Box from "../../../../Styled/Box";
import { RawButton } from "../../../../Styled/Button";
import Icon, { StyledIcon } from "../../../../Styled/Icon";
import Ul, { Li } from "../../../../Styled/List";
import Text, { TextSpan } from "../../../../Styled/Text";
import { useViewState } from "../../../Context";
import Prompt from "../../../Generic/Prompt";
import MobileMenuItem from "../../../Mobile/MobileMenuItem";
import MenuPanel from "../../../StandardUserInterface/customizable/MenuPanel";

import Styles from "./ckan-session-panel.scss";

interface Props {
  smallScreen?: boolean;
}

const PANEL_WIDTH = "260px";

const PanelLink = styled.a`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 0;
  color: ${(p) => p.theme.textLight};
  text-decoration: none;
  &:hover,
  &:focus {
    text-decoration: underline;
  }
`;

const PanelButton = styled(RawButton)`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  text-align: left;
  &:hover,
  &:focus {
    text-decoration: underline;
  }
`;

/**
 * Menu bar entry for the CKAN portal session (`terria.ckanSession`).
 *
 * - anonymous: a real `<a target="_blank">` link to the portal login page
 *   (pop-up blockers never interfere and the map is preserved);
 * - login tab opened: a clickable "finish logging in" button plus a prompt;
 * - checking / error: clickable buttons that re-check the session;
 * - authenticated: a dropdown with the user name, "open my private
 *   datasets", "refresh session", portal profile and log out.
 *
 * No state renders a disabled button. Renders nothing when the session
 * integration is not configured.
 */
const CkanSessionPanel: FC<Props> = observer(function CkanSessionPanel({
  smallScreen = false
}: Props) {
  const viewState = useViewState();
  const { terria } = viewState;
  const { t } = useTranslation();
  const session = terria.ckanSession;
  const [isOpen, setIsOpen] = useState(false);

  // Every time the private catalog group is added or removed make sure the
  // explorer does not point at a tab or a previewed item that no longer
  // exists (e.g. after logging out).
  useEffect(() => {
    if (session === undefined) return;
    return reaction(
      () => session.catalogGeneration,
      () => {
        runInAction(() => {
          const tabId = viewState.activeTabIdInCategory;
          if (
            tabId !== undefined &&
            terria.getModelById(BaseModel, tabId) === undefined
          ) {
            viewState.activeTabIdInCategory = undefined;
          }
          const previewed = viewState.previewedItem;
          if (
            previewed !== undefined &&
            previewed.uniqueId !== undefined &&
            terria.getModelById(BaseModel, previewed.uniqueId) !== previewed
          ) {
            viewState.clearPreviewedItem();
          }
        });
      }
    );
  }, [session, viewState, terria]);

  if (session === undefined) return null;

  const refresh = () => {
    void session.refresh();
  };

  if (session.user !== undefined) {
    // Authenticated (the user is also kept while a transient whoami error is
    // being retried).
    const displayName = session.displayName;
    const profileUrl = session.profileUrl;
    const logoutHref = session.buildLogoutHref();

    const openPrivateCatalog = () => {
      setIsOpen(false);
      const tabId = session.activeCatalogId;
      const target =
        terria.getModelById(
          BaseModel,
          session.injectedPrivateCatalogId ?? session.referenceId
        ) ??
        (tabId !== undefined
          ? terria.getModelById(BaseModel, tabId)
          : undefined);
      runInAction(() => {
        viewState.openAddData();
        if (terria.configParameters.tabbedCatalog && tabId !== undefined) {
          viewState.activeTabIdInCategory = tabId;
        }
      });
      if (target !== undefined) {
        viewState
          .viewCatalogMember(target)
          .then((result) => result.raiseError(terria));
      }
    };

    return (
      //@ts-expect-error - not yet ready to tackle tsfying MenuPanel
      <MenuPanel
        theme={{ btn: Styles.btn, icon: Icon.GLYPHS.user }}
        btnText={
          session.pendingLogout ? t("ckanSession.checking") : displayName
        }
        btnTitle={t("ckanSession.btnTitleAuthenticated", {
          user: displayName
        })}
        mobileIcon={Icon.GLYPHS.user}
        viewState={viewState}
        smallScreen={smallScreen}
        isOpen={isOpen}
        onOpenChanged={setIsOpen}
      >
        <Box column styledWidth={PANEL_WIDTH} paddedRatio={3}>
          <Text textLight medium>
            {t("ckanSession.signedInAs")}{" "}
            <strong className={Styles.userName} title={displayName}>
              {displayName}
            </strong>
          </Text>
          {session.user.sysadmin && (
            <Text textLightDimmed small>
              {t("ckanSession.sysadmin")}
            </Text>
          )}
          {session.status === "error" && (
            <Text textLightDimmed small>
              {t("ckanSession.error")}
            </Text>
          )}
          <Ul
            spaced
            lined
            fullWidth
            column
            css={`
              padding-left: 0;
              margin-top: 10px;
            `}
          >
            <Li>
              <PanelButton fullWidth textLight onClick={openPrivateCatalog}>
                <StyledIcon
                  glyph={Icon.GLYPHS.dataCatalog}
                  light
                  styledWidth="16px"
                />
                <TextSpan textLight medium>
                  {t("ckanSession.openPrivateCatalog")}
                </TextSpan>
              </PanelButton>
            </Li>
            <Li>
              <PanelButton
                fullWidth
                textLight
                title={t("ckanSession.refresh")}
                onClick={refresh}
              >
                {session.isRefreshing ? (
                  <AnimatedSpinnerIcon light styledWidth="16px" />
                ) : (
                  <StyledIcon
                    glyph={Icon.GLYPHS.refresh}
                    light
                    styledWidth="16px"
                  />
                )}
                <TextSpan textLight medium>
                  {t("ckanSession.refresh")}
                </TextSpan>
              </PanelButton>
            </Li>
            {profileUrl !== undefined && (
              <Li>
                <PanelLink
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                >
                  <StyledIcon
                    glyph={Icon.GLYPHS.externalLink}
                    light
                    styledWidth="16px"
                  />
                  <TextSpan textLight medium>
                    {t("ckanSession.profile")}
                  </TextSpan>
                </PanelLink>
              </Li>
            )}
            {logoutHref !== undefined && (
              <Li>
                <PanelLink
                  href={logoutHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                    // Recompute on click: the location may have changed
                    // since the link was rendered.
                    const href = session.buildLogoutHref();
                    if (href !== undefined) e.currentTarget.href = href;
                    session.markLogoutOpened();
                    setIsOpen(false);
                  }}
                >
                  <StyledIcon
                    glyph={Icon.GLYPHS.externalLink}
                    light
                    styledWidth="16px"
                  />
                  <TextSpan textLight medium>
                    {t("ckanSession.logout")}
                  </TextSpan>
                </PanelLink>
              </Li>
            )}
          </Ul>
          <Text textLightDimmed mini>
            {t("ckanSession.newTabHint")}
          </Text>
        </Box>
      </MenuPanel>
    );
  }

  if (session.status === "anonymous" && session.pendingLogin) {
    // A login tab was opened; the session change has not been seen yet.
    if (smallScreen) {
      return (
        <MobileMenuItem
          onClick={refresh}
          caption={t("ckanSession.pendingLogin")}
          icon={Icon.GLYPHS.loader}
        />
      );
    }
    return (
      <div>
        <button
          type="button"
          className={Styles.btn}
          title={t("ckanSession.pendingLoginTitle")}
          onClick={refresh}
        >
          <AnimatedSpinnerIcon styledWidth="15px" />
          <span>{t("ckanSession.pendingLogin")}</span>
        </button>
        <Prompt
          content={
            <Text bold textLight>
              {t("ckanSession.pendingLoginPrompt")}
            </Text>
          }
          displayDelay={300}
          dismissText={t("ckanSession.checkNow")}
          dismissAction={refresh}
          caretTopOffset={-8}
          caretLeftOffset={60}
          caretSize={15}
          promptWidth={260}
          promptTopOffset={50}
          promptLeftOffset={-60}
          isVisible
        />
      </div>
    );
  }

  if (session.status === "unknown" || session.isRefreshing) {
    // First whoami (or a re-check) in flight without a known user.
    if (smallScreen) {
      return (
        <MobileMenuItem
          onClick={refresh}
          caption={t("ckanSession.checking")}
          icon={Icon.GLYPHS.loader}
        />
      );
    }
    return (
      <div>
        <button
          type="button"
          className={Styles.btn}
          title={t("ckanSession.checking")}
          onClick={refresh}
        >
          <AnimatedSpinnerIcon styledWidth="15px" />
          <span>{t("ckanSession.checking")}</span>
        </button>
      </div>
    );
  }

  if (session.status === "anonymous") {
    if (smallScreen) {
      return (
        <MobileMenuItem
          href={session.buildLoginHref()}
          onClick={() => session.markLoginOpened()}
          caption={t("ckanSession.btnLogin")}
          icon={Icon.GLYPHS.lock}
        />
      );
    }
    return (
      <div>
        <a
          className={Styles.btn}
          href={session.buildLoginHref()}
          target="_blank"
          rel="noopener noreferrer"
          title={t("ckanSession.btnLoginTitle")}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            // Recompute on click: the location may have changed since the
            // link was rendered.
            e.currentTarget.href = session.buildLoginHref();
            session.markLoginOpened();
          }}
        >
          <Icon glyph={Icon.GLYPHS.lock} />
          <span>{t("ckanSession.btnLogin")}</span>
        </a>
      </div>
    );
  }

  // status === "error" without a user: the whoami failed, offer a retry.
  const errorTitle = session.lastError?.message ?? t("ckanSession.error");
  if (smallScreen) {
    return (
      <MobileMenuItem
        onClick={refresh}
        caption={t("ckanSession.errorShort")}
        icon={Icon.GLYPHS.info}
      />
    );
  }
  return (
    <div>
      <button
        type="button"
        className={Styles.btn}
        title={errorTitle}
        onClick={refresh}
      >
        <Icon glyph={Icon.GLYPHS.info} />
        <span>{t("ckanSession.errorShort")}</span>
      </button>
    </div>
  );
});

export default CkanSessionPanel;
