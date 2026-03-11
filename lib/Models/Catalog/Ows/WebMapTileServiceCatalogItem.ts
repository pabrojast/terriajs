import i18next from "i18next";
import { computed, makeObservable, override, runInAction } from "mobx";
import defined from "terriajs-cesium/Source/Core/defined";
import GeographicTilingScheme from "terriajs-cesium/Source/Core/GeographicTilingScheme";
import WebMercatorTilingScheme from "terriajs-cesium/Source/Core/WebMercatorTilingScheme";
import GeographicTilingScheme from "terriajs-cesium/Source/Core/GeographicTilingScheme";
import Rectangle from "terriajs-cesium/Source/Core/Rectangle";
import Ellipsoid from "terriajs-cesium/Source/Core/Ellipsoid";
import GeographicProjection from "terriajs-cesium/Source/Core/GeographicProjection";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import Cartesian3 from "terriajs-cesium/Source/Core/Cartesian3";
import Resource from "terriajs-cesium/Source/Core/Resource";
import ImageryLayerFeatureInfo from "terriajs-cesium/Source/Scene/ImageryLayerFeatureInfo";
import GetFeatureInfoFormat from "terriajs-cesium/Source/Scene/GetFeatureInfoFormat";
import UrlTemplateImageryProvider from "terriajs-cesium/Source/Scene/UrlTemplateImageryProvider";
import WebMapTileServiceImageryProvider from "terriajs-cesium/Source/Scene/WebMapTileServiceImageryProvider";
import URI from "urijs";
import containsAny from "../../../Core/containsAny";
import createDiscreteTimesFromIsoSegments from "../../../Core/createDiscreteTimes";
import createTransformerAllowUndefined from "../../../Core/createTransformerAllowUndefined";
import filterOutUndefined from "../../../Core/filterOutUndefined";
import isDefined from "../../../Core/isDefined";
import isReadOnlyArray from "../../../Core/isReadOnlyArray";
import TerriaError from "../../../Core/TerriaError";
import CatalogMemberMixin from "../../../ModelMixins/CatalogMemberMixin";
import DiscretelyTimeVaryingMixin from "../../../ModelMixins/DiscretelyTimeVaryingMixin";
import GetCapabilitiesMixin from "../../../ModelMixins/GetCapabilitiesMixin";
import MappableMixin, {
  ImageryParts,
  MapItem
} from "../../../ModelMixins/MappableMixin";
import UrlMixin from "../../../ModelMixins/UrlMixin";
import { InfoSectionTraits } from "../../../Traits/TraitsClasses/CatalogMemberTraits";
import LegendTraits from "../../../Traits/TraitsClasses/LegendTraits";
import { RectangleTraits } from "../../../Traits/TraitsClasses/MappableTraits";
import WebMapTileServiceCatalogItemTraits, {
  FeatureInfoRequestTraits,
  WebMapTileServiceAvailableDimensionTraits,
  WebMapTileServiceAvailableLayerDimensionsTraits,
  WebMapTileServiceAvailableLayerStylesTraits
} from "../../../Traits/TraitsClasses/WebMapTileServiceCatalogItemTraits";
import CreateModel from "../../Definition/CreateModel";
import createStratumInstance from "../../Definition/createStratumInstance";
import LoadableStratum from "../../Definition/LoadableStratum";
import { BaseModel } from "../../Definition/Model";
import StratumFromTraits from "../../Definition/StratumFromTraits";
import { SelectableDimensionEnum } from "../../SelectableDimensions/SelectableDimensions";
import { ServiceProvider } from "./OwsInterfaces";
import proxyCatalogItemUrl from "../proxyCatalogItemUrl";
import { ModelConstructorParameters } from "../../Definition/Model";
import WebMapTileServiceCapabilities, {
  CapabilitiesStyle,
  ResourceUrl,
  TileMatrixSetLink,
  WmtsCapabilitiesLegend,
  WmtsLayer
} from "./WebMapTileServiceCapabilities";
import TerriaFeature from "../../Feature/Feature";
import {
  TimeSeriesFeatureInfoContext,
  jsonFeatureInfoContext
} from "../../../Table/tableFeatureInfoContext";

type ExtendedImageryProvider = (
  | WebMapTileServiceImageryProvider
  | UrlTemplateImageryProvider
) & {
  enablePickFeatures?: boolean;
  pickFeatures?: (
    x: number,
    y: number,
    level: number,
    longitude: number,
    latitude: number
  ) => Promise<ImageryLayerFeatureInfo[] | undefined> | undefined;
};

export const SUPPORTED_CRS_3857 = [/EPSG.*3857/, /EPSG.*900913/];
export const SUPPORTED_CRS_4326 = [/EPSG.*4326/, /CRS.*84/, /EPSG.*4283/];

interface UsableTileMatrixSets {
  identifiers: string[];
  tileWidth: number;
  tileHeight: number;
  projection: "EPSG:3857" | "EPSG:4326";
}

interface DimensionSummary {
  name?: string;
  values: string[];
  units?: string;
  unitSymbol?: string;
  default?: string;
  multipleValues?: boolean;
  nearestValue?: boolean;
}

type FeatureInfoFormatType = "json" | "xml" | "html" | "text";

type TemplateTokens = Record<string, string>;

class GetCapabilitiesStratum extends LoadableStratum(
  WebMapTileServiceCatalogItemTraits
) {
  static stratumName = "wmtsServer";

  static async load(
    catalogItem: WebMapTileServiceCatalogItem,
    capabilities?: WebMapTileServiceCapabilities
  ): Promise<GetCapabilitiesStratum> {
    if (!isDefined(catalogItem.getCapabilitiesUrl)) {
      throw new TerriaError({
        title: i18next.t("models.webMapTileServiceCatalogItem.missingUrlTitle"),
        message: i18next.t(
          "models.webMapTileServiceCatalogItem.missingUrlMessage"
        )
      });
    }

    if (!isDefined(capabilities))
      capabilities = await WebMapTileServiceCapabilities.fromUrl(
        proxyCatalogItemUrl(
          catalogItem,
          catalogItem.getCapabilitiesUrl,
          catalogItem.getCapabilitiesCacheDuration
        )
      );

    return new GetCapabilitiesStratum(catalogItem, capabilities);
  }

  constructor(
    readonly catalogItem: WebMapTileServiceCatalogItem,
    readonly capabilities: WebMapTileServiceCapabilities
  ) {
    super();
    makeObservable(this);
  }

  duplicateLoadableStratum(model: BaseModel): this {
    return new GetCapabilitiesStratum(
      model as WebMapTileServiceCatalogItem,
      this.capabilities
    ) as this;
  }

  @computed
  get layer(): string | undefined {
    let layer: string | undefined;

    if (this.catalogItem.uri !== undefined) {
      const query: any = this.catalogItem.uri.query(true);
      layer = query.layer;
    }

    return layer;
  }

  @computed
  get info(): StratumFromTraits<InfoSectionTraits>[] {
    const result: StratumFromTraits<InfoSectionTraits>[] = [
      createStratumInstance(InfoSectionTraits, {
        name: i18next.t(
          "models.webMapTileServiceCatalogItem.getCapabilitiesUrl"
        ),
        content: this.catalogItem.getCapabilitiesUrl
      })
    ];
    let layerAbstract: string | undefined;
    const layer = this.capabilitiesLayer;
    if (
      layer &&
      layer.Abstract &&
      !containsAny(
        layer.Abstract,
        WebMapTileServiceCatalogItem.abstractsToIgnore
      )
    ) {
      result.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t(
            "models.webMapTileServiceCatalogItem.dataDescription"
          ),
          content: layer.Abstract
        })
      );
      layerAbstract = layer.Abstract;
    }

    const serviceIdentification =
      this.capabilities && this.capabilities.ServiceIdentification;
    if (serviceIdentification) {
      if (
        serviceIdentification.Abstract &&
        !containsAny(
          serviceIdentification.Abstract,
          WebMapTileServiceCatalogItem.abstractsToIgnore
        ) &&
        serviceIdentification.Abstract !== layerAbstract
      ) {
        result.push(
          createStratumInstance(InfoSectionTraits, {
            name: i18next.t(
              "models.webMapTileServiceCatalogItem.serviceDescription"
            ),
            content: serviceIdentification.Abstract
          })
        );
      }

      // Show the Access Constraints if it isn't "none" (because that's the default, and usually a lie).
      if (
        serviceIdentification.AccessConstraints &&
        !/^none$/i.test(serviceIdentification.AccessConstraints)
      ) {
        result.push(
          createStratumInstance(InfoSectionTraits, {
            name: i18next.t(
              "models.webMapTileServiceCatalogItem.accessConstraints"
            ),
            content: serviceIdentification.AccessConstraints
          })
        );
      }

      // Show the Access Constraints if it isn't "none" (because that's the default, and usually a lie).
      if (
        serviceIdentification.Fees &&
        !/^none$/i.test(serviceIdentification.Fees)
      ) {
        result.push(
          createStratumInstance(InfoSectionTraits, {
            name: i18next.t("models.webMapTileServiceCatalogItem.fees"),
            content: serviceIdentification.Fees
          })
        );
      }
    }

    const serviceProvider =
      this.capabilities && this.capabilities.ServiceProvider;
    if (serviceProvider) {
      result.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t("models.webMapTileServiceCatalogItem.serviceContact"),
          content: getServiceContactInformation(serviceProvider) || ""
        })
      );
    }

    if (!isDefined(this.catalogItem.tileMatrixSet)) {
      result.push(
        createStratumInstance(InfoSectionTraits, {
          name: i18next.t(
            "models.webMapTileServiceCatalogItem.noUsableTileMatrixTitle"
          ),
          content: i18next.t(
            "models.webMapTileServiceCatalogItem.noUsableTileMatrixMessage"
          )
        })
      );
    }
    return result;
  }

  @computed
  get infoSectionOrder(): string[] {
    return [
      i18next.t("preview.disclaimer"),
      i18next.t("models.webMapTileServiceCatalogItem.noUsableTileMatrixTitle"),
      i18next.t("description.name"),
      i18next.t("preview.datasetDescription"),
      i18next.t("models.webMapTileServiceCatalogItem.dataDescription"),
      i18next.t("preview.serviceDescription"),
      i18next.t("models.webMapTileServiceCatalogItem.serviceDescription"),
      i18next.t("preview.resourceDescription"),
      i18next.t("preview.licence"),
      i18next.t("preview.accessConstraints"),
      i18next.t("models.webMapTileServiceCatalogItem.accessConstraints"),
      i18next.t("models.webMapTileServiceCatalogItem.fees"),
      i18next.t("preview.author"),
      i18next.t("preview.contact"),
      i18next.t("models.webMapTileServiceCatalogItem.serviceContact"),
      i18next.t("preview.created"),
      i18next.t("preview.modified"),
      i18next.t("preview.updateFrequency"),
      i18next.t("models.webMapTileServiceCatalogItem.getCapabilitiesUrl")
    ];
  }

  @computed
  get kvpTileUrl(): string | undefined {
    const operations = this.capabilities.json?.OperationsMetadata?.Operation;
    const ops = forceArray(operations);
    for (const operation of ops) {
      if (operation?.name?.toLowerCase() !== "gettile") {
        continue;
      }
      const gets = forceArray(operation.DCP?.HTTP?.Get);
      for (const candidate of gets) {
        // Look for KVP encoding
        const constraint = candidate?.Constraint;
        if (constraint) {
          const constraints = Array.isArray(constraint)
            ? constraint
            : [constraint];
          const kvpConstraint = constraints.find(
            (c: any) =>
              c?.name?.toLowerCase() === "getencoding" &&
              forceArray(c?.AllowedValues?.Value).some(
                (v: any) => String(v).toLowerCase() === "kvp"
              )
          );
          if (kvpConstraint) {
            const href = candidate?.["xlink:href"];
            if (typeof href === "string" && href.length > 0) {
              return href;
            }
          }
        }
      }
    }
    return undefined;
  }

  @computed
  get featureInfoUrl(): string | undefined {
    const operations = this.capabilities.json?.OperationsMetadata?.Operation;
    const ops = forceArray(operations);
    for (const operation of ops) {
      if (operation?.name?.toLowerCase() !== "getfeatureinfo") {
        continue;
      }
      const gets = forceArray(operation.DCP?.HTTP?.Get);
      for (const candidate of gets) {
        const href = candidate?.["xlink:href"];
        if (typeof href === "string" && href.length > 0) {
          return href;
        }
      }
    }
    return undefined;
  }

  @computed
  get shortReport() {
    return !isDefined(this.catalogItem.tileMatrixSet)
      ? `${i18next.t(
          "models.webMapTileServiceCatalogItem.noUsableTileMatrixTitle"
        )}: ${i18next.t(
          "models.webMapTileServiceCatalogItem.noUsableTileMatrixMessage"
        )}`
      : undefined;
  }

  @computed
  get legends() {
    const layerAvailableStyles = this.catalogItem.availableStyles.find(
      (candidate) => candidate.layerName === this.capabilitiesLayer?.Identifier
    )?.styles;

    const layerStyle = layerAvailableStyles?.find(
      (candidate) => candidate.identifier === this.catalogItem.style
    );

    if (isDefined(layerStyle?.legend)) {
      return [
        createStratumInstance(LegendTraits, {
          url: layerStyle!.legend.url,
          urlMimeType: layerStyle!.legend.urlMimeType
        })
      ];
    }
  }

  @computed
  get capabilitiesLayer(): Readonly<WmtsLayer | undefined> {
    const result = this.catalogItem.layer
      ? this.capabilities.findLayer(this.catalogItem.layer)
      : undefined;
    return result;
  }

  @computed
  get availableStyles(): StratumFromTraits<WebMapTileServiceAvailableLayerStylesTraits>[] {
    const result: any = [];
    if (!this.capabilities) {
      return result;
    }
    const layer = this.capabilitiesLayer;
    if (!layer) {
      return result;
    }
    const styles: ReadonlyArray<CapabilitiesStyle> =
      layer && layer.Style
        ? Array.isArray(layer.Style)
          ? layer.Style
          : [layer.Style]
        : [];
    result.push({
      layerName: layer?.Identifier,
      styles: styles.map((style: CapabilitiesStyle) => {
        const wmtsLegendUrl: WmtsCapabilitiesLegend | undefined =
          isReadOnlyArray(style.LegendURL)
            ? style.LegendURL[0]
            : style.LegendURL;
        let legendUri, legendMimeType;
        if (wmtsLegendUrl && wmtsLegendUrl["xlink:href"]) {
          legendUri = new URI(decodeURIComponent(wmtsLegendUrl["xlink:href"]));
          legendMimeType = wmtsLegendUrl.Format;
        }
        const legend = !legendUri
          ? undefined
          : createStratumInstance(LegendTraits, {
              url: legendUri.toString(),
              urlMimeType: legendMimeType
            });
        return {
          identifier: style.Identifier,
          isDefault: style.isDefault,
          abstract: style.Abstract,
          legend: legend
        };
      })
    });

    return result;
  }

  @computed
  get layerDimensions(): Map<string, DimensionSummary[]> {
    const layers = this.capabilities?.json?.Contents?.Layer;
    return buildLayerDimensionMap(layers);
  }

  @computed
  get currentLayerDimensions(): DimensionSummary[] | undefined {
    // Use the Identifier from capabilitiesLayer instead of the user-provided layer name
    // because the layer name might be a Title, but layerDimensions map uses Identifier as key
    const layerIdentifier = this.capabilitiesLayer?.Identifier;
    if (!layerIdentifier) {
      return;
    }
    return this.layerDimensions.get(layerIdentifier);
  }

  @computed
  get availableDimensions(): StratumFromTraits<WebMapTileServiceAvailableLayerDimensionsTraits>[] {
    const result: StratumFromTraits<WebMapTileServiceAvailableLayerDimensionsTraits>[] =
      [];
    this.layerDimensions.forEach((dimensions, layerName) => {
      const usable = dimensions.filter(
        (dimension) =>
          dimension.name &&
          dimension.name.toLowerCase() !== "time" &&
          dimension.values.length > 0
      );
      if (usable.length === 0) {
        return;
      }

      result.push(
        createStratumInstance(WebMapTileServiceAvailableLayerDimensionsTraits, {
          layerName,
          dimensions: usable.map((dimension) =>
            createStratumInstance(WebMapTileServiceAvailableDimensionTraits, {
              name: dimension.name,
              values: dimension.values,
              units: dimension.units,
              unitSymbol: dimension.unitSymbol,
              multipleValues: dimension.multipleValues,
              nearestValue: dimension.nearestValue,
              default: dimension.default
            })
          )
        })
      );
    });

    return result;
  }

  @computed
  get discreteTimes(): { time: string; tag: string | undefined }[] | undefined {
    const timeDimension = this.currentLayerDimensions?.find(
      (dimension) => dimension.name?.toLowerCase() === "time"
    );
    if (!timeDimension) {
      return undefined;
    }

    const result: { time: string; tag: string | undefined }[] = [];
    timeDimension.values.forEach((value) => {
      const segments = value.split("/").map((segment) => segment.trim());
      if (segments.length === 1) {
        if (segments[0].length > 0 && segments[0].toLowerCase() !== "current") {
          result.push({ time: segments[0], tag: undefined });
        }
      } else if (segments.length >= 2) {
        createDiscreteTimesFromIsoSegments(
          result,
          segments[0],
          segments[1],
          segments[2],
          this.catalogItem.maxRefreshIntervals
        );
      }
    });

    return result.length > 0 ? result : undefined;
  }

  @computed
  get usableTileMatrixSets() {
    const usableTileMatrixSets: { [key: string]: UsableTileMatrixSets } = {
      "urn:ogc:def:wkss:OGC:1.0:GoogleMapsCompatible": {
        identifiers: ["0"],
        tileWidth: 256,
        tileHeight: 256,
        projection: "EPSG:3857"
      }
    };

    const matrixSets = this.capabilities.tileMatrixSets;
    if (matrixSets === undefined) {
      return;
    }

    for (let i = 0; i < matrixSets.length; i++) {
      const matrixSet = matrixSets[i];
      if (!matrixSet.SupportedCRS) {
        continue;
      }

      // Detect projection type
      let projection: "EPSG:3857" | "EPSG:4326" | undefined;
      if (
        /EPSG.*900913/.test(matrixSet.SupportedCRS) ||
        /EPSG.*3857/.test(matrixSet.SupportedCRS)
      ) {
        projection = "EPSG:3857";
      } else if (
        /EPSG.*4326/.test(matrixSet.SupportedCRS) ||
        /CRS84/.test(matrixSet.SupportedCRS)
      ) {
        projection = "EPSG:4326";
      } else {
        continue; // Unsupported projection
      }

      const matrices = matrixSet.TileMatrix;
      if (!isDefined(matrices) || matrices.length < 1) {
        continue;
      }

      const levelZeroMatrix = matrices[0];
      if (!isDefined(levelZeroMatrix.TopLeftCorner)) {
        continue;
      }

      const levelZeroTopLeftCorner = levelZeroMatrix.TopLeftCorner.split(" ");
      const startX = parseFloat(levelZeroTopLeftCorner[0]);
      const startY = parseFloat(levelZeroTopLeftCorner[1]);

      // Validate coordinates based on projection
      if (projection === "EPSG:3857") {
        const tilingScheme = new WebMercatorTilingScheme();
        const rectangleInMeters = tilingScheme.rectangleToNativeRectangle(
          tilingScheme.rectangle
        );
        if (
          Math.abs(startX - rectangleInMeters.west) > 1 ||
          Math.abs(startY - rectangleInMeters.north) > 1
        ) {
          continue;
        }
      } else if (projection === "EPSG:4326") {
        // For EPSG:4326, expect TopLeftCorner near -180, 90
        // More relaxed validation as different services may use different origins
        const expectedX = -180;
        const expectedY = 90;
        const tolerance = 10; // 10 degree tolerance for flexibility
        if (
          Math.abs(startX - expectedX) > tolerance ||
          Math.abs(startY - expectedY) > tolerance
        ) {
          continue;
        }
      }

      if (defined(matrixSet.TileMatrix) && matrixSet.TileMatrix.length > 0) {
        const ids = matrixSet.TileMatrix.map(function (item) {
          return item.Identifier;
        });
        const firstTile = matrixSet.TileMatrix[0];
        usableTileMatrixSets[matrixSet.Identifier] = {
          identifiers: ids,
          tileWidth: firstTile.TileWidth,
          tileHeight: firstTile.TileHeight,
          projection: projection
        };
      }
    }

    return usableTileMatrixSets;
  }

  @computed
  get rectangle(): StratumFromTraits<RectangleTraits> | undefined {
    const layer: WmtsLayer | undefined = this.capabilitiesLayer;
    if (!layer) {
      return;
    }
    const bbox = layer.WGS84BoundingBox;
    if (bbox) {
      const lowerCorner = bbox.LowerCorner.split(" ");
      const upperCorner = bbox.UpperCorner.split(" ");
      return {
        west: parseFloat(lowerCorner[0]),
        south: parseFloat(lowerCorner[1]),
        east: parseFloat(upperCorner[0]),
        north: parseFloat(upperCorner[1])
      };
    }
  }

  @computed get style(): string | undefined {
    if (!isDefined(this.catalogItem.layer)) return;

    const layerAvailableStyles = this.availableStyles.find(
      (candidate) => candidate.layerName === this.capabilitiesLayer?.Identifier
    )?.styles;

    return (
      layerAvailableStyles?.find((style) => style.isDefault)?.identifier ??
      layerAvailableStyles?.[0]?.identifier
    );
  }
}

class WebMapTileServiceCatalogItem extends DiscretelyTimeVaryingMixin(
  MappableMixin(
    GetCapabilitiesMixin(
      UrlMixin(
        CatalogMemberMixin(CreateModel(WebMapTileServiceCatalogItemTraits))
      )
    )
  )
) {
  /**
   * The collection of strings that indicate an Abstract property should be ignored.  If these strings occur anywhere
   * in the Abstract, the Abstract will not be used.  This makes it easy to filter out placeholder data like
   * Geoserver's "A compliant implementation of WMTS..." stock abstract.
   */
  static abstractsToIgnore = [
    "A compliant implementation of WMTS service.",
    "This is the reference implementation of WMTS 1.0.0"
  ];

  // hide elements in the info section which might show information about the datasource
  _sourceInfoItemNames = [
    i18next.t("models.webMapTileServiceCatalogItem.getCapabilitiesUrl")
  ];

  static readonly type = "wmts";

  private get capabilitiesStratum(): GetCapabilitiesStratum | undefined {
    return this.strata.get(GetCapabilitiesMixin.getCapabilitiesStratumName) as
      | GetCapabilitiesStratum
      | undefined;
  }

  private get featureInfoEndpoint(): string | undefined {
    // Only use explicit getFeatureInfoUrl or the one from capabilities
    // Do not fallback to url or getCapabilitiesUrl as these are not valid GetFeatureInfo endpoints
    return this.getFeatureInfoUrl ?? this.capabilitiesStratum?.featureInfoUrl;
  }

  private get featureInfoFormatOptions(): {
    type: FeatureInfoFormatType;
    format: string;
  } {
    const trait = this.getFeatureInfoFormat;
    const type = normalizeFeatureInfoType(trait?.type);
    const format = trait?.format ?? defaultInfoFormatForType(type);
    return { type, format };
  }

  constructor(...args: ModelConstructorParameters) {
    super(...args);
    makeObservable(this);
  }

  get type() {
    return WebMapTileServiceCatalogItem.type;
  }

  async createGetCapabilitiesStratumFromParent(
    capabilities: WebMapTileServiceCapabilities
  ) {
    const stratum = await GetCapabilitiesStratum.load(this, capabilities);
    runInAction(() => {
      this.strata.set(GetCapabilitiesMixin.getCapabilitiesStratumName, stratum);
    });
  }

  protected async forceLoadMetadata(): Promise<void> {
    if (
      this.strata.get(GetCapabilitiesMixin.getCapabilitiesStratumName) !==
      undefined
    )
      return;
    const stratum = await GetCapabilitiesStratum.load(this);
    runInAction(() => {
      this.strata.set(GetCapabilitiesMixin.getCapabilitiesStratumName, stratum);
    });
  }

  @override
  get cacheDuration(): string {
    if (isDefined(super.cacheDuration)) {
      return super.cacheDuration;
    }
    return "1d";
  }

  @computed
  get imageryProvider() {
    return this._createImageryProvider(this.currentDiscreteTimeTag);
  }

  private _createImageryProvider = createTransformerAllowUndefined(
    (timeTag: string | undefined): ExtendedImageryProvider | undefined => {
      const stratum = this.capabilitiesStratum;
      if (
        !isDefined(this.layer) ||
        !isDefined(this.url) ||
        !isDefined(stratum) ||
        !isDefined(this.style)
      ) {
        return undefined;
      }

      const layer = stratum.capabilitiesLayer;
      const layerIdentifier = layer?.Identifier;
      if (!isDefined(layer) || !isDefined(layerIdentifier)) {
        return undefined;
      }

      const formatCandidates = forceArray(layer.Format).map((item: any) =>
        typeof item === "string" ? item : (item?.toString?.() ?? "")
      );
      const format = formatCandidates.includes("image/png")
        ? "image/png"
        : formatCandidates.includes("image/jpeg")
          ? "image/jpeg"
          : "image/png";

      const resourceUrl: ResourceUrl | ResourceUrl[] | undefined =
        layer.ResourceURL;
      let baseUrl: string = new URI(this.url).search("").toString();
      let templateTokens: string[] = [];

      const tileMatrixSet = this.tileMatrixSet;
      if (!isDefined(tileMatrixSet)) {
        console.error(
          `[WMTS] No usable TileMatrixSet found for layer ${layerIdentifier}`
        );
        return undefined;
      }

      // First, collect dimensions to determine if we need them
      const dimensions: Record<string, string> = { ...(this.dimensions ?? {}) };

      if (resourceUrl) {
        const candidates = Array.isArray(resourceUrl)
          ? resourceUrl
          : [resourceUrl];
        const matchingFormat = candidates.filter((candidate) => {
          let candidateFormat: string | undefined;
          if (typeof candidate.format === "string") {
            candidateFormat = candidate.format;
          } else if (
            candidate.format !== undefined &&
            candidate.format !== null
          ) {
            candidateFormat = String(candidate.format);
          }
          if (!candidateFormat) {
            return false;
          }
          return (
            candidateFormat.indexOf(format) !== -1 ||
            candidateFormat.indexOf("png") !== -1
          );
        });
        const preferredTemplate = matchingFormat.find((candidate) =>
          templateMatchesTileMatrixSet(candidate.template, tileMatrixSet)
        );
        if (preferredTemplate?.template) {
          baseUrl = preferredTemplate.template;
          templateTokens = extractTemplateTokens(preferredTemplate.template);
        }
      }
      const defaults = stratum.currentLayerDimensions ?? [];
      const timeDimensionName = defaults.find(
        (dimension) => dimension.name?.toLowerCase() === "time"
      )?.name;
      const timeKeys = new Set<string>();
      if (timeDimensionName) {
        timeKeys.add(timeDimensionName);
      }
      templateTokens
        .filter((token) => token.toLowerCase() === "time")
        .forEach((token) => timeKeys.add(token));
      if (!timeKeys.size) {
        timeKeys.add("time");
      }

      defaults.forEach((dimension) => {
        if (!dimension.name) {
          return;
        }
        const name = dimension.name;
        if (name.toLowerCase() === "time") {
          if (!timeTag && dimension.default && !dimensions[name]) {
            dimensions[name] = dimension.default;
          }
        } else if (dimension.default && !dimensions[name]) {
          dimensions[name] = dimension.default;
        }
      });

      if (timeTag) {
        Object.keys(dimensions).forEach((key) => {
          if (key.toLowerCase() === "time") {
            delete dimensions[key];
          }
        });
        timeKeys.forEach((key) => {
          dimensions[key] = timeTag;
        });
      }

      Object.keys(dimensions).forEach((key) => {
        const value = dimensions[key];
        if (value === undefined || value === null || value === "") {
          delete dimensions[key];
        }
      });

      // Select appropriate tiling scheme based on projection
      // For GIBS and other services with non-standard tile matrix sets, we need to create a custom tiling scheme
      const tilingScheme = this.createTilingScheme(
        tileMatrixSet.id,
        tileMatrixSet.projection
      );

      const finalDimensions =
        Object.keys(dimensions).length > 0 ? dimensions : undefined;

      // Check if REST template supports the dimensions we need to pass.
      // Cesium's WebMapTileServiceImageryProvider only applies dimensions via query parameters
      // when using KVP mode. For REST mode, dimensions must be in the template as placeholders.
      // If dimensions exist but template doesn't support them, fallback to KVP mode.
      if (finalDimensions && templateTokens.length > 0) {
        const lowerTokens = templateTokens.map((t) => t.toLowerCase());
        const dimensionKeys = Object.keys(finalDimensions);
        const unsupportedDimensions = dimensionKeys.filter(
          (key) => !lowerTokens.includes(key.toLowerCase())
        );

        if (unsupportedDimensions.length > 0) {
          console.log(
            `[WMTS] REST template does not support dimensions: ${unsupportedDimensions.join(
              ", "
            )}. Falling back to KVP mode to support dimensional data.`
          );
          // Reset to KVP mode by using the KVP endpoint from capabilities
          baseUrl =
            stratum.kvpTileUrl ?? new URI(this.url).search("").toString();
          templateTokens = [];
        }
      }

      // Log WMTS configuration for debugging tile load issues
      if (!templateTokens.length && baseUrl.indexOf("{") !== -1) {
        templateTokens = extractTemplateTokens(baseUrl);
      }

      let imageryProvider = this.createUrlTemplateImageryProvider({
        templateUrl: baseUrl,
        tileMatrixSet,
        tilingScheme,
        format,
        layerIdentifier,
        templateTokens,
        dimensions: finalDimensions,
        timeTag
      });

      if (!imageryProvider) {
        const minIndex = 0;
        const maxIndex = Math.max(0, tileMatrixSet.labels.length - 1);
        const minLevel = clamp(
          this.minimumLevel ?? tileMatrixSet.minLevel ?? minIndex,
          minIndex,
          maxIndex
        );
        const maxLevel = clamp(
          this.maximumLevel ?? tileMatrixSet.maxLevel ?? maxIndex,
          minIndex,
          maxIndex
        );

        // Get actual tile pixel dimensions from the TileMatrixSet
        const levelDimensions = this.getTileMatrixLevelDimensions(
          tileMatrixSet.id
        );
        const level0Dims = levelDimensions?.get(0);
        const actualTileWidth =
          level0Dims?.tileWidth ?? tileMatrixSet.tileWidth;
        const actualTileHeight =
          level0Dims?.tileHeight ?? tileMatrixSet.tileHeight;

        imageryProvider = new WebMapTileServiceImageryProvider({
          url: proxyCatalogItemUrl(this, baseUrl),
          layer: layerIdentifier,
          style: this.style,
          tileMatrixSetID: tileMatrixSet.id,
          tileMatrixLabels: tileMatrixSet.labels,
          minimumLevel: minLevel,
          maximumLevel: maxLevel,
          tileWidth: actualTileWidth,
          tileHeight: actualTileHeight,
          tilingScheme,
          format,
          credit: this.attribution,
          dimensions: finalDimensions
        }) as ExtendedImageryProvider;
      }

      const usingUrlTemplate =
        imageryProvider instanceof UrlTemplateImageryProvider;

      // Enable feature picking only if a GetFeatureInfo endpoint or custom request is available
      const hasFeatureInfoSupport =
        isDefined(this.featureInfoEndpoint) ||
        isDefined(this.featureInfoRequest);
      imageryProvider.enablePickFeatures =
        this.allowFeaturePicking && hasFeatureInfoSupport;

      if (this.allowFeaturePicking && hasFeatureInfoSupport) {
        (imageryProvider as any).pickFeatures = (
          x: number,
          y: number,
          level: number,
          longitude: number,
          latitude: number
        ) =>
          this.pickFeatures(
            imageryProvider,
            x,
            y,
            level,
            longitude,
            latitude,
            timeTag
          );
      }

      return imageryProvider;
    }
  );

  getTileUrl(
    layer: WmtsLayer,
    capabilities: WebMapTileServiceCapabilities,
    format: string
  ) {
    let url: string | undefined = undefined;
    if (
      capabilities.OperationsMetadata &&
      "GetTile" in capabilities.OperationsMetadata
    ) {
      const gets = capabilities.OperationsMetadata.GetTile["Get"];

      for (let i = 0; i < gets.length; i++) {
        let constraints = gets[i].Constraint;
        if (constraints) {
          constraints = Array.isArray(constraints)
            ? constraints
            : [constraints];
          const getEncodingConstraint = constraints.find(
            (element) => element.name === "GetEncoding"
          );

          const encodings = getEncodingConstraint?.AllowedValues?.Value;
          if (encodings?.includes("KVP")) {
            url = gets[i]["xlink:href"];
          }
        } else if (gets[i]["xlink:href"]) {
          url = gets[i]["xlink:href"];
        }
      }
    }

    const resourceUrls: ResourceUrl[] | undefined =
      !layer.ResourceURL || Array.isArray(layer.ResourceURL)
        ? layer.ResourceURL
        : [layer.ResourceURL];

    if (resourceUrls && (this.requestEncoding === "RESTful" || !url)) {
      for (let i = 0; i < resourceUrls.length; i++) {
        const resourceUrl: ResourceUrl = resourceUrls[i];
        if (
          (resourceUrl.resourceType === "tile" &&
            resourceUrl.format.indexOf(format) !== -1) ||
          resourceUrl.format.indexOf("png") !== -1
        ) {
          url = resourceUrl.template;
        }
      }
    }

    return url ?? new URI(this.url).search("").toString();
  }

  @computed
  get tileMatrixSet():
    | {
        id: string;
        labels: string[];
        labelByLevel: Map<number, string>;
        maxLevel: number;
        minLevel: number;
        tileWidth: number;
        tileHeight: number;
        projection: "EPSG:3857" | "EPSG:4326";
      }
    | undefined {
    const stratum = this.capabilitiesStratum;
    if (!stratum) {
      return;
    }
    if (!this.layer) {
      return;
    }
    const layer = stratum.capabilitiesLayer;
    if (!layer) {
      return;
    }

    const usableTileMatrixSets = stratum.usableTileMatrixSets;

    let tileMatrixSetLinks: TileMatrixSetLink[] = [];
    if (layer?.TileMatrixSetLink) {
      if (Array.isArray(layer?.TileMatrixSetLink)) {
        // eslint-disable-next-line no-unsafe-optional-chaining
        tileMatrixSetLinks = [...layer?.TileMatrixSetLink];
      } else {
        tileMatrixSetLinks = [layer.TileMatrixSetLink];
      }
    }

    let selectedId: string | undefined;
    let selected: UsableTileMatrixSets | undefined;

    for (let i = 0; i < tileMatrixSetLinks.length; i++) {
      const candidateId = tileMatrixSetLinks[i].TileMatrixSet;
      const candidate = usableTileMatrixSets?.[candidateId];
      if (!candidate) {
        continue;
      }

      if (!selected) {
        selectedId = candidateId;
        selected = candidate;
        continue;
      }

      if (
        candidate.projection === "EPSG:3857" &&
        selected.projection !== "EPSG:3857"
      ) {
        selectedId = candidateId;
        selected = candidate;
      }
    }

    if (!selected || !selectedId) {
      return;
    }

    const tileMatrixSetLabels = selected.identifiers;
    const labelByLevel = new Map<number, string>();
    if (
      !Array.isArray(tileMatrixSetLabels) ||
      tileMatrixSetLabels.length === 0
    ) {
      return;
    }

    // Build labelByLevel map for semantic lookups
    // This maps parsed level numbers (or indices) to labels
    tileMatrixSetLabels.forEach((label, index) => {
      const parsedLevel = parseTileMatrixLevel(label);
      if (isDefined(parsedLevel)) {
        labelByLevel.set(parsedLevel, label);
      }
      // Always also set the index mapping as primary
      labelByLevel.set(index, label);
    });

    // Use array indices for min/max level, not parsed identifiers
    // Cesium/Leaflet use 0-based array indices regardless of TileMatrix identifiers
    const minLevel = 0;
    const maxLevel = tileMatrixSetLabels.length - 1;

    return {
      id: selectedId,
      labels: tileMatrixSetLabels,
      labelByLevel,
      maxLevel: maxLevel,
      minLevel: minLevel,
      tileWidth: Number(selected.tileWidth) || 256,
      tileHeight: Number(selected.tileHeight) || 256,
      projection: selected.projection
    };
  }

  private getTileMatrixSetDefinition(tileMatrixSetId: string) {
    const capabilities = this.capabilitiesStratum?.capabilities;
    const tileMatrixSets = capabilities?.json?.Contents?.TileMatrixSet;
    if (!tileMatrixSets) {
      return;
    }

    const tileMatrixSetArray = Array.isArray(tileMatrixSets)
      ? tileMatrixSets
      : [tileMatrixSets];
    return tileMatrixSetArray.find(
      (tms: any) => tms.Identifier === tileMatrixSetId
    );
  }

  private getTileMatrixLevelDimensions(tileMatrixSetId: string):
    | Map<
        number,
        {
          width: number;
          height: number;
          topLeftCorner?: [number, number];
          scaleDenominator?: number;
          tileWidth?: number;
          tileHeight?: number;
        }
      >
    | undefined {
    const tileMatrixSet = this.getTileMatrixSetDefinition(tileMatrixSetId);
    const tileMatrixEntries = tileMatrixSet?.TileMatrix;
    if (!tileMatrixEntries) {
      return;
    }

    const tileMatrices = forceArray(tileMatrixEntries);

    const levelDimensions = new Map<
      number,
      {
        width: number;
        height: number;
        topLeftCorner?: [number, number];
        scaleDenominator?: number;
        tileWidth?: number;
        tileHeight?: number;
      }
    >();
    tileMatrices.forEach((matrix: any, index: number) => {
      const width = Number(matrix.MatrixWidth);
      const height = Number(matrix.MatrixHeight);
      // Use array index as the key, not the TileMatrix Identifier
      // This is because Cesium/Leaflet use 0-based level indices, regardless of
      // what the actual TileMatrix identifiers are (e.g., WorldCRS84Quad uses 6-10)
      const key = index;

      // Parse TopLeftCorner if available
      let topLeftCorner: [number, number] | undefined;
      if (matrix.TopLeftCorner) {
        const coords = matrix.TopLeftCorner.split(" ");
        if (coords.length >= 2) {
          const x = parseFloat(coords[0]);
          const y = parseFloat(coords[1]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            topLeftCorner = [x, y];
          }
        }
      }

      // Parse ScaleDenominator if available
      const scaleDenominator = matrix.ScaleDenominator
        ? Number(matrix.ScaleDenominator)
        : undefined;

      // Parse TileWidth and TileHeight if available
      const tileWidth = matrix.TileWidth ? Number(matrix.TileWidth) : undefined;
      const tileHeight = matrix.TileHeight
        ? Number(matrix.TileHeight)
        : undefined;

      if (
        Number.isFinite(width) &&
        Number.isFinite(height) &&
        width > 0 &&
        height > 0
      ) {
        levelDimensions.set(key, {
          width,
          height,
          topLeftCorner,
          scaleDenominator,
          tileWidth,
          tileHeight
        });
      }
    });

    if (levelDimensions.size === 0) {
      return;
    }

    return levelDimensions;
  }

  /**
   * Checks if a TileMatrixSet has a non-standard tile progression.
   * Standard EPSG:4326 follows: level 0 = 2x1, level 1 = 4x2, level 2 = 8x4, etc.
   * GIBS and other services may use non-standard progressions like: 2x1, 3x2, 5x3, 10x5
   */
  private hasNonStandardTileProgression(tileMatrixSet: {
    id: string;
    labels: string[];
    labelByLevel: Map<number, string>;
    maxLevel: number;
    minLevel: number;
    tileWidth: number;
    tileHeight: number;
    projection: "EPSG:3857" | "EPSG:4326";
  }): boolean {
    const levelDimensions = this.getTileMatrixLevelDimensions(tileMatrixSet.id);
    if (!levelDimensions || levelDimensions.size === 0) {
      return false;
    }

    // Check first few levels for standard progression
    // Standard EPSG:4326 GeographicTilingScheme:
    // Level 0: 2x1, Level 1: 4x2, Level 2: 8x4, Level 3: 16x8
    const standardProgressionEPSG4326 = [
      { level: 0, width: 2, height: 1 },
      { level: 1, width: 4, height: 2 },
      { level: 2, width: 8, height: 4 },
      { level: 3, width: 16, height: 8 }
    ];

    // Standard Web Mercator:
    // Level 0: 1x1, Level 1: 2x2, Level 2: 4x4, Level 3: 8x8
    const standardProgressionWebMercator = [
      { level: 0, width: 1, height: 1 },
      { level: 1, width: 2, height: 2 },
      { level: 2, width: 4, height: 4 },
      { level: 3, width: 8, height: 8 }
    ];

    const standardProgression =
      tileMatrixSet.projection === "EPSG:4326"
        ? standardProgressionEPSG4326
        : standardProgressionWebMercator;

    // Check at least 2 levels to determine if progression is non-standard
    let nonStandardCount = 0;
    for (const standard of standardProgression.slice(0, 3)) {
      const actual = levelDimensions.get(standard.level);
      if (actual) {
        if (
          actual.width !== standard.width ||
          actual.height !== standard.height
        ) {
          nonStandardCount++;
        }
      }
    }

    // If 2 or more levels don't match standard progression, it's non-standard
    const isNonStandard = nonStandardCount >= 2;

    return isNonStandard;
  }

  private createTilingScheme(
    tileMatrixSetId: string,
    projection: "EPSG:3857" | "EPSG:4326"
  ) {
    const levelDimensions = this.getTileMatrixLevelDimensions(tileMatrixSetId);
    if (!levelDimensions || levelDimensions.size === 0) {
      // Fallback to standard tiling schemes
      return projection === "EPSG:4326"
        ? new GeographicTilingScheme()
        : new WebMercatorTilingScheme();
    }

    // Create custom tiling scheme that respects the actual tile matrix dimensions
    if (projection === "EPSG:4326") {
      return new CustomGeographicTilingScheme(levelDimensions);
    } else {
      return new CustomWebMercatorTilingScheme(levelDimensions);
    }
  }

  private createUrlTemplateImageryProvider(options: {
    templateUrl: string;
    tileMatrixSet: {
      id: string;
      labels: string[];
      labelByLevel: Map<number, string>;
      maxLevel: number;
      minLevel: number;
      tileWidth: number;
      tileHeight: number;
      projection: "EPSG:3857" | "EPSG:4326";
    };
    tilingScheme: any;
    format: string;
    layerIdentifier: string;
    templateTokens: string[];
    dimensions: Record<string, string> | undefined;
    timeTag: string | undefined;
  }): ExtendedImageryProvider | undefined {
    const {
      templateUrl,
      tileMatrixSet,
      tilingScheme,
      format,
      layerIdentifier,
      templateTokens,
      dimensions,
      timeTag
    } = options;

    const tokens = new Set(templateTokens);

    // Check if the TileMatrixSet has a non-standard tile progression
    // (e.g., GIBS uses 2x1, 3x2, 5x3, 10x5 instead of standard 2x1, 4x2, 8x4, 16x8)
    const hasNonStandardProgression =
      this.hasNonStandardTileProgression(tileMatrixSet);

    // If the template contains WMTS placeholders, we would normally prefer using
    // the native WebMapTileServiceImageryProvider. However, for non-standard
    // tile matrix sets (like GIBS), we must use UrlTemplateImageryProvider
    // to ensure correct tile positioning.
    const wmtsPlaceholderTokens = new Set([
      "TileMatrixSet",
      "tilematrixset",
      "TileMatrix",
      "tilematrix",
      "TileMatrixId",
      "TileMatrixID",
      "TileRow",
      "TILEROW",
      "tilerow",
      "TileCol",
      "TILECOL",
      "tilecol"
    ]);
    const containsWmtsPlaceholders = Array.from(tokens).some((t) =>
      wmtsPlaceholderTokens.has(t)
    );

    if (containsWmtsPlaceholders) {
      // For WMTS placeholders, ALWAYS use WebMapTileServiceImageryProvider
      // It respects TileMatrixLabels and custom tiling schemes better than UrlTemplateImageryProvider
      return undefined;
    }
    if (tokens.size === 0) {
      // No template tokens - nothing to substitute, so stick with WMTS provider.
      return undefined;
    }

    const customTags: Record<
      string,
      (
        imageryProvider: UrlTemplateImageryProvider,
        x: number,
        y: number,
        level: number
      ) => string
    > = {};

    const registerConstantTag = (tokenVariants: string[], value?: string) => {
      if (!isDefined(value)) {
        return;
      }
      tokenVariants.forEach((token) => {
        if (tokens.has(token)) {
          customTags[token] = () => value;
          tokens.delete(token);
        }
      });
    };

    registerConstantTag(
      ["TileMatrixSet", "TileMatrixSetID", "TileMatrixSetId", "tilematrixset"],
      tileMatrixSet.id
    );
    registerConstantTag(["Layer", "layer"], layerIdentifier);
    registerConstantTag(["Style", "style"], this.style ?? undefined);
    registerConstantTag(["Format", "format"], format);

    const registerTag = (
      token: string,
      fn: (
        imageryProvider: UrlTemplateImageryProvider,
        x: number,
        y: number,
        level: number
      ) => string
    ) => {
      if (tokens.has(token)) {
        customTags[token] = fn;
        tokens.delete(token);
      }
    };

    const tileMatrixLabels = tileMatrixSet.labels.slice();
    const tileMatrixForLevel = (level: number) => {
      const label =
        tileMatrixSet.labelByLevel.get(level) ??
        tileMatrixLabels[level] ??
        tileMatrixLabels[tileMatrixLabels.length - 1];
      return label ?? level.toString();
    };

    registerTag("TileMatrixSet", () => tileMatrixSet.id);
    registerTag("tilematrixset", () => tileMatrixSet.id);

    registerTag("TileMatrix", (_provider, x, y, level) => {
      const label = tileMatrixForLevel(level);
      return label;
    });
    registerTag("tilematrix", (_provider, _x, _y, level) =>
      tileMatrixForLevel(level)
    );
    registerTag("TileMatrixId", (_provider, _x, _y, level) =>
      tileMatrixForLevel(level)
    );
    registerTag("TileMatrixID", (_provider, _x, _y, level) =>
      tileMatrixForLevel(level)
    );

    registerTag("TileRow", (_provider, x, y, level) => {
      return y.toString();
    });
    registerTag("TILEROW", (_provider, _x, y) => y.toString());
    registerTag("tilerow", (_provider, _x, y) => y.toString());

    registerTag("TileCol", (_provider, x, y, level) => {
      return x.toString();
    });
    registerTag("TILECOL", (_provider, x) => x.toString());
    registerTag("tilecol", (_provider, x) => x.toString());

    // Provide dimension values (such as time) via custom tags.
    tokens.forEach((token) => {
      if (customTags[token]) {
        return;
      }
      const dimensionValue = this.getDimensionValueForToken(
        token,
        dimensions,
        timeTag
      );
      if (isDefined(dimensionValue)) {
        customTags[token] = () => dimensionValue;
        tokens.delete(token);
      }
    });

    const knownUrlTemplateTokens = new Set([
      "x",
      "y",
      "z",
      "s",
      "reverseX",
      "reverseY",
      "-x",
      "-y",
      "westDegrees",
      "southDegrees",
      "eastDegrees",
      "northDegrees",
      "west",
      "south",
      "east",
      "north"
    ]);

    const unresolvedTokens = Array.from(tokens).filter(
      (token) => !knownUrlTemplateTokens.has(token)
    );
    if (unresolvedTokens.length > 0) {
      console.warn(
        `[WMTS] Unable to substitute template tokens ${unresolvedTokens.join(
          ", "
        )}. Falling back to WebMapTileServiceImageryProvider.`
      );
      return undefined;
    }

    const minIndex = tileMatrixSet.minLevel;
    const maxIndex = tileMatrixSet.maxLevel;

    // Get actual tile pixel dimensions from the TileMatrixSet
    // GIBS uses 512x512, but this.tileMatrixSet might have cached values from first tile
    const levelDimensions = this.getTileMatrixLevelDimensions(tileMatrixSet.id);
    const level0Dims = levelDimensions?.get(0);
    const actualTileWidth = level0Dims?.tileWidth ?? tileMatrixSet.tileWidth;
    const actualTileHeight = level0Dims?.tileHeight ?? tileMatrixSet.tileHeight;

    const provider = new UrlTemplateImageryProvider({
      url: proxyCatalogItemUrl(this, templateUrl),
      tilingScheme,
      tileWidth: actualTileWidth,
      tileHeight: actualTileHeight,
      minimumLevel: this.minimumLevel ?? minIndex,
      maximumLevel: this.maximumLevel ?? maxIndex,
      credit: this.attribution,
      customTags: Object.keys(customTags).length > 0 ? customTags : undefined,
      enablePickFeatures: this.allowFeaturePicking
    }) as ExtendedImageryProvider;

    return provider;
  }

  private getDimensionValueForToken(
    token: string,
    dimensions: Record<string, string> | undefined,
    fallbackTime: string | undefined
  ): string | undefined {
    const lowerToken = token.toLowerCase();
    if (dimensions) {
      for (const [key, value] of Object.entries(dimensions)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === lowerToken) {
          return String(value);
        }
        if (
          !lowerToken.startsWith("dim_") &&
          lowerKey === `dim_${lowerToken}`
        ) {
          return String(value);
        }
      }
    }

    if (lowerToken === "time" && isDefined(fallbackTime)) {
      return String(fallbackTime);
    }

    return undefined;
  }

  private pickFeatures(
    imageryProvider: ExtendedImageryProvider,
    x: number,
    y: number,
    level: number,
    longitude: number,
    latitude: number,
    timeTag: string | undefined
  ): Promise<ImageryLayerFeatureInfo[] | undefined> | undefined {
    if (!this.allowFeaturePicking) {
      return undefined;
    }

    const stratum = this.capabilitiesStratum;
    const capabilitiesLayer = stratum?.capabilitiesLayer;
    const layerIdentifier =
      capabilitiesLayer?.Identifier ?? this.layer ?? stratum?.layer;
    if (!layerIdentifier) {
      return undefined;
    }

    const layerTitle =
      this.layer ?? capabilitiesLayer?.Title ?? layerIdentifier;

    const tileMatrixSet = this.tileMatrixSet;
    const { type: defaultType, format } = this.featureInfoFormatOptions;

    const tilingScheme = imageryProvider.tilingScheme;
    const tileRectangle = tilingScheme.tileXYToRectangle(x, y, level);
    const tileWidth = imageryProvider.tileWidth;
    const tileHeight = imageryProvider.tileHeight;

    const u =
      (longitude - tileRectangle.west) /
      (tileRectangle.east - tileRectangle.west);
    const v =
      (tileRectangle.north - latitude) /
      (tileRectangle.north - tileRectangle.south);

    const i = clamp(Math.floor(u * tileWidth), 0, tileWidth - 1);
    const j = clamp(Math.floor(v * tileHeight), 0, tileHeight - 1);

    const tileMatrix =
      tileMatrixSet?.labels && tileMatrixSet.labels[level]
        ? tileMatrixSet.labels[level]
        : level.toString();

    const dimensionStrings: Record<string, string> = {};
    const dimensionParams = this.dimensions ?? {};
    Object.entries(dimensionParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      dimensionStrings[key] = String(value);
    });

    const extraParamStrings: Record<string, string> = {};
    const extraParams = this.getFeatureInfoParameters ?? {};
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      extraParamStrings[key] = String(value);
    });

    const tokens = this.buildFeatureInfoTemplateTokens({
      layerIdentifier,
      layerTitle,
      style: this.style ?? "",
      tileMatrixSet,
      tileMatrix,
      tileRow: y,
      tileCol: x,
      pixelI: i,
      pixelJ: j,
      level,
      longitude,
      latitude,
      tileRectangle,
      tileWidth,
      tileHeight,
      timeTag,
      dimensions: dimensionStrings,
      extraParams: extraParamStrings
    });

    const customRequest = this.featureInfoRequest;
    if (customRequest) {
      const customType = isDefined(customRequest.responseType)
        ? normalizeFeatureInfoType(customRequest.responseType)
        : defaultType;
      return this.pickFeaturesWithCustomRequest(
        customRequest,
        tokens,
        customType,
        format
      );
    }

    const featureInfoUrl = this.featureInfoEndpoint;
    if (!featureInfoUrl || !tileMatrixSet) {
      return undefined;
    }

    const query: Record<string, string> = {
      SERVICE: "WMTS",
      VERSION: "1.0.0",
      REQUEST: "GetFeatureInfo",
      LAYER: layerIdentifier,
      STYLE: this.style ?? "",
      TILEMATRIXSET: tileMatrixSet.id,
      TILEMATRIX: tileMatrix,
      TILEROW: y.toString(),
      TILECOL: x.toString(),
      I: i.toString(),
      J: j.toString(),
      INFOFORMAT: format
    };

    const addDimensionParam = (key: string, value: string | undefined) => {
      if (!value) {
        return;
      }
      query[key] = value;
      const lower = key.toLowerCase();
      if (lower === "time" || lower === "dim_time") {
        query.time = value;
        query.TIME = value;
        query.dim_time = value;
      } else if (!lower.startsWith("dim_")) {
        query[`dim_${key}`] = value;
      }
    };

    if (timeTag) {
      addDimensionParam("time", timeTag);
    }

    Object.entries(dimensionStrings).forEach(([key, value]) =>
      addDimensionParam(key, value)
    );

    Object.entries(extraParamStrings).forEach(([key, value]) => {
      query[key] = value;
    });

    const uri = new URI(featureInfoUrl);
    Object.entries(query).forEach(([key, value]) => uri.addQuery(key, value));

    const resource = new Resource({
      url: proxyCatalogItemUrl(this, uri.toString())
    });

    const fetchPromise = fetchResourceByFormat(resource, defaultType);

    if (!fetchPromise) {
      return undefined;
    }

    return fetchPromise
      .then((data) => {
        if (!isDefined(data)) {
          return undefined;
        }
        try {
          const features = parseFeatureInfoResponse(data, defaultType, format);
          if (!features) {
            return undefined;
          }
          if (defaultType === "json") {
            features.forEach((feature) => {
              if (
                !feature.description &&
                feature.properties &&
                typeof feature.configureDescriptionFromProperties === "function"
              ) {
                feature.configureDescriptionFromProperties(feature.properties);
              }
            });
          }
          return features;
        } catch (error) {
          console.warn("Failed to parse WMTS GetFeatureInfo response", error);
          return undefined;
        }
      })
      .catch((error) => {
        console.warn("WMTS GetFeatureInfo request failed", error);
        return undefined;
      });
  }

  private buildFeatureInfoTemplateTokens(params: {
    layerIdentifier: string;
    layerTitle: string;
    style: string;
    tileMatrixSet?: NonNullable<WebMapTileServiceCatalogItem["tileMatrixSet"]>;
    tileMatrix: string;
    tileRow: number;
    tileCol: number;
    pixelI: number;
    pixelJ: number;
    level: number;
    longitude: number;
    latitude: number;
    tileRectangle: Rectangle;
    tileWidth: number;
    tileHeight: number;
    timeTag?: string;
    dimensions: Record<string, string>;
    extraParams: Record<string, string>;
  }): TemplateTokens {
    const {
      layerIdentifier,
      layerTitle,
      style,
      tileMatrixSet,
      tileMatrix,
      tileRow,
      tileCol,
      pixelI,
      pixelJ,
      level,
      longitude,
      latitude,
      tileRectangle,
      tileWidth,
      tileHeight,
      timeTag,
      dimensions,
      extraParams
    } = params;

    const longitudeDegrees = CesiumMath.toDegrees(longitude);
    const latitudeDegrees = CesiumMath.toDegrees(latitude);

    const tokens: TemplateTokens = {
      layer: layerIdentifier,
      layerId: layerIdentifier,
      layerName: layerIdentifier,
      layerIdentifier,
      layerPath: layerIdentifier.replace(/\./g, "/"),
      layerTitle,
      layerTitlePath: layerTitle.replace(/\s+/g, "/"),
      layerTitleSlug: slugify(layerTitle),
      style,
      tileMatrix,
      tileRow: tileRow.toString(),
      tileCol: tileCol.toString(),
      x: tileCol.toString(),
      y: tileRow.toString(),
      level: level.toString(),
      z: level.toString(),
      i: pixelI.toString(),
      j: pixelJ.toString(),
      pixelI: pixelI.toString(),
      pixelJ: pixelJ.toString(),
      longitude: longitudeDegrees.toString(),
      latitude: latitudeDegrees.toString(),
      longitudeDegrees: longitudeDegrees.toString(),
      latitudeDegrees: latitudeDegrees.toString(),
      longitudeRadians: longitude.toString(),
      latitudeRadians: latitude.toString(),
      tileWidth: tileWidth.toString(),
      tileHeight: tileHeight.toString(),
      tileWest: CesiumMath.toDegrees(tileRectangle.west).toString(),
      tileSouth: CesiumMath.toDegrees(tileRectangle.south).toString(),
      tileEast: CesiumMath.toDegrees(tileRectangle.east).toString(),
      tileNorth: CesiumMath.toDegrees(tileRectangle.north).toString(),
      tileWestRadians: tileRectangle.west.toString(),
      tileSouthRadians: tileRectangle.south.toString(),
      tileEastRadians: tileRectangle.east.toString(),
      tileNorthRadians: tileRectangle.north.toString()
    };

    if (tileMatrixSet) {
      tokens.tileMatrixSet = tileMatrixSet.id;
      tokens.tileMatrixSetId = tileMatrixSet.id;
      tokens.tileMatrixSetProjection = tileMatrixSet.projection;
    }

    if (timeTag) {
      tokens.time = timeTag;
    }

    Object.entries(dimensions).forEach(([key, value]) => {
      if (!value) {
        return;
      }
      const normalizedKey = key.trim();
      if (!normalizedKey) {
        return;
      }
      tokens[normalizedKey] = value;
      tokens[`dim_${normalizedKey}`] = value;
    });

    Object.entries(extraParams).forEach(([key, value]) => {
      if (!value) {
        return;
      }
      tokens[key] = value;
    });

    return tokens;
  }

  private pickFeaturesWithCustomRequest(
    request: FeatureInfoRequestTraits,
    tokens: TemplateTokens,
    type: FeatureInfoFormatType,
    format: string
  ): Promise<ImageryLayerFeatureInfo[] | undefined> | undefined {
    const urlTemplate = request.url ?? this.featureInfoEndpoint;
    if (!isDefined(urlTemplate)) {
      return undefined;
    }

    const requestUrl = applyTemplate(urlTemplate, tokens);
    if (!isDefined(requestUrl)) {
      return undefined;
    }

    const proxiedUrl = proxyCatalogItemUrl(this, requestUrl);
    const headers: Record<string, string> = {};

    if (isDefined(request.headers)) {
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          return;
        }
        headers[key] = String(value);
      });
    }

    const method = (request.method ?? "GET").toUpperCase();
    const bodyTemplate = request.body;
    let body = applyTemplate(bodyTemplate, tokens);

    if (methodRequiresBody(method) && !isDefined(body)) {
      body = "";
    }

    if (
      isDefined(body) &&
      methodRequiresBody(method) &&
      request.autoSetJsonContentType !== false &&
      !hasHeaderIgnoreCase(headers, "content-type")
    ) {
      headers["Content-Type"] = "application/json";
    }

    const resource = new Resource({
      url: proxiedUrl,
      headers
    });

    const responseType = mapFeatureInfoTypeToResourceResponseType(type);

    let fetchPromise: Promise<any> | undefined;
    switch (method) {
      case "GET":
        fetchPromise = fetchResourceByFormat(resource, type);
        break;
      case "POST":
        fetchPromise = resource.post(body ?? "", { responseType });
        break;
      case "PUT":
        fetchPromise = resource.put(body ?? "", { responseType });
        break;
      case "PATCH":
        fetchPromise = resource.patch(body ?? "", { responseType });
        break;
      case "DELETE":
        fetchPromise = resource.delete({ responseType });
        break;
      default:
        fetchPromise = resource.fetch({ responseType });
        break;
    }

    if (!fetchPromise) {
      return undefined;
    }

    return fetchPromise
      .then((data) => {
        if (!isDefined(data)) {
          return undefined;
        }
        try {
          const features = parseFeatureInfoResponse(data, type, format);
          if (!features) {
            return undefined;
          }
          if (type === "json") {
            features.forEach((feature) => {
              if (
                !feature.description &&
                feature.properties &&
                typeof feature.configureDescriptionFromProperties === "function"
              ) {
                feature.configureDescriptionFromProperties(feature.properties);
              }
            });
          }
          return features;
        } catch (error) {
          console.warn(
            "Failed to parse custom WMTS GetFeatureInfo response",
            error
          );
          return undefined;
        }
      })
      .catch((error) => {
        console.warn("Custom WMTS GetFeatureInfo request failed", error);
        return undefined;
      });
  }

  protected forceLoadMapItems(): Promise<void> {
    return Promise.resolve();
  }

  @computed
  get mapItems(): MapItem[] {
    const items: MapItem[] = [];
    const current = this._currentImageryParts;
    if (current) {
      items.push(current);
    }
    const next = this._nextImageryParts;
    if (next) {
      items.push(next);
    }
    return items;
  }

  @computed
  private get _currentImageryParts(): ImageryParts | undefined {
    const imageryProvider = this.imageryProvider;
    if (!imageryProvider) {
      return undefined;
    }

    // Only enable feature picking if we have a valid GetFeatureInfo endpoint
    const hasValidFeatureInfoEndpoint = isDefined(this.featureInfoEndpoint);
    imageryProvider.enablePickFeatures =
      this.allowFeaturePicking && hasValidFeatureInfoEndpoint;

    return {
      imageryProvider,
      alpha: this.opacity,
      show: this.show,
      clippingRectangle: this.clipToRectangle ? this.cesiumRectangle : undefined
    };
  }

  @computed
  private get _nextImageryParts(): ImageryParts | undefined {
    if (
      !this.terria.timelineStack.contains(this) ||
      this.isPaused ||
      !this.nextDiscreteTimeTag
    ) {
      return undefined;
    }

    const imageryProvider = this._createImageryProvider(
      this.nextDiscreteTimeTag
    );
    if (!imageryProvider) {
      return undefined;
    }

    imageryProvider.enablePickFeatures = false;

    return {
      imageryProvider,
      alpha: 0.0,
      show: true,
      clippingRectangle: this.clipToRectangle ? this.cesiumRectangle : undefined
    };
  }

  @override
  get selectableDimensions() {
    if (this.disableDimensionSelectors) {
      return super.selectableDimensions;
    }

    return filterOutUndefined([
      ...super.selectableDimensions,
      ...this.wmtsDimensionSelectableDimensions
    ]);
  }

  @computed
  private get wmtsDimensionSelectableDimensions(): SelectableDimensionEnum[] {
    const dimensions = this.capabilitiesStratum?.currentLayerDimensions ?? [];
    return dimensions
      .filter(
        (dimension) =>
          dimension.name &&
          dimension.name.toLowerCase() !== "time" &&
          dimension.values.length > 1
      )
      .map((dimension) => {
        const name = dimension.name!;
        const selected =
          this.dimensions?.[name] ?? dimension.default ?? dimension.values[0];
        return {
          id: `${this.uniqueId}-${name}`,
          name,
          options: dimension.values.map((value) => ({
            id: value,
            name: value
          })),
          selectedId: selected,
          setDimensionValue: (
            stratumId: string,
            newValue: string | undefined
          ) => {
            const nextDimensions = { ...(this.dimensions ?? {}) };
            if (!newValue) {
              delete nextDimensions[name];
            } else {
              nextDimensions[name] = newValue;
            }
            this.setTrait(stratumId, "dimensions", nextDimensions);
          },
          allowUndefined: true,
          undefinedLabel: "Default"
        } as SelectableDimensionEnum;
      });
  }

  @computed
  get discreteTimes() {
    return this.capabilitiesStratum?.discreteTimes;
  }

  /**
   * Provides feature info context for JSON responses from featureInfoRequest.
   * This makes JSON data from POST requests available in featureInfoTemplate templates.
   *
   * For example, when a WMTS layer uses a custom featureInfoRequest with POST method,
   * the JSON response data becomes available as {{terria.timeSeries.data}} in the template.
   */
  @computed
  get featureInfoContext(): (
    feature: TerriaFeature
  ) => TimeSeriesFeatureInfoContext {
    // Determine the response type: use explicit responseType if set, otherwise use default
    const customRequest = this.featureInfoRequest;
    const responseType = customRequest?.responseType;
    const { type: defaultType } = this.featureInfoFormatOptions;

    const effectiveType = isDefined(responseType)
      ? normalizeFeatureInfoType(responseType)
      : defaultType;

    // Provide JSON context if the effective response type is JSON
    if (effectiveType === "json") {
      return jsonFeatureInfoContext(this);
    }

    return () => ({});
  }

  protected get defaultGetCapabilitiesUrl(): string | undefined {
    if (this.uri) {
      return this.uri
        .clone()
        .setSearch({
          service: "WMTS",
          version: "1.0.0",
          request: "GetCapabilities"
        })
        .toString();
    } else {
      return undefined;
    }
  }
}

/**
 * Custom Geographic Tiling Scheme that uses actual tile matrix dimensions from WMTS capabilities
 * instead of assuming power-of-2 doubling at each level.
 */
class CustomGeographicTilingScheme {
  private levelDimensions: Map<
    number,
    {
      width: number;
      height: number;
      topLeftCorner?: [number, number];
      scaleDenominator?: number;
      tileWidth?: number;
      tileHeight?: number;
    }
  >;
  public ellipsoid: Ellipsoid;
  public rectangle: Rectangle;
  public projection: GeographicProjection;
  public numberOfLevelZeroTilesX: number;
  public numberOfLevelZeroTilesY: number;

  constructor(
    levelDimensions: Map<
      number,
      {
        width: number;
        height: number;
        topLeftCorner?: [number, number];
        scaleDenominator?: number;
        tileWidth?: number;
        tileHeight?: number;
      }
    >
  ) {
    this.levelDimensions = levelDimensions;
    this.ellipsoid = Ellipsoid.WGS84;

    const level0 = levelDimensions.get(0);

    this.numberOfLevelZeroTilesX = level0?.width ?? 2;
    this.numberOfLevelZeroTilesY = level0?.height ?? 1;

    // For EPSG:4326, use standard geographic rectangle covering the entire globe
    this.rectangle = Rectangle.fromDegrees(-180, -90, 180, 90);

    this.projection = new GeographicProjection(this.ellipsoid);
  }

  private computeTileMetrics(levelDim: {
    width: number;
    height: number;
    topLeftCorner?: [number, number];
    scaleDenominator?: number;
    tileWidth?: number;
    tileHeight?: number;
  }): {
    radiansPerPixel?: number;
    tileWidthRadians: number;
    tileHeightRadians: number;
    tileWidthDegrees: number;
    tileHeightDegrees: number;
    topLeftLonRadians: number;
    topLeftLatRadians: number;
    topLeftLonDegrees: number;
    topLeftLatDegrees: number;
  } {
    const metersPerPixel =
      levelDim.scaleDenominator && levelDim.scaleDenominator > 0
        ? levelDim.scaleDenominator * 0.00028
        : undefined;
    const radiansPerPixel =
      metersPerPixel !== undefined
        ? metersPerPixel / this.ellipsoid.maximumRadius
        : undefined;

    const tileWidthRadians =
      radiansPerPixel !== undefined && levelDim.tileWidth
        ? Math.abs(radiansPerPixel * levelDim.tileWidth)
        : (this.rectangle.east - this.rectangle.west) / levelDim.width;

    const tileHeightRadians =
      radiansPerPixel !== undefined && levelDim.tileHeight
        ? Math.abs(radiansPerPixel * levelDim.tileHeight)
        : (this.rectangle.north - this.rectangle.south) / levelDim.height;

    const topLeftLonDegrees = levelDim.topLeftCorner
      ? levelDim.topLeftCorner[0]
      : -180;
    const topLeftLatDegrees = levelDim.topLeftCorner
      ? levelDim.topLeftCorner[1]
      : 90;

    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

    const topLeftLonRadians = toRadians(topLeftLonDegrees);
    const topLeftLatRadians = toRadians(topLeftLatDegrees);

    const toDegrees = (radians: number) => (radians * 180) / Math.PI;

    return {
      radiansPerPixel,
      tileWidthRadians,
      tileHeightRadians,
      tileWidthDegrees: toDegrees(tileWidthRadians),
      tileHeightDegrees: toDegrees(tileHeightRadians),
      topLeftLonRadians,
      topLeftLatRadians,
      topLeftLonDegrees,
      topLeftLatDegrees
    };
  }

  getNumberOfXTilesAtLevel(level: number): number {
    const dims = this.levelDimensions.get(level);
    if (dims) {
      return dims.width;
    }
    // Fallback: assume standard doubling from level 0 (2 tiles)
    return 2 << level;
  }

  getNumberOfYTilesAtLevel(level: number): number {
    const dims = this.levelDimensions.get(level);
    if (dims) {
      return dims.height;
    }
    // Fallback: assume standard doubling from level 0 (1 tile)
    return 1 << level;
  }

  rectangleToNativeRectangle(rectangle: Rectangle): Rectangle {
    return rectangle;
  }

  positionToTileXY(position: any, level: number, result?: any): any {
    if (!defined(result)) {
      result = { x: 0, y: 0 };
    }

    const longitudeRad = position.longitude;
    const latitudeRad = position.latitude;

    const levelDim = this.levelDimensions.get(level);

    if (!levelDim) {
      // Fallback to uniform distribution using the full geographic rectangle
      const numberOfXTiles = this.getNumberOfXTilesAtLevel(level);
      const numberOfYTiles = this.getNumberOfYTilesAtLevel(level);
      const rectangle = this.rectangle;

      const rectWestDeg = rectangle.west * (180 / Math.PI);
      const rectEastDeg = rectangle.east * (180 / Math.PI);
      const rectNorthDeg = rectangle.north * (180 / Math.PI);
      const rectSouthDeg = rectangle.south * (180 / Math.PI);
      const longitudeDeg = longitudeRad * (180 / Math.PI);
      const latitudeDeg = latitudeRad * (180 / Math.PI);

      const xTileWidth = (rectEastDeg - rectWestDeg) / numberOfXTiles;
      const yTileHeight = (rectNorthDeg - rectSouthDeg) / numberOfYTiles;

      let xTileCoordinate = Math.floor(
        (longitudeDeg - rectWestDeg) / xTileWidth
      );
      if (xTileCoordinate >= numberOfXTiles) {
        xTileCoordinate = numberOfXTiles - 1;
      }
      if (xTileCoordinate < 0) {
        xTileCoordinate = 0;
      }

      let yTileCoordinate = Math.floor(
        (rectNorthDeg - latitudeDeg) / yTileHeight
      );
      if (yTileCoordinate >= numberOfYTiles) {
        yTileCoordinate = numberOfYTiles - 1;
      }
      if (yTileCoordinate < 0) {
        yTileCoordinate = 0;
      }

      result.x = xTileCoordinate;
      result.y = yTileCoordinate;
      return result;
    }

    const {
      tileWidthRadians,
      tileHeightRadians,
      topLeftLonRadians,
      topLeftLatRadians
    } = this.computeTileMetrics(levelDim);

    const totalWidthRadians = tileWidthRadians * levelDim.width;
    const totalHeightRadians = tileHeightRadians * levelDim.height;

    let deltaLon = longitudeRad - topLeftLonRadians;
    if (totalWidthRadians > 0) {
      deltaLon =
        ((deltaLon % totalWidthRadians) + totalWidthRadians) %
        totalWidthRadians;
    }

    let deltaLat = topLeftLatRadians - latitudeRad;
    if (totalHeightRadians > 0) {
      deltaLat =
        ((deltaLat % totalHeightRadians) + totalHeightRadians) %
        totalHeightRadians;
    }

    let xTileCoordinate = Math.floor(deltaLon / tileWidthRadians);
    if (!Number.isFinite(xTileCoordinate)) {
      xTileCoordinate = 0;
    }
    if (xTileCoordinate >= levelDim.width) {
      xTileCoordinate = levelDim.width - 1;
    }
    if (xTileCoordinate < 0) {
      xTileCoordinate = 0;
    }

    let yTileCoordinate = Math.floor(deltaLat / tileHeightRadians);
    if (!Number.isFinite(yTileCoordinate)) {
      yTileCoordinate = 0;
    }
    if (yTileCoordinate >= levelDim.height) {
      yTileCoordinate = levelDim.height - 1;
    }
    if (yTileCoordinate < 0) {
      yTileCoordinate = 0;
    }

    result.x = xTileCoordinate;
    result.y = yTileCoordinate;
    return result;
  }

  tileXYToRectangle(
    x: number,
    y: number,
    level: number,
    result?: Rectangle
  ): Rectangle {
    const levelDim = this.levelDimensions.get(level);

    if (!levelDim) {
      const numberOfXTiles = this.getNumberOfXTilesAtLevel(level);
      const numberOfYTiles = this.getNumberOfYTilesAtLevel(level);
      const rectangle = this.rectangle;
      const xTileWidth = (rectangle.east - rectangle.west) / numberOfXTiles;
      const yTileHeight = (rectangle.north - rectangle.south) / numberOfYTiles;

      const west = rectangle.west + x * xTileWidth;
      const east = rectangle.west + (x + 1) * xTileWidth;
      const north = rectangle.north - y * yTileHeight;
      const south = rectangle.north - (y + 1) * yTileHeight;

      if (!result) {
        return new Rectangle(west, south, east, north);
      }
      result.west = west;
      result.south = south;
      result.east = east;
      result.north = north;
      return result;
    }

    const {
      tileWidthRadians,
      tileHeightRadians,
      tileWidthDegrees,
      tileHeightDegrees,
      topLeftLonRadians,
      topLeftLatRadians,
      topLeftLonDegrees,
      topLeftLatDegrees,
      radiansPerPixel
    } = this.computeTileMetrics(levelDim);

    const west = topLeftLonRadians + x * tileWidthRadians;
    const east = topLeftLonRadians + (x + 1) * tileWidthRadians;
    const north = topLeftLatRadians - y * tileHeightRadians;
    const south = topLeftLatRadians - (y + 1) * tileHeightRadians;

    if (!result) {
      return new Rectangle(west, south, east, north);
    }

    result.west = west;
    result.south = south;
    result.east = east;
    result.north = north;
    return result;
  }

  tileXYToNativeRectangle(
    x: number,
    y: number,
    level: number,
    result?: any
  ): any {
    return this.tileXYToRectangle(x, y, level, result);
  }
}

/**
 * Custom Web Mercator Tiling Scheme that uses actual tile matrix dimensions from WMTS capabilities
 * instead of assuming power-of-2 doubling at each level.
 */
class CustomWebMercatorTilingScheme {
  private levelDimensions: Map<
    number,
    {
      width: number;
      height: number;
      topLeftCorner?: [number, number];
      scaleDenominator?: number;
      tileWidth?: number;
      tileHeight?: number;
    }
  >;
  private baseScheme: WebMercatorTilingScheme;
  public ellipsoid: Ellipsoid;
  public rectangle: Rectangle;
  public projection: any;
  public numberOfLevelZeroTilesX: number;
  public numberOfLevelZeroTilesY: number;

  constructor(
    levelDimensions: Map<
      number,
      {
        width: number;
        height: number;
        topLeftCorner?: [number, number];
        scaleDenominator?: number;
        tileWidth?: number;
        tileHeight?: number;
      }
    >
  ) {
    this.levelDimensions = levelDimensions;
    this.baseScheme = new WebMercatorTilingScheme();
    this.ellipsoid = this.baseScheme.ellipsoid;
    this.rectangle = this.baseScheme.rectangle;
    this.projection = this.baseScheme.projection;

    // Set the number of tiles at level 0
    const level0 = levelDimensions.get(0);
    this.numberOfLevelZeroTilesX = level0?.width ?? 1;
    this.numberOfLevelZeroTilesY = level0?.height ?? 1;
  }

  getNumberOfXTilesAtLevel(level: number): number {
    const dims = this.levelDimensions.get(level);
    if (dims) {
      return dims.width;
    }
    return this.baseScheme.getNumberOfXTilesAtLevel(level);
  }

  getNumberOfYTilesAtLevel(level: number): number {
    const dims = this.levelDimensions.get(level);
    if (dims) {
      return dims.height;
    }
    return this.baseScheme.getNumberOfYTilesAtLevel(level);
  }

  rectangleToNativeRectangle(rectangle: Rectangle): any {
    return this.baseScheme.rectangleToNativeRectangle(rectangle);
  }

  positionToTileXY(position: any, level: number, result?: any): any {
    const levelDim = this.levelDimensions.get(level);

    if (
      !levelDim ||
      !levelDim.scaleDenominator ||
      !levelDim.tileWidth ||
      !levelDim.tileHeight ||
      !levelDim.topLeftCorner
    ) {
      // Fallback to standard Web Mercator scheme
      return this.baseScheme.positionToTileXY(position, level, result);
    }

    if (!defined(result)) {
      result = { x: 0, y: 0 };
    }

    // Convert position to Web Mercator projection
    const webMercatorPos = this.projection.project(position);

    // Use ScaleDenominator to calculate actual tile size in meters
    const pixelSizeMeters = levelDim.scaleDenominator * 0.00028;
    const tileWidthMeters = levelDim.tileWidth * pixelSizeMeters;
    const tileHeightMeters = levelDim.tileHeight * pixelSizeMeters;

    // Convert TopLeftCorner from geographic to Web Mercator
    const topLeftGeo = Cartographic.fromDegrees(
      levelDim.topLeftCorner[0],
      levelDim.topLeftCorner[1]
    );
    const topLeftWebMercator = this.projection.project(topLeftGeo);

    const numberOfXTiles = levelDim.width;
    const numberOfYTiles = levelDim.height;

    let xTileCoordinate = Math.floor(
      (webMercatorPos.x - topLeftWebMercator.x) / tileWidthMeters
    );
    if (xTileCoordinate >= numberOfXTiles) {
      xTileCoordinate = numberOfXTiles - 1;
    }
    if (xTileCoordinate < 0) {
      xTileCoordinate = 0;
    }

    let yTileCoordinate = Math.floor(
      (topLeftWebMercator.y - webMercatorPos.y) / tileHeightMeters
    );
    if (yTileCoordinate >= numberOfYTiles) {
      yTileCoordinate = numberOfYTiles - 1;
    }
    if (yTileCoordinate < 0) {
      yTileCoordinate = 0;
    }

    result.x = xTileCoordinate;
    result.y = yTileCoordinate;
    return result;
  }

  tileXYToRectangle(
    x: number,
    y: number,
    level: number,
    result?: Rectangle
  ): Rectangle {
    const levelDim = this.levelDimensions.get(level);

    if (
      !levelDim ||
      !levelDim.scaleDenominator ||
      !levelDim.tileWidth ||
      !levelDim.tileHeight ||
      !levelDim.topLeftCorner
    ) {
      // Fallback to standard Web Mercator scheme
      return this.baseScheme.tileXYToRectangle(x, y, level, result);
    }

    // Use ScaleDenominator to calculate actual tile size in meters
    const pixelSizeMeters = levelDim.scaleDenominator * 0.00028;
    const tileWidthMeters = levelDim.tileWidth * pixelSizeMeters;
    const tileHeightMeters = levelDim.tileHeight * pixelSizeMeters;

    // Convert TopLeftCorner from geographic to Web Mercator
    const topLeftGeo = Cartographic.fromDegrees(
      levelDim.topLeftCorner[0],
      levelDim.topLeftCorner[1]
    );
    const topLeftWebMercator = this.projection.project(topLeftGeo);

    // Calculate bounds in Web Mercator meters
    const westMeters = topLeftWebMercator.x + x * tileWidthMeters;
    const eastMeters = topLeftWebMercator.x + (x + 1) * tileWidthMeters;
    const northMeters = topLeftWebMercator.y - y * tileHeightMeters;
    const southMeters = topLeftWebMercator.y - (y + 1) * tileHeightMeters;

    // Convert back to geographic coordinates (radians)
    const swCorner = this.projection.unproject(
      new Cartesian3(westMeters, southMeters, 0)
    );
    const neCorner = this.projection.unproject(
      new Cartesian3(eastMeters, northMeters, 0)
    );

    if (!result) {
      return new Rectangle(
        swCorner.longitude,
        swCorner.latitude,
        neCorner.longitude,
        neCorner.latitude
      );
    }

    result.west = swCorner.longitude;
    result.south = swCorner.latitude;
    result.east = neCorner.longitude;
    result.north = neCorner.latitude;
    return result;
  }

  tileXYToNativeRectangle(
    x: number,
    y: number,
    level: number,
    result?: any
  ): any {
    return this.baseScheme.tileXYToNativeRectangle(x, y, level, result);
  }
}

function extractTemplateTokens(template: string | undefined): string[] {
  if (!template) {
    return [];
  }
  const matches = template.match(/{([^}]+)}/g);
  if (!matches) {
    return [];
  }
  return matches.map((match) => match.slice(1, -1));
}

function parseTileMatrixLevel(identifier: unknown): number | undefined {
  if (!isDefined(identifier)) {
    return;
  }
  const text =
    typeof identifier === "string" ? identifier : identifier?.toString?.();
  if (!isDefined(text)) {
    return;
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  const afterColon = trimmed.substring(trimmed.lastIndexOf(":") + 1);
  const match = afterColon.match(/-?\d+(\.\d+)?/);
  const candidate = match ? match[0] : afterColon;
  const value = Number(candidate);
  return Number.isFinite(value) ? value : undefined;
}

function templateMatchesTileMatrixSet(
  template: string | undefined,
  tileMatrixSet: {
    id: string;
    projection: "EPSG:3857" | "EPSG:4326";
  }
): boolean {
  if (!template) {
    return false;
  }
  const lowerTemplate = template.toLowerCase();
  const idLower = tileMatrixSet.id.toLowerCase();
  if (idLower && lowerTemplate.includes(idLower)) {
    return true;
  }
  if (lowerTemplate.includes("{tilematrixset}")) {
    return true;
  }

  if (tileMatrixSet.projection === "EPSG:3857") {
    return (
      lowerTemplate.includes("epsg3857") ||
      lowerTemplate.includes("3857") ||
      lowerTemplate.includes("googlemaps") ||
      lowerTemplate.includes("mercator")
    );
  }

  return (
    lowerTemplate.includes("epsg4326") ||
    lowerTemplate.includes("crs84") ||
    lowerTemplate.includes("4326")
  );
}

export function getServiceContactInformation(contactInfo: ServiceProvider) {
  let text = "";
  if (contactInfo.ProviderName && contactInfo.ProviderName.length > 0) {
    text += contactInfo.ProviderName + "<br/>";
  }

  if (contactInfo.ProviderSite && contactInfo.ProviderSite["xlink:href"]) {
    text += contactInfo.ProviderSite["xlink:href"] + "<br/>";
  }

  const serviceContact = contactInfo.ServiceContact;
  if (serviceContact) {
    const invidualName = serviceContact.InvidualName;
    if (invidualName && invidualName.length > 0) {
      text += invidualName + "<br/>";
    }
    const contactInfo = serviceContact.ContactInfo?.Address;
    if (
      contactInfo &&
      isDefined(contactInfo.ElectronicMailAddress) &&
      contactInfo.ElectronicMailAddress.length > 0
    ) {
      text += `[${contactInfo.ElectronicMailAddress}](mailto:${contactInfo.ElectronicMailAddress})`;
    }
  }
  return text;
}

function buildLayerDimensionMap(layers: any): Map<string, DimensionSummary[]> {
  const result = new Map<string, DimensionSummary[]>();
  const layerArray = forceArray(layers);

  const visit = (layer: any, inherited: DimensionSummary[]) => {
    if (!layer) {
      return;
    }

    const identifier = layer.Identifier || layer.Name || layer.Title;
    const combined = getSingleLayerDimensionsFromCapabilities(layer, inherited);

    if (identifier) {
      result.set(identifier, combined);
    }

    forceArray(layer.Layer).forEach((child) => visit(child, combined));
  };

  layerArray.forEach((layer) => visit(layer, []));
  return result;
}

function getSingleLayerDimensionsFromCapabilities(
  layerInCapabilities: any,
  inheritedDimensions: DimensionSummary[]
): DimensionSummary[] {
  const inherited = inheritedDimensions ?? [];
  if (!layerInCapabilities || !layerInCapabilities.Dimension) {
    return inherited;
  }

  const dimensions = forceArray(layerInCapabilities.Dimension);
  const extents = forceArray(layerInCapabilities.Extent);

  const filteredInherited = inherited.filter(
    (inheritedDimension) =>
      !dimensions.some((dimension) => {
        const name = (
          dimension?.Identifier ||
          dimension?.name ||
          ""
        ).toString();
        return (
          name.length > 0 &&
          inheritedDimension.name &&
          name.toLowerCase() === inheritedDimension.name.toLowerCase()
        );
      })
  );

  const converted = dimensions.map((dimension) => {
    const name = (dimension?.Identifier || dimension?.name || "").toString();

    const extent = extents.find(
      (candidate: any) =>
        candidate?.name === dimension?.name ||
        candidate?.Identifier === dimension?.Identifier
    );
    const values = parseDimensionValues(dimension, extent);

    return {
      name,
      values,
      units: dimension?.units || dimension?.UOM, // WMTS uses UOM instead of units
      unitSymbol: dimension?.unitSymbol,
      default: dimension?.default || dimension?.Default || values[0],
      multipleValues: dimension?.multipleValues,
      nearestValue: dimension?.nearestValue,
      current: dimension?.current || dimension?.Current // WMTS has Current field
    } as DimensionSummary;
  });

  return mergeDimensionSummaries(filteredInherited, converted);
}

function mergeDimensionSummaries(
  inherited: DimensionSummary[],
  own: DimensionSummary[]
): DimensionSummary[] {
  const filteredInherited = inherited.filter(
    (dimension) =>
      !own.some(
        (candidate) =>
          candidate.name &&
          dimension.name &&
          candidate.name.toLowerCase() === dimension.name.toLowerCase()
      )
  );
  return filteredInherited.concat(own);
}

function parseDimensionValues(dimension: any, extent: any): string[] {
  const candidates: any[] = [];
  if (dimension?.Value !== undefined) {
    candidates.push(dimension.Value);
  }
  if (dimension?.Values !== undefined) {
    candidates.push(dimension.Values);
  }
  if (dimension?.text !== undefined) {
    candidates.push(dimension.text);
  }
  if (extent !== undefined) {
    if (typeof extent === "string") {
      candidates.push(extent);
    } else if (extent && typeof extent.text === "string") {
      candidates.push(extent.text);
    }
  }
  if (candidates.length === 0 && typeof dimension === "string") {
    candidates.push(dimension);
  }

  const values: string[] = [];
  candidates.forEach((candidate) => {
    forceArray(candidate)
      .map(extractDimensionText)
      .forEach((text) => {
        if (!text) {
          return;
        }
        const entries = text.includes(",") ? text.split(",") : [text];
        entries
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
          .forEach((entry) => values.push(entry));
      });
  });

  return values.filter((value) => value.length > 0);
}

function extractDimensionText(item: any): string | undefined {
  if (typeof item === "string") {
    return item;
  }
  if (typeof item === "number") {
    return item.toString();
  }
  if (!item) {
    return undefined;
  }
  if (typeof item.text === "string") {
    return item.text;
  }
  if (typeof item._text === "string") {
    return item._text;
  }
  if (typeof item.Value === "string") {
    return item.Value;
  }
  return undefined;
}

function forceArray<T>(value: T | T[] | readonly T[] | undefined): T[] {
  if (!isDefined(value)) {
    return [];
  }
  if (Array.isArray(value)) {
    return Array.from(value) as T[];
  }
  return [value as T];
}

function normalizeFeatureInfoType(
  type: string | undefined
): FeatureInfoFormatType {
  switch (type) {
    case "xml":
      return "xml";
    case "html":
      return "html";
    case "text":
    case "csv":
      return "text";
    case "json":
    default:
      return "json";
  }
}

function defaultInfoFormatForType(type: FeatureInfoFormatType): string {
  switch (type) {
    case "xml":
      return "text/xml";
    case "html":
      return "text/html";
    case "text":
      return "text/plain";
    case "json":
    default:
      return "application/json";
  }
}

function fetchResourceByFormat(
  resource: Resource,
  type: FeatureInfoFormatType
): Promise<any> | undefined {
  switch (type) {
    case "xml":
      return resource.fetchXML();
    case "html":
    case "text":
      return resource.fetchText();
    case "json":
    default:
      return resource.fetchJson();
  }
}

function mapFeatureInfoTypeToResourceResponseType(
  type: FeatureInfoFormatType
): "json" | "text" | "document" {
  switch (type) {
    case "xml":
      return "document";
    case "html":
    case "text":
      return "text";
    case "json":
    default:
      return "json";
  }
}

const templateTokenRegex = /\{\{\s*([^}]+?)\s*\}\}/g;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function applyTemplate(
  template: string | undefined,
  tokens: TemplateTokens
): string | undefined {
  if (!isDefined(template)) {
    return undefined;
  }
  return template.replace(templateTokenRegex, (match, rawToken) => {
    const key = String(rawToken).trim();
    const replacement = tokens[key];
    return replacement !== undefined ? replacement : match;
  });
}

function methodRequiresBody(method: string): boolean {
  switch (method) {
    case "POST":
    case "PUT":
    case "PATCH":
      return true;
    default:
      return false;
  }
}

function hasHeaderIgnoreCase(
  headers: Record<string, string>,
  headerName: string
): boolean {
  const target = headerName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function parseFeatureInfoResponse(
  data: any,
  type: FeatureInfoFormatType,
  format: string
): ImageryLayerFeatureInfo[] | undefined {
  const parser = new GetFeatureInfoFormat(type, format);

  // Use the parser's getFeatureInfoFromData method if available
  if (typeof (parser as any).getFeatureInfoFromData === "function") {
    return (parser as any).getFeatureInfoFromData(data);
  }

  // Fallback: try to parse based on type
  if (type === "json" && data) {
    // For JSON responses, wrap in ImageryLayerFeatureInfo if needed
    const features = Array.isArray(data.features)
      ? data.features
      : Array.isArray(data)
        ? data
        : [data];
    return features.map((feature: any) => {
      const info = new ImageryLayerFeatureInfo();
      info.data = feature;
      info.properties = feature.properties || feature;
      if (feature.geometry) {
        info.position = feature.geometry;
      }
      return info;
    });
  }

  // For other types, create a simple feature info object
  const info = new ImageryLayerFeatureInfo();
  info.data = data;
  return [info];
}

export default WebMapTileServiceCatalogItem;
