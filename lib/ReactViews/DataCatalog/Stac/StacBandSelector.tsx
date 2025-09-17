import React, { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import { action } from "mobx";
import styled from "styled-components";
import Box from "../../../Styled/Box";
import Button from "../../../Styled/Button";
import Icon from "../../../Styled/Icon";
import Select from "../../../Styled/Select";
import Spacing from "../../../Styled/Spacing";
import Text from "../../../Styled/Text";
import StacCatalogItem from "../../../Models/Catalog/Stac/StacCatalogItem";
import { StacExtensionParser } from "../../../Models/Catalog/Stac/StacExtensions";

interface Props {
  item: StacCatalogItem;
}

const BandGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  margin-top: 10px;
`;

const BandCard = styled.div`
  border: 1px solid ${(props) => props.theme.grey};
  border-radius: 4px;
  padding: 8px;
  background: ${(props) =>
    props.theme.dark ? props.theme.dark : props.theme.greyLightest};
`;

const BandName = styled(Text).attrs({
  textLight: true,
  semiBold: true
})`
  margin-bottom: 4px;
`;

const BandInfo = styled(Text).attrs({
  textLight: true,
  small: true
})`
  color: ${(props) => props.theme.textLight};
  margin-bottom: 2px;
`;

const CompositeSection = styled.div`
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid ${(props) => props.theme.grey};
`;

const CompositeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 10px;
  margin-top: 10px;
`;

const CompositeCard = styled.div`
  border: 1px solid ${(props) => props.theme.colorPrimary};
  border-radius: 4px;
  padding: 10px;
  background: ${(props) => props.theme.colorPrimary}10;
  cursor: pointer;

  &:hover {
    background: ${(props) => props.theme.colorPrimary}20;
  }
`;

const BandSelectionRow = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
`;

const ColorBox = styled.div<{ $color: string }>`
  width: 20px;
  height: 20px;
  background: ${(props) => props.$color};
  border: 1px solid ${(props) => props.theme.grey};
  border-radius: 2px;
`;

function formatWavelength(wavelength?: number): string {
  if (!wavelength) return "";
  return wavelength < 1
    ? `${(wavelength * 1000).toFixed(0)}nm`
    : `${wavelength.toFixed(2)}μm`;
}

function getBandColor(commonName?: string): string {
  const colors: Record<string, string> = {
    coastal: "#00FFFF",
    blue: "#0000FF",
    green: "#00FF00",
    yellow: "#FFFF00",
    red: "#FF0000",
    rededge: "#FF4500",
    nir: "#800000",
    nir08: "#A52A2A",
    nir09: "#B22222",
    swir16: "#8B4513",
    swir22: "#D2691E",
    lwir: "#FF1493",
    lwir11: "#FF69B4",
    lwir12: "#FFB6C1",
    pan: "#808080",
    cirrus: "#87CEEB"
  };

  return colors[commonName || ""] || "#999999";
}

const StacBandSelector: React.FC<Props> = observer(({ item }) => {
  const { t } = useTranslation();
  const [_selectedComposite, setSelectedComposite] = useState<string | null>(
    null
  );
  const [customBands, setCustomBands] = useState<{
    red?: string;
    green?: string;
    blue?: string;
  }>({});

  if (!item.bands || item.bands.length === 0) {
    return (
      <Box paddedVertically>
        <Text textLight>{t("stacCatalogItem.noBands")}</Text>
      </Box>
    );
  }

  // Get band information with extension parsing
  let bandInfo: any[] = [];
  try {
    // Try to get bands from STAC item properties
    const stacItem = (item as any).stacItem; // Access underlying STAC item
    if (stacItem?.properties) {
      bandInfo = StacExtensionParser.getBandInfo(stacItem.properties);
    }
  } catch (_error) {
    console.debug("Could not parse band information from STAC extensions");
  }

  // Fallback to trait bands if no extension data
  if (bandInfo.length === 0) {
    bandInfo = item.bands.map((band) => ({
      name: band.name,
      common_name: band.commonName,
      center_wavelength: band.centerWavelength,
      full_width_half_max: band.fullWidthHalfMax,
      displayName: band.commonName
        ? `${band.name} (${band.commonName})`
        : band.name
    }));
  }

  // Get suggested band combinations
  let suggestedCombinations: Array<{
    name: string;
    bands: string[];
    description: string;
  }> = [];
  try {
    const stacItem = (item as any).stacItem;
    if (stacItem?.properties) {
      suggestedCombinations = StacExtensionParser.getSuggestedBandCombinations(
        stacItem.properties
      );
    }
  } catch (_error) {
    console.debug("Could not generate band combinations");
  }

  const handleCompositeSelect = action((composite: any) => {
    setSelectedComposite(composite.name);
    // Here you would implement the logic to apply the band combination
    // This would typically involve updating the visualization settings
    console.log("Selected composite:", composite);
  });

  const handleCustomBandChange = action((channel: string, bandName: string) => {
    setCustomBands((prev) => ({ ...prev, [channel]: bandName }));
  });

  const applyCustomComposite = action(() => {
    if (customBands.red && customBands.green && customBands.blue) {
      console.log("Applying custom composite:", customBands);
      // Implement custom band combination logic
    }
  });

  return (
    <Box>
      <Text textLight semiBold>
        {t("stacCatalogItem.spectralBands")} ({bandInfo.length})
      </Text>

      <BandGrid>
        {bandInfo.map((band: any, index: number) => (
          <BandCard key={band.name || index}>
            <BandName>
              <ColorBox $color={getBandColor(band.common_name)} />
              <Spacing right={1} />
              {band.displayName || band.name}
            </BandName>

            {band.common_name && (
              <BandInfo>Common Name: {band.common_name}</BandInfo>
            )}

            {band.center_wavelength && (
              <BandInfo>
                Wavelength: {formatWavelength(band.center_wavelength)}
              </BandInfo>
            )}

            {band.full_width_half_max && (
              <BandInfo>
                FWHM: {formatWavelength(band.full_width_half_max)}
              </BandInfo>
            )}
          </BandCard>
        ))}
      </BandGrid>

      {suggestedCombinations.length > 0 && (
        <CompositeSection>
          <Text textLight semiBold>
            {t("stacCatalogItem.suggestedComposites")}
          </Text>

          <CompositeGrid>
            {suggestedCombinations.map((composite, index) => (
              <CompositeCard
                key={index}
                onClick={() => handleCompositeSelect(composite)}
              >
                <Text textLight semiBold>
                  {composite.name}
                </Text>
                <Spacing bottom={1} />
                <Text textLight small>
                  Bands: {composite.bands.join(", ")}
                </Text>
                <Spacing bottom={1} />
                <Text textLight small>
                  {composite.description}
                </Text>
              </CompositeCard>
            ))}
          </CompositeGrid>
        </CompositeSection>
      )}

      <CompositeSection>
        <Text textLight semiBold>
          {t("stacCatalogItem.customComposite")}
        </Text>

        <Box paddedVertically>
          <BandSelectionRow>
            <ColorBox $color="#FF0000" />
            <Select
              value={customBands.red || ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                handleCustomBandChange("red", e.target.value)
              }
            >
              <option value="">{t("stacCatalogItem.selectBand")}</option>
              {bandInfo.map((band) => (
                <option key={band.name} value={band.name}>
                  {band.displayName || band.name}
                </option>
              ))}
            </Select>
          </BandSelectionRow>

          <BandSelectionRow>
            <ColorBox $color="#00FF00" />
            <Select
              value={customBands.green || ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                handleCustomBandChange("green", e.target.value)
              }
            >
              <option value="">{t("stacCatalogItem.selectBand")}</option>
              {bandInfo.map((band) => (
                <option key={band.name} value={band.name}>
                  {band.displayName || band.name}
                </option>
              ))}
            </Select>
          </BandSelectionRow>

          <BandSelectionRow>
            <ColorBox $color="#0000FF" />
            <Select
              value={customBands.blue || ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                handleCustomBandChange("blue", e.target.value)
              }
            >
              <option value="">{t("stacCatalogItem.selectBand")}</option>
              {bandInfo.map((band) => (
                <option key={band.name} value={band.name}>
                  {band.displayName || band.name}
                </option>
              ))}
            </Select>
          </BandSelectionRow>

          <Button
            primary
            disabled={
              !customBands.red || !customBands.green || !customBands.blue
            }
            onClick={applyCustomComposite}
          >
            <Icon glyph={Icon.GLYPHS.gallery} />
            {t("stacCatalogItem.applyComposite")}
          </Button>
        </Box>
      </CompositeSection>
    </Box>
  );
});

export default StacBandSelector;
