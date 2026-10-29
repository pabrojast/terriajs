import { observer } from "mobx-react";
import { Component, Fragment } from "react";
import { WithTranslation, withTranslation } from "react-i18next";
import styled from "styled-components";
import isDefined from "../../../Core/isDefined";
import { BaseModel } from "../../../Models/Definition/Model";
import SelectableDimensions, {
  filterSelectableDimensions,
  Placement
} from "../../../Models/SelectableDimensions/SelectableDimensions";
import Box from "../../../Styled/Box";
import SelectableDimension from "../../SelectableDimensions/SelectableDimension";
import CogTimeSeriesCatalogItem from "../../../Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem";
import cogStatisticHelp from "./cogStatisticHelp";

interface PropsType extends WithTranslation {
  item: BaseModel;
  /** Placement used to filter selectableDimensions.placement (eg 'belowLegend) */
  placement: Placement;
}

@observer
class SelectableDimensionSection extends Component<PropsType> {
  render() {
    const item = this.props.item;
    if (!SelectableDimensions.is(item)) {
      return null;
    }

    const selectableDimensions = filterSelectableDimensions(
      this.props.placement
    )(item.selectableDimensions);

    if (!isDefined(selectableDimensions) || selectableDimensions.length === 0) {
      return null;
    }

    return (
      <Box displayInlineBlock fullWidth>
        {selectableDimensions.map((dim) => {
          const control = (
            <SelectableDimension
              id={`${item.uniqueId}-${dim.id}`}
              dim={
                item instanceof CogTimeSeriesCatalogItem
                  ? cogStatisticHelp(dim, item)
                  : dim
              }
            />
          );
          return item instanceof CogTimeSeriesCatalogItem &&
            dim.id === "cog-series-band" ? (
            <MapOptions key={dim.id}>
              <summary>
                {this.props.t("models.cogTimeSeries.advancedMapOptions")}
              </summary>
              {control}
            </MapOptions>
          ) : (
            <Fragment key={dim.id}>{control}</Fragment>
          );
        })}
      </Box>
    );
  }
}

export default withTranslation()(SelectableDimensionSection);

const MapOptions = styled.details`
  margin-bottom: 8px;
  color: ${(p) => p.theme.textLight};
  summary {
    cursor: pointer;
    padding: 10px 0;
    font-size: 13px;
  }
  summary:focus-visible {
    outline: 2px solid ${(p) => p.theme.colorPrimary};
    outline-offset: 2px;
  }
`;
