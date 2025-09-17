import React from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import { action } from "mobx";
import styled from "styled-components";
import Box from "../../../Styled/Box";
import Button from "../../../Styled/Button";
import Icon, { StyledIcon, IconGlyph } from "../../../Styled/Icon";
import Spacing from "../../../Styled/Spacing";
import Text from "../../../Styled/Text";
import {
  StacLinkManager,
  StacResource
} from "../../../Models/Catalog/Stac/StacLinkManager";

interface Props {
  linkManager: StacLinkManager;
  onNavigate?: (resource: StacResource) => void;
  maxItems?: number;
}

const BreadcrumbContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: ${(props) =>
    props.theme.dark ? props.theme.dark : props.theme.greyLightest};
  border-radius: 4px;
  margin-bottom: 10px;
  overflow-x: auto;
  white-space: nowrap;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${(props) => props.theme.grey};
    border-radius: 2px;
  }
`;

const BreadcrumbItem = styled.button<{
  $isActive: boolean;
  $isClickable: boolean;
}>`
  background: none;
  border: none;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: ${(props) => (props.$isClickable ? "pointer" : "default")};
  color: ${(props) =>
    props.$isActive ? props.theme.colorPrimary : props.theme.textLight};
  font-weight: ${(props) => (props.$isActive ? "600" : "400")};
  font-size: 13px;
  transition: background 0.2s ease;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    background: ${(props) =>
      props.$isClickable ? props.theme.grey + "30" : "transparent"};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Separator = styled.div`
  color: ${(props) => props.theme.textLight};
  margin: 0 4px;
  opacity: 0.6;
`;

const NavigationControls = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
  padding-right: 8px;
  border-right: 1px solid ${(props) => props.theme.grey};
`;

const OverflowIndicator = styled.div`
  color: ${(props) => props.theme.textLight};
  font-size: 13px;
  opacity: 0.7;
  margin-right: 8px;
  cursor: default;
`;

const ResourceTypeIcon = styled.div<{ $resourceType: string }>`
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
  color: ${(props) => getResourceTypeColor(props.$resourceType, props.theme)};
`;

function getResourceTypeColor(resourceType: string, theme: any): string {
  const colors: Record<string, string> = {
    Catalog: theme.colorPrimary,
    Collection: "#2196F3",
    Feature: "#4CAF50"
  };
  return colors[resourceType] || theme.textLight;
}

function getResourceTypeIcon(resourceType: string): IconGlyph {
  const icons: Record<string, IconGlyph> = {
    Catalog: Icon.GLYPHS.folder,
    Collection: Icon.GLYPHS.globe,
    Feature: Icon.GLYPHS.location
  };
  return icons[resourceType] || Icon.GLYPHS.circleEmpty;
}

function truncateTitle(title: string, maxLength: number = 25): string {
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 3) + "...";
}

const StacBreadcrumbNavigation: React.FC<Props> = observer(
  ({ linkManager, onNavigate, maxItems = 5 }) => {
    const { t } = useTranslation();

    const breadcrumbPath = linkManager.breadcrumbPath;
    const currentResource = linkManager.currentResource;

    if (!currentResource || breadcrumbPath.length === 0) {
      return null;
    }

    const handleNavigate = action(async (resource: StacResource) => {
      try {
        await linkManager.navigateToResource(resource.url);
        onNavigate?.(resource);
      } catch (error) {
        console.error("Navigation failed:", error);
      }
    });

    const handleBack = action(() => {
      const previousResource = linkManager.goBack();
      if (previousResource) {
        onNavigate?.(previousResource);
      }
    });

    const handleForward = action(() => {
      const nextResource = linkManager.goForward();
      if (nextResource) {
        onNavigate?.(nextResource);
      }
    });

    const handleGoToParent = action(async () => {
      try {
        const parentResource = await linkManager.navigateToParent();
        if (parentResource) {
          onNavigate?.(parentResource);
        }
      } catch (error) {
        console.error("Failed to navigate to parent:", error);
      }
    });

    const handleGoToRoot = action(async () => {
      try {
        const rootResource = await linkManager.navigateToRoot();
        if (rootResource) {
          onNavigate?.(rootResource);
        }
      } catch (error) {
        console.error("Failed to navigate to root:", error);
      }
    });

    // Determine which items to show based on maxItems
    let visiblePath = breadcrumbPath;
    let hasOverflow = false;

    if (breadcrumbPath.length > maxItems) {
      hasOverflow = true;
      // Show first item, ellipsis, and last (maxItems - 2) items
      const firstItem = breadcrumbPath[0];
      const lastItems = breadcrumbPath.slice(-(maxItems - 2));
      visiblePath = [firstItem, ...lastItems];
    }

    return (
      <BreadcrumbContainer>
        {/* Navigation Controls */}
        <NavigationControls>
          <Button
            size="small"
            disabled={!linkManager.canGoBack || linkManager.isNavigating}
            onClick={handleBack}
            title={t("stacNavigation.goBack")}
          >
            <StyledIcon glyph={Icon.GLYPHS.left} styledWidth="12px" />
          </Button>

          <Button
            size="small"
            disabled={!linkManager.canGoForward || linkManager.isNavigating}
            onClick={handleForward}
            title={t("stacNavigation.goForward")}
          >
            <StyledIcon glyph={Icon.GLYPHS.right} styledWidth="12px" />
          </Button>

          <Button
            size="small"
            disabled={linkManager.isNavigating}
            onClick={handleGoToRoot}
            title={t("stacNavigation.goToRoot")}
          >
            <StyledIcon glyph={Icon.GLYPHS.folder} styledWidth="12px" />
          </Button>

          {currentResource &&
            linkManager.getLinkByRelation(currentResource, "parent") && (
              <Button
                size="small"
                disabled={linkManager.isNavigating}
                onClick={handleGoToParent}
                title={t("stacNavigation.goToParent")}
              >
                <StyledIcon glyph={Icon.GLYPHS.increase} styledWidth="12px" />
              </Button>
            )}
        </NavigationControls>

        {/* Breadcrumb Path */}
        {hasOverflow && visiblePath.length > 1 && (
          <>
            {/* First item */}
            <BreadcrumbItem
              $isActive={false}
              $isClickable
              onClick={() => handleNavigate(visiblePath[0])}
              title={visiblePath[0].title || visiblePath[0].id}
            >
              <ResourceTypeIcon $resourceType={visiblePath[0].type}>
                <StyledIcon
                  glyph={getResourceTypeIcon(visiblePath[0].type)}
                  styledWidth="12px"
                />
              </ResourceTypeIcon>
              {truncateTitle(visiblePath[0].title || visiblePath[0].id)}
            </BreadcrumbItem>

            <Separator>/</Separator>
            <OverflowIndicator>...</OverflowIndicator>
            <Separator>/</Separator>
          </>
        )}

        {/* Visible breadcrumb items */}
        {visiblePath.map((resource, index) => {
          // Skip first item if we showed it in overflow section
          if (hasOverflow && index === 0) return null;

          const isLast = index === breadcrumbPath.length - 1;
          const isClickable = !isLast && !linkManager.isNavigating;

          return (
            <React.Fragment key={`${resource.url}-${index}`}>
              <BreadcrumbItem
                $isActive={isLast}
                $isClickable={isClickable}
                onClick={
                  isClickable ? () => handleNavigate(resource) : undefined
                }
                disabled={linkManager.isNavigating}
                title={resource.title || resource.id}
              >
                <ResourceTypeIcon $resourceType={resource.type}>
                  <StyledIcon
                    glyph={getResourceTypeIcon(resource.type)}
                    styledWidth="12px"
                  />
                </ResourceTypeIcon>
                {truncateTitle(resource.title || resource.id)}
              </BreadcrumbItem>

              {!isLast && <Separator>/</Separator>}
            </React.Fragment>
          );
        })}

        {/* Loading indicator */}
        {linkManager.isNavigating && (
          <>
            <Spacing right={2} />
            <StyledIcon
              glyph={Icon.GLYPHS.loader}
              styledWidth="14px"
              css="animation: spin 1s linear infinite;"
            />
          </>
        )}
      </BreadcrumbContainer>
    );
  }
);

// Companion component for STAC resource information
export const StacResourceInfo: React.FC<{ resource: StacResource }> = observer(
  ({ resource }) => {
    const { t } = useTranslation();

    return (
      <Box paddedVertically={1}>
        <Text textLight semiBold>
          <ResourceTypeIcon $resourceType={resource.type}>
            <StyledIcon
              glyph={getResourceTypeIcon(resource.type)}
              styledWidth="16px"
            />
          </ResourceTypeIcon>
          <Spacing right={1} />
          {resource.title || resource.id}
        </Text>

        {resource.description && (
          <Box paddedVertically={1}>
            <Text textLight small>
              {resource.description}
            </Text>
          </Box>
        )}

        <Box paddedVertically={1}>
          <Text textLight small>
            <strong>{t("stacNavigation.resourceType")}:</strong> {resource.type}
          </Text>
          <Text textLight small>
            <strong>{t("stacNavigation.resourceId")}:</strong> {resource.id}
          </Text>
          {resource.links.length > 0 && (
            <Text textLight small>
              <strong>{t("stacNavigation.availableLinks")}:</strong>{" "}
              {resource.links.length}
            </Text>
          )}
        </Box>
      </Box>
    );
  }
);

// Quick actions component
export const StacQuickActions: React.FC<{
  linkManager: StacLinkManager;
  onNavigate?: (resource: StacResource) => void;
}> = observer(({ linkManager, onNavigate }) => {
  const { t } = useTranslation();
  const currentResource = linkManager.currentResource;

  if (!currentResource) return null;

  const childLinks = linkManager.getChildResources(currentResource);
  const serviceLinks = linkManager.getServiceLinks(currentResource);
  const dataLinks = linkManager.getDataLinks(currentResource);

  const handleLinkClick = action(async (link: any) => {
    try {
      const resource = await linkManager.followLink(link);
      onNavigate?.(resource);
    } catch (error) {
      // For external links, open in new window
      if (linkManager.isExternalRelation(link.rel)) {
        window.open(link.href, "_blank");
      } else {
        console.error("Failed to follow link:", error);
      }
    }
  });

  return (
    <Box>
      {childLinks.length > 0 && (
        <Box paddedVertically={1}>
          <Text textLight semiBold small>
            {t("stacNavigation.childResources")} ({childLinks.length})
          </Text>
          <Box paddedVertically={1}>
            {childLinks.slice(0, 5).map((link, index) => (
              <Button
                key={index}
                size="small"
                onClick={() => handleLinkClick(link)}
                style={{ marginRight: "8px", marginBottom: "4px" }}
              >
                <StyledIcon glyph={Icon.GLYPHS.right} styledWidth="12px" />
                <Spacing right={1} />
                {link.title ||
                  `${linkManager.getRelationDisplayName(link.rel)}`}
              </Button>
            ))}
            {childLinks.length > 5 && (
              <Text textLight small>
                ... and {childLinks.length - 5} more
              </Text>
            )}
          </Box>
        </Box>
      )}

      {serviceLinks.length > 0 && (
        <Box paddedVertically={1}>
          <Text textLight semiBold small>
            {t("stacNavigation.serviceLinks")}
          </Text>
          <Box paddedVertically={1}>
            {serviceLinks.map((link, index) => (
              <Button
                key={index}
                size="small"
                onClick={() => handleLinkClick(link)}
                style={{ marginRight: "8px", marginBottom: "4px" }}
              >
                <StyledIcon
                  glyph={Icon.GLYPHS.externalLink}
                  styledWidth="12px"
                />
                <Spacing right={1} />
                {link.title || linkManager.getRelationDisplayName(link.rel)}
              </Button>
            ))}
          </Box>
        </Box>
      )}

      {dataLinks.length > 0 && (
        <Box paddedVertically={1}>
          <Text textLight semiBold small>
            {t("stacNavigation.dataLinks")}
          </Text>
          <Box paddedVertically={1}>
            {dataLinks.map((link, index) => (
              <Button
                key={index}
                size="small"
                onClick={() => handleLinkClick(link)}
                style={{ marginRight: "8px", marginBottom: "4px" }}
              >
                <StyledIcon glyph={Icon.GLYPHS.download} styledWidth="12px" />
                <Spacing right={1} />
                {link.title || linkManager.getRelationDisplayName(link.rel)}
              </Button>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
});

export default StacBreadcrumbNavigation;
