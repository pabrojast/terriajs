import React from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import { action } from "mobx";
import styled from "styled-components";
import Box from "../../../Styled/Box";
import Button from "../../../Styled/Button";
import Icon, { StyledIcon } from "../../../Styled/Icon";
import Spacing from "../../../Styled/Spacing";
import Text from "../../../Styled/Text";
import StacCatalogItem from "../../../Models/Catalog/Stac/StacCatalogItem";

interface Props {
  item: StacCatalogItem;
}

const AssetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  margin-top: 10px;
`;

const AssetCard = styled.div<{
  $isSelected: boolean;
  $isVisualizable: boolean;
}>`
  border: 1px solid
    ${(props) =>
      props.$isSelected ? props.theme.colorPrimary : props.theme.grey};
  border-radius: 4px;
  padding: 8px;
  cursor: ${(props) => (props.$isVisualizable ? "pointer" : "default")};
  background: ${(props) =>
    props.$isSelected ? props.theme.colorPrimary + "20" : "transparent"};
  opacity: ${(props) => (props.$isVisualizable ? 1 : 0.6)};

  &:hover {
    background: ${(props) =>
      props.$isVisualizable
        ? props.$isSelected
          ? props.theme.colorPrimary + "30"
          : props.theme.grey + "20"
        : "transparent"};
  }
`;

const AssetTitle = styled(Text).attrs({
  textLight: true,
  semiBold: true
})`
  margin-bottom: 4px;
`;

const AssetInfo = styled(Text).attrs({
  textLight: true,
  small: true
})`
  color: ${(props) => props.theme.textLight};
  margin-bottom: 2px;
`;

const AssetRoles = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`;

const RoleTag = styled.span<{ $role: string }>`
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  background: ${(props) => getRoleColor(props.$role, props.theme)};
  color: white;
`;

const VisualIndicator = styled.div<{ $isVisualizable: boolean }>`
  display: flex;
  align-items: center;
  font-size: 10px;
  color: ${(props) =>
    props.$isVisualizable ? props.theme.colorPrimary : props.theme.textLight};
  margin-top: 4px;
`;

function getRoleColor(role: string, theme: any): string {
  const roleColors: Record<string, string> = {
    visual: theme.colorPrimary,
    data: "#2196F3",
    thumbnail: "#FF9800",
    overview: "#9C27B0",
    metadata: "#607D8B",
    info: "#795548"
  };
  return roleColors[role] || theme.grey;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";

  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function getMediaTypeDescription(mediaType?: string): string {
  const descriptions: Record<string, string> = {
    "image/tiff": "GeoTIFF Image",
    "image/geotiff": "GeoTIFF Image",
    "application/vnd.stac.geotiff": "STAC GeoTIFF",
    "image/cog": "Cloud Optimized GeoTIFF",
    "image/png": "PNG Image",
    "image/jpeg": "JPEG Image",
    "image/jp2": "JPEG 2000 Image",
    "application/json": "JSON Metadata",
    "application/xml": "XML Metadata",
    "text/xml": "XML Document"
  };

  return descriptions[mediaType || ""] || mediaType || "Unknown";
}

const StacAssetSelector: React.FC<Props> = observer(({ item }) => {
  const { t } = useTranslation();

  if (!item.assets || item.assets.length === 0) {
    return (
      <Box paddedVertically>
        <Text textLight>{t("stacCatalogItem.noAssets")}</Text>
      </Box>
    );
  }

  const handleAssetSelect = action((assetKey: string) => {
    const asset = item.assets?.find((a) => a.key === assetKey);
    if (asset && asset.visualizable) {
      item.selectAsset(assetKey);
    }
  });

  return (
    <Box>
      <Text textLight semiBold>
        {t("stacCatalogItem.availableAssets")} ({item.assets.length})
      </Text>

      <AssetGrid>
        {item.assets.map((asset) => (
          <AssetCard
            key={asset.key}
            $isSelected={asset.key === item.selectedAssetKey}
            $isVisualizable={!!asset.visualizable}
            onClick={() =>
              asset.visualizable && handleAssetSelect(asset.key || "")
            }
          >
            <AssetTitle>{asset.title || asset.key}</AssetTitle>

            <AssetInfo>{getMediaTypeDescription(asset.mediaType)}</AssetInfo>

            {asset.url && (
              <AssetInfo>
                Size: {formatFileSize((asset as any)["file:size"])}
              </AssetInfo>
            )}

            {asset.roles && asset.roles.length > 0 && (
              <AssetRoles>
                {asset.roles.map((role: string) => (
                  <RoleTag key={role} $role={role}>
                    {role}
                  </RoleTag>
                ))}
              </AssetRoles>
            )}

            <VisualIndicator $isVisualizable={!!asset.visualizable}>
              <StyledIcon
                glyph={
                  asset.visualizable ? Icon.GLYPHS.selected : Icon.GLYPHS.close
                }
                styledWidth="12px"
              />
              <Spacing right={1} />
              {asset.visualizable ? "Visualizable" : "Not visualizable"}
            </VisualIndicator>
          </AssetCard>
        ))}
      </AssetGrid>

      {item.selectedAsset && (
        <Box paddedVertically>
          <Text textLight semiBold>
            {t("stacCatalogItem.selectedAsset")}:{" "}
            {item.selectedAsset.title || item.selectedAsset.key}
          </Text>

          {item.selectedAsset.url && (
            <Box paddedVertically={1}>
              <Button
                primary
                onClick={() => window.open(item.selectedAsset?.url, "_blank")}
              >
                <Icon glyph={Icon.GLYPHS.externalLink} />
                {t("stacCatalogItem.openAsset")}
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
});

export default StacAssetSelector;
