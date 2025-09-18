import { observer } from "mobx-react";
import PropTypes from "prop-types";
import { Component } from "react";
import { withTranslation } from "react-i18next";
import parseCustomMarkdownToReact from "../Custom/parseCustomMarkdownToReact";
import {
  addRemoveButtonClicked,
  allMappableMembersInWorkbench
} from "../DataCatalog/DisplayGroupHelper";
import measureElement from "../HOCs/measureElement";
import SharePanel from "../Map/Panels/SharePanel/SharePanel";
import DataPreviewSections from "./DataPreviewSections";
import DataPreviewUrl from "./DataPreviewUrl";
import Styles from "./mappable-preview.scss";
import WarningBox from "./WarningBox";
import StacCatalogGroup from "../../Models/Catalog/Stac/StacCatalogGroup";
import { StacSearchManager } from "../../Models/Catalog/Stac/StacSearchManager";
import StacAdvancedSearch from "../DataCatalog/Stac/StacAdvancedSearch";
import CommonStrata from "../../Models/Definition/CommonStrata";
import { action } from "mobx";

/**
 * A "preview" for CatalogGroup.
 */
@observer
class GroupPreview extends Component {
  static propTypes = {
    previewed: PropTypes.object.isRequired,
    terria: PropTypes.object.isRequired,
    viewState: PropTypes.object.isRequired,
    widthFromMeasureElementHOC: PropTypes.number,
    t: PropTypes.func.isRequired
  };

  backToMap() {
    this.props.viewState.explorerPanelIsVisible = false;
  }

  render() {
    const metadataItem =
      this.props.previewed.nowViewingCatalogItem || this.props.previewed;
    const { t } = this.props;
    const isStacGroup = this.props.previewed instanceof StacCatalogGroup;
    const stacManager = isStacGroup
      ? new StacSearchManager(
          this.props.previewed.url || "",
          this.props.previewed.authToken
        )
      : undefined;
    return (
      <div>
        <div
          className={Styles.titleAndShareWrapper}
          ref={(component) => (this.refToMeasure = component)}
        >
          <h3>{this.props.previewed.name}</h3>

          <div className={Styles.shareLinkWrapper}>
            {/* If this is a display group, show the "Add/Remove All" button next to the shareLink */}
            {this.props.previewed.displayGroup === true && (
              <button
                type="button"
                onClick={(event) => {
                  addRemoveButtonClicked(
                    this.props.previewed,
                    this.props.viewState,
                    this.props.terria,
                    event.shiftKey || event.ctrlKey
                  );
                }}
                className={Styles.btnAddAll}
              >
                {allMappableMembersInWorkbench(
                  this.props.previewed.members,
                  this.props.terria
                )
                  ? t("models.catalog.removeAll")
                  : t("models.catalog.addAll")}
              </button>
            )}
            <SharePanel
              catalogShare
              modalWidth={this.props.widthFromMeasureElementHOC}
              terria={this.props.terria}
              viewState={this.props.viewState}
            />
          </div>
        </div>
        {this.props.previewed.loadMetadataResult?.error && (
          <WarningBox
            error={this.props.previewed.loadMetadataResult?.error}
            viewState={this.props.viewState}
          />
        )}
        {this.props.previewed.loadMembersResult?.error && (
          <WarningBox
            error={this.props.previewed.loadMembersResult?.error}
            viewState={this.props.viewState}
          />
        )}
        <div className={Styles.previewedInfo}>
          <div className={Styles.url}>
            {isStacGroup && stacManager && (
              <div>
                <StacAdvancedSearch
                  searchManager={stacManager}
                  onSearch={action(() => {
                    const p = stacManager.searchParams;
                    const filters = stacManager.enabledFilters || [];
                    // Spatial extent
                    if (p.bbox && p.bbox.length === 4) {
                      this.props.previewed.setTrait(
                        CommonStrata.user,
                        "spatialExtent",
                        p.bbox
                      );
                    } else {
                      this.props.previewed.setTrait(
                        CommonStrata.user,
                        "spatialExtent",
                        undefined
                      );
                    }
                    // Temporal extent from formatted datetime string
                    if (p.datetime) {
                      const parts = p.datetime.split("/");
                      const start = parts[0] && parts[0] !== ".." ? parts[0] : undefined;
                      const end = parts[1] && parts[1] !== ".." ? parts[1] : undefined;
                      this.props.previewed.setTrait(
                        CommonStrata.user,
                        "temporalExtent",
                        start || end ? [start, end] : undefined
                      );
                    } else {
                      this.props.previewed.setTrait(
                        CommonStrata.user,
                        "temporalExtent",
                        undefined
                      );
                    }
                    // Collections
                    if (p.collections && p.collections.length) {
                      this.props.previewed.setTrait(
                        CommonStrata.user,
                        "collections",
                        p.collections.slice()
                      );
                    } else {
                      this.props.previewed.setTrait(
                        CommonStrata.user,
                        "collections",
                        undefined
                      );
                    }
                    // Search filters
                    this.props.previewed.setTrait(
                      CommonStrata.user,
                      "searchFilters",
                      filters.map((f) => ({
                        property: f.property,
                        operator: f.operator,
                        values: f.values.slice()
                      }))
                    );
                    // Trigger reload of members with new filters
                    this.props.previewed.loadMembers();
                  })}
                />
              </div>
            )}
            {this.props.previewed.description &&
              this.props.previewed.description.length > 0 && (
                <div>
                  <h4 className={Styles.h4}>{t("description.name")}</h4>
                  {parseCustomMarkdownToReact(
                    this.props.previewed.description,
                    { catalogItem: this.props.previewed }
                  )}
                </div>
              )}
            <DataPreviewSections metadataItem={metadataItem} />

            {metadataItem.dataCustodian && (
              <div>
                <h4 className={Styles.h4}>{t("preview.dataCustodian")}</h4>
                {parseCustomMarkdownToReact(metadataItem.dataCustodian, {
                  catalogItem: metadataItem
                })}
              </div>
            )}

            {metadataItem.url &&
              metadataItem.url.length &&
              !metadataItem.hideSource && (
                <DataPreviewUrl metadataItem={metadataItem} />
              )}
          </div>
        </div>
      </div>
    );
  }
}

export default withTranslation()(measureElement(GroupPreview));
