import { createElement, ReactElement } from "react";
import styled from "styled-components";
import { getName } from "../../ModelMixins/CatalogMemberMixin";
import { BaseModel } from "../../Models/Definition/Model";
import Text from "../../Styled/Text";
import Legend from "../Workbench/Controls/Legend";
import LegendStyles from "../Workbench/Controls/legend.scss";
import CustomComponent, {
  DomElement,
  ProcessNodeContext
} from "./CustomComponent";

const StoryLegendWrapper = styled.div`
  margin: 6px 0;

  & .${LegendStyles.legend} {
    font-family: ${(props) => props.theme.fontBase};
    font-size: 12px;
  }

  & .${LegendStyles.legendTitle}, & .${LegendStyles.legendTitles} {
    font-size: 12px;
    line-height: 16px;
  }
`;

export default class LegendCustomComponent extends CustomComponent {
  get name(): string {
    return "terria-legend";
  }

  get attributes(): string[] {
    return ["data-id", "data-title"];
  }

  processNode(
    context: ProcessNodeContext,
    node: DomElement,
    _children: ReactElement[],
    index: number
  ): ReactElement | undefined {
    const itemId = node.attribs?.["data-id"];
    const terria = context.terria;
    if (!terria || !itemId) return undefined;

    const item = terria.getModelById(BaseModel, itemId);
    if (!item) return undefined;

    const title = node.attribs?.["data-title"] || getName(item);

    return createElement(
      StoryLegendWrapper,
      { key: `story-legend-${itemId}-${index}` },
      title
        ? createElement(
            Text,
            { medium: true, css: { marginBottom: "4px" } },
            title
          )
        : null,
      createElement(Legend, { item })
    );
  }
}
