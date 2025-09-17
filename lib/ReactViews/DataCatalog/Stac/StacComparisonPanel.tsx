import React, { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import { action } from "mobx";
import styled from "styled-components";
import Box from "../../../Styled/Box";
import Button from "../../../Styled/Button";
import Icon, { StyledIcon } from "../../../Styled/Icon";
import Input from "../../../Styled/Input";
import Spacing from "../../../Styled/Spacing";
import Text from "../../../Styled/Text";
import Select from "../../../Styled/Select";
import Checkbox from "../../../Styled/Checkbox/Checkbox";
// Slider component replacement
const Slider = styled(Input).attrs({
  type: "range"
})`
  width: 100%;
  appearance: none;
  height: 4px;
  border-radius: 2px;
  background: ${(props) => props.theme.grey};
  outline: none;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: ${(props) => props.theme.colorPrimary};
    cursor: pointer;
  }

  &::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: ${(props) => props.theme.colorPrimary};
    cursor: pointer;
    border: none;
  }
`;
import {
  StacComparisonManager,
  ComparisonMethod
} from "../../../Models/Catalog/Stac/StacComparisonManager";
import StacCatalogItem from "../../../Models/Catalog/Stac/StacCatalogItem";

interface Props {
  comparisonManager: StacComparisonManager;
  availableItems: StacCatalogItem[];
  onClose?: () => void;
}

const ComparisonPanelContainer = styled.div`
  background: ${(props) =>
    props.theme.dark ? props.theme.dark : props.theme.greyLightest};
  border-radius: 6px;
  padding: 16px;
  margin: 8px 0;
  border: 1px solid ${(props) => props.theme.grey};
  max-height: 600px;
  overflow-y: auto;
`;

const ItemSelectorContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 12px;
  align-items: center;
  margin: 12px 0;
`;

const MethodSelector = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin: 12px 0;
`;

const MethodButton = styled(Button)<{ $isActive: boolean }>`
  background: ${(props) =>
    props.$isActive ? props.theme.colorPrimary : "transparent"};
  color: ${(props) =>
    props.$isActive ? props.theme.textLight : props.theme.textDark};
  border: 1px solid
    ${(props) =>
      props.$isActive ? props.theme.colorPrimary : props.theme.grey};
`;

const AnalysisSection = styled.div`
  background: ${(props) =>
    props.theme.dark ? props.theme.darkLighter : props.theme.greyLighter};
  border-radius: 4px;
  padding: 12px;
  margin: 8px 0;
`;

const MetricRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 4px 0;
`;

const ProgressBar = styled.div<{ $progress: number; $color?: string }>`
  width: 100%;
  height: 6px;
  background: ${(props) => props.theme.grey};
  border-radius: 3px;
  overflow: hidden;
  margin: 4px 0;

  &::after {
    content: "";
    display: block;
    width: ${(props) => props.$progress}%;
    height: 100%;
    background: ${(props) => props.$color || props.theme.colorPrimary};
    transition: width 0.3s ease;
  }
`;

const ChangeDetectionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
  margin: 8px 0;
`;

const ChangeResultCard = styled.div<{ $changeType: string }>`
  background: ${(props) =>
    props.theme.dark ? props.theme.darkLighter : props.theme.greyLighter};
  border-left: 4px solid
    ${(props) => getChangeTypeColor(props.$changeType, props.theme)};
  padding: 8px;
  border-radius: 4px;
`;

function getChangeTypeColor(changeType: string, theme: any): string {
  const colors: Record<string, string> = {
    increase: "#4CAF50",
    decrease: "#F44336",
    "no-change": theme.grey,
    new: "#2196F3",
    removed: "#FF9800"
  };
  return colors[changeType] || theme.grey;
}

const StacComparisonPanel: React.FC<Props> = observer(
  ({ comparisonManager, availableItems, onClose }) => {
    const { t } = useTranslation();

    const [selectedLeftItem, setSelectedLeftItem] =
      useState<StacCatalogItem | null>(null);
    const [selectedRightItem, setSelectedRightItem] =
      useState<StacCatalogItem | null>(null);
    const [selectedMethod, setSelectedMethod] =
      useState<ComparisonMethod>("side-by-side");
    const [showAdvanced, setShowAdvanced] = useState(false);

    const currentComparison = comparisonManager.currentComparison;
    const analysisResults = comparisonManager.analysisResults;
    const changeResults = comparisonManager.changeDetectionResults;

    useEffect(() => {
      if (currentComparison) {
        setSelectedLeftItem(currentComparison.leftItem);
        setSelectedRightItem(currentComparison.rightItem);
        setSelectedMethod(currentComparison.method);
      }
    }, [currentComparison]);

    const handleStartComparison = action(() => {
      if (selectedLeftItem && selectedRightItem) {
        comparisonManager.startComparison(
          selectedLeftItem,
          selectedRightItem,
          selectedMethod
        );
      }
    });

    const handleStopComparison = action(() => {
      comparisonManager.stopComparison();
    });

    const handleMethodChange = action((method: ComparisonMethod) => {
      setSelectedMethod(method);
      if (currentComparison) {
        comparisonManager.updateComparisonMethod(method);
      }
    });

    const handleOpacityChange = action(
      (side: "left" | "right", value: number) => {
        comparisonManager.updateOpacity(side, value / 100);
      }
    );

    const handleSwipePositionChange = action((value: number) => {
      comparisonManager.updateSwipePosition(value / 100);
    });

    const handleChangeDetection = action(async () => {
      if (currentComparison) {
        try {
          await comparisonManager.performChangeDetection("ndvi", 0.1);
        } catch (error) {
          console.error("Change detection failed:", error);
        }
      }
    });

    const renderItemSelector = () => (
      <Box paddedVertically={1}>
        <Text semiBold>{t("stacComparison.selectItems")}</Text>

        <ItemSelectorContainer>
          {/* Left Item Selector */}
          <div>
            <Text textLight small>
              {t("stacComparison.leftItem")}
            </Text>
            <Select
              value={selectedLeftItem?.uniqueId || ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const item = availableItems.find(
                  (i) => i.uniqueId === e.target.value
                );
                setSelectedLeftItem(item || null);
              }}
            >
              <option value="">{t("stacComparison.selectItem")}</option>
              {availableItems.map((item) => (
                <option key={item.uniqueId} value={item.uniqueId}>
                  {item.name || item.uniqueId}
                </option>
              ))}
            </Select>
          </div>

          {/* VS indicator */}
          <div style={{ textAlign: "center" }}>
            <Text large semiBold>
              VS
            </Text>
          </div>

          {/* Right Item Selector */}
          <div>
            <Text textLight small>
              {t("stacComparison.rightItem")}
            </Text>
            <Select
              value={selectedRightItem?.uniqueId || ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const item = availableItems.find(
                  (i) => i.uniqueId === e.target.value
                );
                setSelectedRightItem(item || null);
              }}
            >
              <option value="">{t("stacComparison.selectItem")}</option>
              {availableItems.map((item) => (
                <option key={item.uniqueId} value={item.uniqueId}>
                  {item.name || item.uniqueId}
                </option>
              ))}
            </Select>
          </div>
        </ItemSelectorContainer>
      </Box>
    );

    const renderMethodSelector = () => (
      <Box paddedVertically={1}>
        <Text semiBold>{t("stacComparison.comparisonMethod")}</Text>

        <MethodSelector>
          <MethodButton
            size="small"
            $isActive={selectedMethod === "side-by-side"}
            onClick={() => handleMethodChange("side-by-side")}
          >
            <StyledIcon
              glyph={Icon.GLYPHS.compareBothPanels}
              styledWidth="12px"
            />
            <Spacing right={1} />
            {t("stacComparison.sideBySide")}
          </MethodButton>

          <MethodButton
            size="small"
            $isActive={selectedMethod === "swipe"}
            onClick={() => handleMethodChange("swipe")}
          >
            <StyledIcon glyph={Icon.GLYPHS.splitter} styledWidth="12px" />
            <Spacing right={1} />
            {t("stacComparison.swipe")}
          </MethodButton>

          <MethodButton
            size="small"
            $isActive={selectedMethod === "difference"}
            onClick={() => handleMethodChange("difference")}
          >
            <StyledIcon glyph={Icon.GLYPHS.difference} styledWidth="12px" />
            <Spacing right={1} />
            {t("stacComparison.difference")}
          </MethodButton>

          <MethodButton
            size="small"
            $isActive={selectedMethod === "change-detection"}
            onClick={() => handleMethodChange("change-detection")}
          >
            <StyledIcon glyph={Icon.GLYPHS.barChart} styledWidth="12px" />
            <Spacing right={1} />
            {t("stacComparison.changeDetection")}
          </MethodButton>
        </MethodSelector>
      </Box>
    );

    const renderControls = () => {
      if (!currentComparison) return null;

      return (
        <Box paddedVertically={1}>
          <Text semiBold>{t("stacComparison.controls")}</Text>

          {/* Opacity Controls */}
          <Box paddedVertically={1}>
            <Text textLight small>
              {t("stacComparison.leftOpacity")}:{" "}
              {Math.round(currentComparison.opacity.left * 100)}%
            </Text>
            <Slider
              min={0}
              max={100}
              value={currentComparison.opacity.left * 100}
              onChange={(e) =>
                handleOpacityChange("left", parseFloat(e.target.value))
              }
            />
          </Box>

          <Box paddedVertically={1}>
            <Text textLight small>
              {t("stacComparison.rightOpacity")}:{" "}
              {Math.round(currentComparison.opacity.right * 100)}%
            </Text>
            <Slider
              min={0}
              max={100}
              value={currentComparison.opacity.right * 100}
              onChange={(e) =>
                handleOpacityChange("right", parseFloat(e.target.value))
              }
            />
          </Box>

          {/* Swipe Control */}
          {currentComparison.method === "swipe" && (
            <Box paddedVertically={1}>
              <Text textLight small>
                {t("stacComparison.swipePosition")}:{" "}
                {Math.round((currentComparison.swipePosition || 0.5) * 100)}%
              </Text>
              <Slider
                min={0}
                max={100}
                value={(currentComparison.swipePosition || 0.5) * 100}
                onChange={(e) =>
                  handleSwipePositionChange(parseFloat(e.target.value))
                }
              />
            </Box>
          )}

          {/* Synchronization Options */}
          <Box paddedVertically={1}>
            <Checkbox
              isChecked={currentComparison.synchronizeView}
              onChange={() => comparisonManager.toggleSynchronization("view")}
            >
              {t("stacComparison.synchronizeView")}
            </Checkbox>

            <Checkbox
              isChecked={currentComparison.synchronizeTime}
              onChange={() => comparisonManager.toggleSynchronization("time")}
            >
              {t("stacComparison.synchronizeTime")}
            </Checkbox>
          </Box>
        </Box>
      );
    };

    const renderAnalysisResults = () => {
      if (!analysisResults) return null;

      return (
        <AnalysisSection>
          <Text semiBold>{t("stacComparison.analysisResults")}</Text>

          {/* Spatial Overlap */}
          <Box paddedVertically={1}>
            <MetricRow>
              <Text textLight small>
                {t("stacComparison.spatialOverlap")}
              </Text>
              <Text semiBold small>
                {analysisResults.spatialOverlap.overlapPercentage.toFixed(1)}%
              </Text>
            </MetricRow>
            <ProgressBar
              $progress={analysisResults.spatialOverlap.overlapPercentage}
            />
          </Box>

          {/* Temporal Relation */}
          <Box paddedVertically={1}>
            <MetricRow>
              <Text textLight small>
                {t("stacComparison.temporalRelation")}
              </Text>
              <Text semiBold small>
                {analysisResults.temporalRelation.relation}
              </Text>
            </MetricRow>
            <Text mini textLight>
              {Math.abs(
                analysisResults.temporalRelation.timeDifference /
                  (1000 * 60 * 60 * 24)
              ).toFixed(1)}{" "}
              days apart
            </Text>
          </Box>

          {/* Asset Comparison */}
          <Box paddedVertically={1}>
            <MetricRow>
              <Text textLight small>
                {t("stacComparison.commonAssets")}
              </Text>
              <Text semiBold small>
                {analysisResults.assetComparison.commonAssets.length}
              </Text>
            </MetricRow>

            {analysisResults.assetComparison.commonAssets.length > 0 && (
              <Text mini textLight>
                {analysisResults.assetComparison.commonAssets.join(", ")}
              </Text>
            )}
          </Box>

          {/* Quality Metrics */}
          {(analysisResults.qualityMetrics.cloudCover.left !== null ||
            analysisResults.qualityMetrics.cloudCover.right !== null) && (
            <Box paddedVertically={1}>
              <Text textLight small>
                {t("stacComparison.qualityMetrics")}
              </Text>

              {analysisResults.qualityMetrics.cloudCover.left !== null && (
                <MetricRow>
                  <Text mini textLight>
                    Cloud Cover (Left)
                  </Text>
                  <Text mini semiBold>
                    {analysisResults.qualityMetrics.cloudCover.left}%
                  </Text>
                </MetricRow>
              )}

              {analysisResults.qualityMetrics.cloudCover.right !== null && (
                <MetricRow>
                  <Text mini textLight>
                    Cloud Cover (Right)
                  </Text>
                  <Text mini semiBold>
                    {analysisResults.qualityMetrics.cloudCover.right}%
                  </Text>
                </MetricRow>
              )}
            </Box>
          )}

          {/* Summary */}
          <Box paddedVertically={1}>
            <Text textLight small>
              {comparisonManager.getComparisonSummary()}
            </Text>

            {comparisonManager.getQualityRecommendation() && (
              <Text textLight small>
                💡 {comparisonManager.getQualityRecommendation()}
              </Text>
            )}
          </Box>
        </AnalysisSection>
      );
    };

    const renderChangeDetection = () => {
      if (!currentComparison) return null;

      return (
        <AnalysisSection>
          <Box paddedVertically={1}>
            <MetricRow>
              <Text semiBold>{t("stacComparison.changeDetection")}</Text>
              <Button
                size="small"
                onClick={handleChangeDetection}
                disabled={comparisonManager.isAnalyzing}
              >
                {comparisonManager.isAnalyzing ? (
                  <>
                    <StyledIcon glyph={Icon.GLYPHS.loader} styledWidth="12px" />
                    <Spacing right={1} />
                    {t("stacComparison.analyzing")}
                  </>
                ) : (
                  <>
                    <StyledIcon
                      glyph={Icon.GLYPHS.barChart}
                      styledWidth="12px"
                    />
                    <Spacing right={1} />
                    {t("stacComparison.runAnalysis")}
                  </>
                )}
              </Button>
            </MetricRow>
          </Box>

          {changeResults.length > 0 && (
            <Box paddedVertically={1}>
              <Text textLight small>
                {t("stacComparison.changesDetected", {
                  count: changeResults.length
                })}
              </Text>

              <ChangeDetectionGrid>
                {changeResults.slice(0, 6).map((result, index) => (
                  <ChangeResultCard key={index} $changeType={result.changeType}>
                    <Text mini semiBold>
                      {result.changeType}
                    </Text>
                    <Text mini textLight>
                      Magnitude: {result.magnitude.toFixed(3)}
                    </Text>
                    <Text mini textLight>
                      Confidence: {(result.confidence * 100).toFixed(1)}%
                    </Text>
                  </ChangeResultCard>
                ))}
              </ChangeDetectionGrid>

              {changeResults.length > 6 && (
                <Text mini textLight>
                  ... and {changeResults.length - 6} more changes
                </Text>
              )}
            </Box>
          )}
        </AnalysisSection>
      );
    };

    return (
      <ComparisonPanelContainer>
        <Box paddedVertically={1}>
          <Text large semiBold>
            <StyledIcon glyph={Icon.GLYPHS.compare} styledWidth="16px" />
            <Spacing right={2} />
            {t("stacComparison.title")}
          </Text>

          <Text textLight small>
            {t("stacComparison.description")}
          </Text>
        </Box>

        {!currentComparison ? (
          <>
            {renderItemSelector()}
            {renderMethodSelector()}

            <Box paddedVertically={1}>
              <Button
                fullWidth
                primary
                disabled={!selectedLeftItem || !selectedRightItem}
                onClick={handleStartComparison}
              >
                <StyledIcon glyph={Icon.GLYPHS.compare} styledWidth="14px" />
                <Spacing right={2} />
                {t("stacComparison.startComparison")}
              </Button>
            </Box>
          </>
        ) : (
          <>
            <Box paddedVertically={1}>
              <Text semiBold>
                {currentComparison.leftItem.name} vs{" "}
                {currentComparison.rightItem.name}
              </Text>
              <Text textLight small>
                Method: {currentComparison.method}
              </Text>
            </Box>

            {renderControls()}
            {renderAnalysisResults()}
            {renderChangeDetection()}

            <Box paddedVertically={1}>
              <Button fullWidth secondary onClick={handleStopComparison}>
                <StyledIcon glyph={Icon.GLYPHS.closeLight} styledWidth="14px" />
                <Spacing right={2} />
                {t("stacComparison.stopComparison")}
              </Button>
            </Box>

            {/* Export Report Button */}
            <Box paddedVertically={1}>
              <Button
                fullWidth
                onClick={() => {
                  const report = comparisonManager.exportComparisonReport();
                  const blob = new Blob([report], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "stac-comparison-report.md";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <StyledIcon glyph={Icon.GLYPHS.download} styledWidth="12px" />
                <Spacing right={1} />
                {t("stacComparison.exportReport")}
              </Button>
            </Box>
          </>
        )}

        {/* Advanced Options */}
        <Box paddedVertically={1}>
          <Button
            secondary
            size="small"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <StyledIcon
              glyph={
                showAdvanced ? Icon.GLYPHS.increase : Icon.GLYPHS.arrowDown
              }
              styledWidth="12px"
            />
            <Spacing right={1} />
            {t("stacComparison.advancedOptions")}
          </Button>

          {showAdvanced && (
            <Box paddedVertically={1}>
              <Text textLight small>
                {t("stacComparison.advancedDescription")}
              </Text>
              {/* Add advanced options here */}
            </Box>
          )}
        </Box>

        {onClose && (
          <Box paddedVertically={1}>
            <Button fullWidth secondary onClick={onClose}>
              {t("general.close")}
            </Button>
          </Box>
        )}
      </ComparisonPanelContainer>
    );
  }
);

export default StacComparisonPanel;
