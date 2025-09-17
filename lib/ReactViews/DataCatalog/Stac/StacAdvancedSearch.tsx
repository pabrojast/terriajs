import React, { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "react-i18next";
import { action } from "mobx";
import styled from "styled-components";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

import Box from "../../../Styled/Box";
import Button from "../../../Styled/Button";
import Icon from "../../../Styled/Icon";
import Input from "../../../Styled/Input";
import Select from "../../../Styled/Select";
import Spacing from "../../../Styled/Spacing";
import Text from "../../../Styled/Text";
import Checkbox from "../../../Styled/Checkbox";

import { StacSearchManager } from "../../../Models/Catalog/Stac/StacSearchManager";
import { StacQueryables, StacQueryable } from "../../../Models/Catalog/Stac/StacSearchManager";

interface Props {
  searchManager: StacSearchManager;
  onSearch: () => void;
  availableCollections?: string[];
}

const SearchContainer = styled.div`
  padding: 15px;
  background: ${props => props.theme.dark ? props.theme.dark : props.theme.greyLightest};
  border-radius: 4px;
  margin-bottom: 15px;
`;

const FilterSection = styled.div`
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid ${props => props.theme.grey};
  
  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  margin-top: 10px;
`;

const FilterRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 100px 1fr 40px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
`;

const DatePickerWrapper = styled.div`
  .react-datepicker-wrapper {
    width: 100%;
  }
  
  .react-datepicker__input-container input {
    width: 100%;
    padding: 8px;
    border: 1px solid ${props => props.theme.grey};
    border-radius: 4px;
    background: ${props => props.theme.dark ? props.theme.dark : "white"};
    color: ${props => props.theme.textLight};
  }
`;

const BboxInput = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 8px;
  
  input {
    padding: 6px;
    font-size: 12px;
  }
`;

const PresetButton = styled(Button)<{ $isActive: boolean }>`
  background: ${props => props.$isActive ? props.theme.colorPrimary : "transparent"};
  border: 1px solid ${props => props.theme.colorPrimary};
  color: ${props => props.$isActive ? "white" : props.theme.colorPrimary};
  padding: 6px 12px;
  font-size: 12px;
  
  &:hover {
    background: ${props => props.theme.colorPrimary};
    color: white;
  }
`;

const PRESET_FILTERS = {
  clearSky: { name: "Clear Sky", cloudCover: 10 },
  lowCloud: { name: "Low Cloud", cloudCover: 25 },
  mediumCloud: { name: "Medium Cloud", cloudCover: 50 },
  recent30Days: { name: "Last 30 Days", days: 30 },
  recent90Days: { name: "Last 90 Days", days: 90 },
  thisYear: { name: "This Year", year: new Date().getFullYear() }
};

const COMMON_REGIONS = {
  europe: { name: "Europe", bbox: [-10, 35, 30, 70] },
  northAmerica: { name: "North America", bbox: [-140, 25, -60, 70] },
  global: { name: "Global", bbox: [-180, -90, 180, 90] }
};

const StacAdvancedSearch: React.FC<Props> = observer(({ 
  searchManager, 
  onSearch, 
  availableCollections = [] 
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [bbox, setBbox] = useState<{ west: string; south: string; east: string; north: string }>({
    west: "", south: "", east: "", north: ""
  });
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [customFilters, setCustomFilters] = useState<Array<{
    property: string;
    operator: string;
    value: string;
    enabled: boolean;
  }>>([]);
  const [queryables, setQueryables] = useState<StacQueryables>({});

  useEffect(() => {
    // Load queryables for selected collections
    const loadQueryables = async () => {
      const allQueryables: StacQueryables = {};
      for (const collectionId of selectedCollections) {
        try {
          const colQueryables = await searchManager.loadQueryables(collectionId);
          Object.assign(allQueryables, colQueryables);
        } catch (_error) {
          console.warn(`Failed to load queryables for ${collectionId}`);
        }
      }
      setQueryables(allQueryables);
    };

    if (selectedCollections.length > 0) {
      loadQueryables();
    }
  }, [selectedCollections, searchManager]);

  const handlePresetFilter = action((preset: any) => {
    if (preset.cloudCover !== undefined) {
      addCustomFilter("eo:cloud_cover", "lt", preset.cloudCover.toString());
    }
    
    if (preset.days !== undefined) {
      const date = new Date();
      date.setDate(date.getDate() - preset.days);
      setStartDate(date);
    }
    
    if (preset.year !== undefined) {
      setStartDate(new Date(preset.year, 0, 1));
      setEndDate(new Date(preset.year, 11, 31));
    }
  });

  const handleRegionSelect = (region: any) => {
    setBbox({
      west: region.bbox[0].toString(),
      south: region.bbox[1].toString(),
      east: region.bbox[2].toString(),
      north: region.bbox[3].toString()
    });
  };

  const addCustomFilter = (property: string = "", operator: string = "eq", value: string = "") => {
    setCustomFilters(prev => [
      ...prev,
      { property, operator, value, enabled: true }
    ]);
  };

  const removeCustomFilter = (index: number) => {
    setCustomFilters(prev => prev.filter((_, i) => i !== index));
  };

  const updateCustomFilter = (index: number, field: string, value: any) => {
    setCustomFilters(prev => prev.map((filter, i) => 
      i === index ? { ...filter, [field]: value } : filter
    ));
  };

  const applyFilters = action(() => {
    // Clear existing filters
    searchManager.clearFilters();

    // Set collections
    if (selectedCollections.length > 0) {
      searchManager.setCollections(selectedCollections);
    }

    // Set temporal extent
    if (startDate || endDate) {
      searchManager.setTemporalExtent(
        startDate?.toISOString(),
        endDate?.toISOString()
      );
    }

    // Set spatial extent
    const west = parseFloat(bbox.west);
    const south = parseFloat(bbox.south);
    const east = parseFloat(bbox.east);
    const north = parseFloat(bbox.north);
    
    if (!isNaN(west) && !isNaN(south) && !isNaN(east) && !isNaN(north)) {
      searchManager.setSpatialExtent([west, south, east, north]);
    }

    // Apply custom filters
    customFilters.forEach(filter => {
      if (filter.enabled && filter.property && filter.value) {
        searchManager.addSearchFilter({
          property: filter.property,
          operator: filter.operator,
          values: [filter.value],
          enabled: true
        });
      }
    });

    onSearch();
  });

  const clearAllFilters = action(() => {
    searchManager.reset();
    setStartDate(null);
    setEndDate(null);
    setBbox({ west: "", south: "", east: "", north: "" });
    setSelectedCollections([]);
    setCustomFilters([]);
  });

  const _getOperatorOptions = (_queryable: StacQueryable) => {
    const operators = ["eq", "lt", "lte", "gt", "gte"];
    
    if (_queryable.enum) {
      operators.push("in");
    }
    
    if (_queryable.type === "string") {
      operators.push("like");
    }
    
    return operators;
  };

  return (
    <SearchContainer>
      <Box onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: "pointer" }}>
        <Text textLight semiBold>
          <Icon glyph={isExpanded ? Icon.GLYPHS.arrowDown : Icon.GLYPHS.right} />
          <Spacing right={1} />
          {t("stacCatalogItem.advancedSearch")}
        </Text>
      </Box>

      {isExpanded && (
        <Box paddedVertically>
          
          {/* Collections Filter */}
          {availableCollections.length > 0 && (
            <FilterSection>
              <Text textLight semiBold>
                {t("stacCatalogItem.collections")}
              </Text>
              <Box paddedVertically={1}>
                {availableCollections.map(collection => (
                  <Checkbox
                    key={collection}
                    isChecked={selectedCollections.includes(collection)}
                    onChange={(checked) => {
                      if (checked) {
                        setSelectedCollections(prev => [...prev, collection]);
                      } else {
                        setSelectedCollections(prev => prev.filter(c => c !== collection));
                      }
                    }}
                  >
                    {collection}
                  </Checkbox>
                ))}
              </Box>
            </FilterSection>
          )}

          {/* Temporal Filter */}
          <FilterSection>
            <Text textLight semiBold>
              {t("stacCatalogItem.temporalFilter")}
            </Text>
            <FilterGrid>
              <div>
                <Text textLight small>Start Date</Text>
                <DatePickerWrapper>
                  <DatePicker
                    selected={startDate}
                    onChange={setStartDate}
                    placeholderText="Start date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </DatePickerWrapper>
              </div>
              <div>
                <Text textLight small>End Date</Text>
                <DatePickerWrapper>
                  <DatePicker
                    selected={endDate}
                    onChange={setEndDate}
                    placeholderText="End date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </DatePickerWrapper>
              </div>
            </FilterGrid>
          </FilterSection>

          {/* Spatial Filter */}
          <FilterSection>
            <Text textLight semiBold>
              {t("stacCatalogItem.spatialFilter")}
            </Text>
            <Box paddedVertically={1}>
              <Text textLight small>Common Regions</Text>
              <FilterGrid>
                {Object.entries(COMMON_REGIONS).map(([key, region]) => (
                  <PresetButton
                    key={key}
                    $isActive={false}
                    onClick={() => handleRegionSelect(region)}
                  >
                    {region.name}
                  </PresetButton>
                ))}
              </FilterGrid>
            </Box>
            <Box paddedVertically={1}>
              <Text textLight small>Bounding Box (West, South, East, North)</Text>
              <BboxInput>
                <Input
                  placeholder="West"
                  value={bbox.west}
                  onChange={(e) => setBbox(prev => ({ ...prev, west: e.target.value }))}
                />
                <Input
                  placeholder="East"
                  value={bbox.east}
                  onChange={(e) => setBbox(prev => ({ ...prev, east: e.target.value }))}
                />
                <Input
                  placeholder="South"
                  value={bbox.south}
                  onChange={(e) => setBbox(prev => ({ ...prev, south: e.target.value }))}
                />
                <Input
                  placeholder="North"
                  value={bbox.north}
                  onChange={(e) => setBbox(prev => ({ ...prev, north: e.target.value }))}
                />
              </BboxInput>
            </Box>
          </FilterSection>

          {/* Preset Filters */}
          <FilterSection>
            <Text textLight semiBold>
              {t("stacCatalogItem.presetFilters")}
            </Text>
            <FilterGrid>
              {Object.entries(PRESET_FILTERS).map(([key, preset]) => (
                <PresetButton
                  key={key}
                  $isActive={false}
                  onClick={() => handlePresetFilter(preset)}
                >
                  {preset.name}
                </PresetButton>
              ))}
            </FilterGrid>
          </FilterSection>

          {/* Custom Filters */}
          <FilterSection>
            <Text textLight semiBold>
              {t("stacCatalogItem.customFilters")}
            </Text>
            
            {customFilters.map((filter, index) => (
              <FilterRow key={index}>
                <Select
                  value={filter.property}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateCustomFilter(index, "property", e.target.value)}
                >
                  <option value="">Select Property</option>
                  {Object.entries(queryables).map(([key, queryable]) => (
                    <option key={key} value={key}>
                      {queryable.title || key}
                    </option>
                  ))}
                  <option value="eo:cloud_cover">Cloud Cover</option>
                  <option value="instruments">Instruments</option>
                  <option value="platform">Platform</option>
                  <option value="gsd">Ground Sample Distance</option>
                </Select>
                
                <Select
                  value={filter.operator}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateCustomFilter(index, "operator", e.target.value)}
                >
                  <option value="eq">=</option>
                  <option value="lt">&lt;</option>
                  <option value="lte">≤</option>
                  <option value="gt">&gt;</option>
                  <option value="gte">≥</option>
                  <option value="in">in</option>
                  <option value="like">like</option>
                </Select>
                
                <Input
                  value={filter.value}
                  onChange={(e) => updateCustomFilter(index, "value", e.target.value)}
                  placeholder="Value"
                />
                
                <Button
                  onClick={() => removeCustomFilter(index)}
                  title="Remove filter"
                >
                  <Icon glyph={Icon.GLYPHS.remove} />
                </Button>
              </FilterRow>
            ))}
            
            <Button
              onClick={() => addCustomFilter()}
            >
              <Icon glyph={Icon.GLYPHS.add} />
              Add Filter
            </Button>
          </FilterSection>

          {/* Action Buttons */}
          <Box>
            <Button primary onClick={applyFilters}>
              <Icon glyph={Icon.GLYPHS.search} />
              Apply Filters
            </Button>
            <Spacing right={2} />
            <Button onClick={clearAllFilters}>
              <Icon glyph={Icon.GLYPHS.remove} />
              Clear All
            </Button>
          </Box>
        </Box>
      )}
    </SearchContainer>
  );
});

export default StacAdvancedSearch;