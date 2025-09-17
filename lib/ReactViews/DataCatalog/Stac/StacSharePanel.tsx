import React, { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import { action } from "mobx";
import styled from "styled-components";
import Box from "../../../Styled/Box";
import Button from "../../../Styled/Button";
import Icon, { StyledIcon } from "../../../Styled/Icon";
import Spacing from "../../../Styled/Spacing";
import Text from "../../../Styled/Text";
import Select from "../../../Styled/Select";
import Checkbox from "../../../Styled/Checkbox/Checkbox";
import {
  StacShareManager,
  ShareOptions,
  ShareResult
} from "../../../Models/Catalog/Stac/StacShareManager";
import StacCatalogGroup from "../../../Models/Catalog/Stac/StacCatalogGroup";
import StacCatalogItem from "../../../Models/Catalog/Stac/StacCatalogItem";

interface Props {
  shareManager: StacShareManager;
  catalogMember: StacCatalogGroup | StacCatalogItem;
  onClose?: () => void;
}

const SharePanelContainer = styled.div`
  background: ${(props) =>
    props.theme.dark ? props.theme.dark : props.theme.greyLightest};
  border-radius: 6px;
  padding: 16px;
  margin: 8px 0;
  border: 1px solid ${(props) => props.theme.grey};
`;

const ShareUrlBox = styled.div<{ $isSuccess?: boolean }>`
  background: ${(props) =>
    props.theme.dark ? props.theme.darkLighter : props.theme.greyLighter};
  border: 1px solid
    ${(props) => (props.$isSuccess ? "#4CAF50" : props.theme.grey)};
  border-radius: 4px;
  padding: 12px;
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
  position: relative;
  margin: 8px 0;
`;

const CopyButton = styled(Button)`
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  font-size: 11px;
`;

const OptionsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 12px 0;
`;

const ShareHistoryItem = styled.div`
  background: ${(props) =>
    props.theme.dark ? props.theme.darkLighter : props.theme.greyLighter};
  border-radius: 4px;
  padding: 8px;
  margin: 4px 0;
  border-left: 3px solid ${(props) => props.theme.colorPrimary};
`;

const ShareHistoryActions = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 8px;
`;

const StacSharePanel: React.FC<Props> = observer(
  ({ shareManager, catalogMember, onClose }) => {
    const { t } = useTranslation();

    const [shareOptions, setShareOptions] = useState<ShareOptions>({
      includeSearch: true,
      includeVisualization: true,
      includeNavigation: true,
      compressUrl: false,
      expirationDays: 30
    });

    const [currentShare, setCurrentShare] = useState<ShareResult | null>(null);
    const [copySuccess, setCopySuccess] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    const handleShare = action(async () => {
      try {
        let result: ShareResult;

        if (catalogMember instanceof StacCatalogGroup) {
          result = await shareManager.shareStacCatalog(
            catalogMember,
            shareOptions
          );
        } else {
          result = await shareManager.shareStacItem(
            catalogMember,
            shareOptions
          );
        }

        setCurrentShare(result);
      } catch (_error) {
        console.error("Failed to create share:", _error);
      }
    });

    const handleCopyUrl = async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        setCopySuccess(url);
        setTimeout(() => setCopySuccess(null), 2000);
      } catch (_error) {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand("copy");
          setCopySuccess(url);
          setTimeout(() => setCopySuccess(null), 2000);
        } catch (_err) {
          console.error("Failed to copy URL:", _err);
        }
        document.body.removeChild(textArea);
      }
    };

    const handleLoadShare = action(async (shareId: string) => {
      try {
        const state = await shareManager.loadSharedState(shareId);
        shareManager.applySharedState(state, catalogMember);
        onClose?.();
      } catch (_error) {
        console.error("Failed to load shared state:", _error);
      }
    });

    const handleDeleteShare = action((shareId: string) => {
      shareManager.deleteSharedState(shareId);
    });

    const renderShareUrl = (url: string, label: string) => (
      <Box paddedVertically={1}>
        <Text textLight semiBold small>
          {label}
        </Text>
        <ShareUrlBox $isSuccess={copySuccess === url}>
          {url}
          <CopyButton
            size="small"
            onClick={() => handleCopyUrl(url)}
            title={t("stacShare.copyUrl")}
          >
            {copySuccess === url ? (
              <StyledIcon glyph={Icon.GLYPHS.selected} styledWidth="12px" />
            ) : (
              <StyledIcon glyph={Icon.GLYPHS.link} styledWidth="12px" />
            )}
          </CopyButton>
        </ShareUrlBox>
      </Box>
    );

    const statistics = shareManager.getShareStatistics();

    return (
      <SharePanelContainer>
        <Box paddedVertically={1}>
          <Text large semiBold>
            <StyledIcon glyph={Icon.GLYPHS.share} styledWidth="16px" />
            <Spacing right={2} />
            {t("stacShare.title")}
          </Text>

          {catalogMember instanceof StacCatalogGroup && (
            <Text textLight small>
              {t("stacShare.catalogDescription")}
            </Text>
          )}

          {catalogMember instanceof StacCatalogItem && (
            <Text textLight small>
              {t("stacShare.itemDescription")}
            </Text>
          )}
        </Box>

        {/* Share Options */}
        <Box paddedVertically={1}>
          <Text semiBold small>
            {t("stacShare.options")}
          </Text>

          <OptionsGrid>
            <Checkbox
              isChecked={shareOptions.includeSearch || false}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setShareOptions({
                  ...shareOptions,
                  includeSearch: e.target.checked
                })
              }
            >
              {t("stacShare.includeSearch")}
            </Checkbox>

            <Checkbox
              isChecked={shareOptions.includeVisualization || false}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setShareOptions({
                  ...shareOptions,
                  includeVisualization: e.target.checked
                })
              }
            >
              {t("stacShare.includeVisualization")}
            </Checkbox>

            <Checkbox
              isChecked={shareOptions.includeNavigation || false}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setShareOptions({
                  ...shareOptions,
                  includeNavigation: e.target.checked
                })
              }
            >
              {t("stacShare.includeNavigation")}
            </Checkbox>

            <Checkbox
              isChecked={shareOptions.compressUrl || false}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setShareOptions({
                  ...shareOptions,
                  compressUrl: e.target.checked
                })
              }
            >
              {t("stacShare.compressUrl")}
            </Checkbox>
          </OptionsGrid>

          <Box paddedVertically={1}>
            <Text textLight small>
              {t("stacShare.expirationLabel")}
            </Text>
            <Select
              value={shareOptions.expirationDays?.toString() || "30"}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setShareOptions({
                  ...shareOptions,
                  expirationDays: parseInt(e.target.value, 10)
                })
              }
            >
              <option value="1">{t("stacShare.expiration.oneDay")}</option>
              <option value="7">{t("stacShare.expiration.oneWeek")}</option>
              <option value="30">{t("stacShare.expiration.oneMonth")}</option>
              <option value="90">
                {t("stacShare.expiration.threeMonths")}
              </option>
              <option value="365">{t("stacShare.expiration.oneYear")}</option>
            </Select>
          </Box>
        </Box>

        {/* Create Share Button */}
        <Box paddedVertically={1}>
          <Button
            fullWidth
            primary
            disabled={shareManager.isSharing}
            onClick={handleShare}
          >
            {shareManager.isSharing ? (
              <>
                <StyledIcon glyph={Icon.GLYPHS.loader} styledWidth="14px" />
                <Spacing right={2} />
                {t("stacShare.creating")}
              </>
            ) : (
              <>
                <StyledIcon glyph={Icon.GLYPHS.share} styledWidth="14px" />
                <Spacing right={2} />
                {t("stacShare.createShare")}
              </>
            )}
          </Button>
        </Box>

        {/* Current Share Result */}
        {currentShare && (
          <Box paddedVertically={1}>
            <Text semiBold>{t("stacShare.shareCreated")}</Text>

            {renderShareUrl(currentShare.shareUrl, t("stacShare.fullUrl"))}

            {currentShare.shortUrl &&
              renderShareUrl(currentShare.shortUrl, t("stacShare.shortUrl"))}

            {currentShare.expiresAt && (
              <Text textLight small>
                {t("stacShare.expiresAt", {
                  date: currentShare.expiresAt.toLocaleDateString()
                })}
              </Text>
            )}
          </Box>
        )}

        {/* Share History */}
        <Box paddedVertically={1}>
          <Button
            secondary
            fullWidth
            onClick={() => setShowHistory(!showHistory)}
          >
            <StyledIcon
              glyph={showHistory ? Icon.GLYPHS.increase : Icon.GLYPHS.arrowDown}
              styledWidth="12px"
            />
            <Spacing right={2} />
            {t("stacShare.history")} ({statistics.totalShares})
          </Button>

          {showHistory && (
            <Box paddedVertically={1}>
              {shareManager.sharedStates.length === 0 ? (
                <Text textLight small>
                  {t("stacShare.noHistory")}
                </Text>
              ) : (
                shareManager.sharedStates.slice(0, 5).map((state) => (
                  <ShareHistoryItem key={state.shareId}>
                    <Text semiBold small>
                      {state.catalogTitle || t("stacShare.untitled")}
                    </Text>
                    <Text textLight mini>
                      {state.catalogType} •{" "}
                      {new Date(state.timestamp).toLocaleDateString()}
                    </Text>
                    <ShareHistoryActions>
                      <Button
                        size="small"
                        onClick={() => handleLoadShare(state.shareId!)}
                      >
                        <StyledIcon
                          glyph={Icon.GLYPHS.download}
                          styledWidth="10px"
                        />
                        <Spacing right={1} />
                        {t("stacShare.load")}
                      </Button>
                      <Button
                        size="small"
                        onClick={() => handleDeleteShare(state.shareId!)}
                      >
                        <StyledIcon
                          glyph={Icon.GLYPHS.trashcan}
                          styledWidth="10px"
                        />
                      </Button>
                    </ShareHistoryActions>
                  </ShareHistoryItem>
                ))
              )}

              {shareManager.sharedStates.length > 5 && (
                <Text textLight small>
                  ... and {shareManager.sharedStates.length - 5} more shares
                </Text>
              )}

              {shareManager.sharedStates.length > 0 && (
                <Box paddedVertically={1}>
                  <Button
                    size="small"
                    secondary
                    onClick={() => shareManager.clearAllShares()}
                  >
                    <StyledIcon
                      glyph={Icon.GLYPHS.trashcan}
                      styledWidth="10px"
                    />
                    <Spacing right={1} />
                    {t("stacShare.clearAll")}
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* Statistics */}
        {statistics.totalShares > 0 && (
          <Box paddedVertically={1}>
            <Text textLight mini>
              {t("stacShare.statistics", {
                total: statistics.totalShares,
                catalogs: statistics.catalogShares,
                items: statistics.itemShares
              })}
            </Text>
          </Box>
        )}

        {/* Close Button */}
        {onClose && (
          <Box paddedVertically={1}>
            <Button fullWidth secondary onClick={onClose}>
              {t("general.close")}
            </Button>
          </Box>
        )}
      </SharePanelContainer>
    );
  }
);

// Quick share button component for toolbar integration
export const StacQuickShareButton: React.FC<{
  shareManager: StacShareManager;
  catalogMember: StacCatalogGroup | StacCatalogItem;
}> = observer(({ shareManager, catalogMember }) => {
  const { t } = useTranslation();
  const [showPanel, setShowPanel] = useState(false);

  const handleQuickShare = action(async () => {
    try {
      const result =
        catalogMember instanceof StacCatalogGroup
          ? await shareManager.shareStacCatalog(catalogMember, {
              includeSearch: true,
              includeNavigation: true,
              compressUrl: true
            })
          : await shareManager.shareStacItem(catalogMember, {
              includeVisualization: true,
              compressUrl: true
            });

      // Copy to clipboard immediately
      await navigator.clipboard.writeText(result.shortUrl || result.shareUrl);

      // Show success feedback (could integrate with notification system)
      console.log("Share URL copied to clipboard:", result.shareUrl);
    } catch (_error) {
      console.error("Quick share failed:", _error);
      setShowPanel(true); // Fall back to full panel
    }
  });

  return (
    <>
      <Button
        size="small"
        onClick={handleQuickShare}
        title={t("stacShare.quickShare")}
        disabled={shareManager.isSharing}
      >
        <StyledIcon glyph={Icon.GLYPHS.share} styledWidth="12px" />
      </Button>

      {showPanel && (
        <StacSharePanel
          shareManager={shareManager}
          catalogMember={catalogMember}
          onClose={() => setShowPanel(false)}
        />
      )}
    </>
  );
});

export default StacSharePanel;
