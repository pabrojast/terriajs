import i18next from "i18next";
import { computed, runInAction, makeObservable, override } from "mobx";
import defined from "terriajs-cesium/Source/Core/defined";
import WebMercatorTilingScheme from "terriajs-cesium/Source/Core/WebMercatorTilingScheme";
import Resource from "terriajs-cesium/Source/Core/Resource";
import ImageryLayerFeatureInfo from "terriajs-cesium/Source/Scene/ImageryLayerFeatureInfo";
import GetFeatureInfoFormat from "terriajs-cesium/Source/Scene/GetFeatureInfoFormat";
import WebMapTileServiceImageryProvider from "terriajs-cesium/Source/Scene/WebMapTileServiceImageryProvider";
import URI from "urijs";
import containsAny from "../../../Core/containsAny";
import createDiscreteTimesFromIsoSegments from "../../../Core/createDiscreteTimes";
import createTransformerAllowUndefined from "../../../Core/createTransformerAllowUndefined";
import filterOutUndefined from "../../../Core/filterOutUndefined";
import isDefined from "../../../Core/isDefined";
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
  WebMapTileServiceAvailableDimensionTraits,
  WebMapTileServiceAvailableLayerDimensionsTraits,
  WebMapTileServiceAvailableLayerStylesTraits
} from "../../../Traits/TraitsClasses/WebMapTileServiceCatalogItemTraits";
import isReadOnlyArray from "../../../Core/isReadOnlyArray";
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

interface UsableTileMatrixSets {
  identifiers: string[];
  tileWidth: number;
  tileHeight: number;
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
    return buildLayerDimensionMap(this.capabilities?.json?.Contents?.Layer);
  }

  @computed
  get currentLayerDimensions(): DimensionSummary[] | undefined {
    const layerName = this.catalogItem.layer ?? this.layer;
    if (!layerName) {
      return;
    }
    return this.layerDimensions.get(layerName);
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
        tileHeight: 256
      }
    };

    const standardTilingScheme = new WebMercatorTilingScheme();

    const matrixSets = this.capabilities.tileMatrixSets;
    if (matrixSets === undefined) {
      return;
    }
    for (let i = 0; i < matrixSets.length; i++) {
      const matrixSet = matrixSets[i];
      if (
        !matrixSet.SupportedCRS ||
        (!/EPSG.*900913/.test(matrixSet.SupportedCRS) &&
          !/EPSG.*3857/.test(matrixSet.SupportedCRS))
      ) {
        continue;
      }
      // Usable tile matrix sets must have a single 256x256 tile at the root.
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
      const rectangleInMeters = standardTilingScheme.rectangleToNativeRectangle(
        standardTilingScheme.rectangle
      );
      if (
        Math.abs(startX - rectangleInMeters.west) > 1 ||
        Math.abs(startY - rectangleInMeters.north) > 1
      ) {
        continue;
      }

      if (defined(matrixSet.TileMatrix) && matrixSet.TileMatrix.length > 0) {
        const ids = matrixSet.TileMatrix.map(function (item) {
          return item.Identifier;
        });
        const firstTile = matrixSet.TileMatrix[0];
        usableTileMatrixSets[matrixSet.Identifier] = {
          identifiers: ids,
          tileWidth: firstTile.TileWidth,
          tileHeight: firstTile.TileHeight
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
    return (
      this.getFeatureInfoUrl ??
      this.capabilitiesStratum?.featureInfoUrl ??
      this.url ??
      this.getCapabilitiesUrl
    );
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
    (
      timeTag: string | undefined
    ): WebMapTileServiceImageryProvider | undefined => {
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

      const formatCandidates = forceArray(layer.Format).map((item) =>
        typeof item === "string" ? item : item?.toString?.() ?? ""
      );
      const format = formatCandidates.includes("image/png")
        ? "image/png"
        : formatCandidates.includes("image/jpeg")
        ? "image/jpeg"
        : "image/png";

      const resourceUrl: ResourceUrl | ResourceUrl[] | undefined =
        layer.ResourceURL;
      let baseUrl: string = new URI(this.url).search("").toString();
      if (resourceUrl) {
        const candidates = Array.isArray(resourceUrl)
          ? resourceUrl
          : [resourceUrl];
        for (const candidate of candidates) {
          if (
            candidate.format.indexOf(format) !== -1 ||
            candidate.format.indexOf("png") !== -1
          ) {
            baseUrl = candidate.template;
            break;
          }
        }
      }

      const tileMatrixSet = this.tileMatrixSet;
      if (!isDefined(tileMatrixSet)) {
        return undefined;
      }

      const dimensions: Record<string, string> = { ...(this.dimensions ?? {}) };
      const defaults = stratum.currentLayerDimensions ?? [];
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
        dimensions.time = timeTag;
      }

      Object.keys(dimensions).forEach((key) => {
        const value = dimensions[key];
        if (value === undefined || value === null || value === "") {
          delete dimensions[key];
        }
      });

      const imageryProvider = new WebMapTileServiceImageryProvider({
        url: proxyCatalogItemUrl(this, baseUrl),
        layer: layerIdentifier,
        style: this.style,
        tileMatrixSetID: tileMatrixSet.id,
        tileMatrixLabels: tileMatrixSet.labels,
        minimumLevel: this.minimumLevel ?? tileMatrixSet.minLevel,
        maximumLevel: this.maximumLevel ?? tileMatrixSet.maxLevel,
        tileWidth: this.tileWidth ?? tileMatrixSet.tileWidth,
        tileHeight:
          this.tileHeight ?? this.minimumLevel ?? tileMatrixSet.tileHeight,
        tilingScheme: new WebMercatorTilingScheme(),
        format,
        credit: this.attribution,
        dimensions: Object.keys(dimensions).length > 0 ? dimensions : undefined
      });

      imageryProvider.enablePickFeatures = this.allowFeaturePicking;
      if (this.allowFeaturePicking) {
        imageryProvider.pickFeatures = (x, y, level, longitude, latitude) =>
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

  @computed
  get tileMatrixSet():
    | {
        id: string;
        labels: string[];
        maxLevel: number;
        minLevel: number;
        tileWidth: number;
        tileHeight: number;
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

    let tileMatrixSetId: string =
      "urn:ogc:def:wkss:OGC:1.0:GoogleMapsCompatible";
    let maxLevel: number = 0;
    let minLevel: number = 0;
    let tileWidth: number = 256;
    let tileHeight: number = 256;
    let tileMatrixSetLabels: string[] = [];
    for (let i = 0; i < tileMatrixSetLinks.length; i++) {
      const tileMatrixSet = tileMatrixSetLinks[i].TileMatrixSet;
      if (usableTileMatrixSets && usableTileMatrixSets[tileMatrixSet]) {
        tileMatrixSetId = tileMatrixSet;
        tileMatrixSetLabels = usableTileMatrixSets[tileMatrixSet].identifiers;
        tileWidth = Number(usableTileMatrixSets[tileMatrixSet].tileWidth);
        tileHeight = Number(usableTileMatrixSets[tileMatrixSet].tileHeight);
        break;
      }
    }

    if (Array.isArray(tileMatrixSetLabels)) {
      const levels = tileMatrixSetLabels.map((label) => {
        const lastIndex = label.lastIndexOf(":");
        return Math.abs(Number(label.substring(lastIndex + 1)));
      });
      maxLevel = levels.reduce((currentMaximum, level) => {
        return level > currentMaximum ? level : currentMaximum;
      }, 0);
      minLevel = levels.reduce((currentMaximum, level) => {
        return level < currentMaximum ? level : currentMaximum;
      }, 0);
    }

    return {
      id: tileMatrixSetId,
      labels: tileMatrixSetLabels,
      maxLevel: maxLevel,
      minLevel: minLevel,
      tileWidth: tileWidth,
      tileHeight: tileHeight
    };
  }

  private pickFeatures(
    imageryProvider: WebMapTileServiceImageryProvider,
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

    const featureInfoUrl = this.featureInfoEndpoint;
    if (!featureInfoUrl) {
      return undefined;
    }

    const tileMatrixSet = this.tileMatrixSet;
    if (!tileMatrixSet) {
      return undefined;
    }

    const stratum = this.capabilitiesStratum;
    const layerName = this.layer ?? stratum?.layer;
    if (!layerName) {
      return undefined;
    }

    const { type, format } = this.featureInfoFormatOptions;
    const parser = new GetFeatureInfoFormat(type, format);

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
      tileMatrixSet.labels && tileMatrixSet.labels[level]
        ? tileMatrixSet.labels[level]
        : level.toString();

    const query: Record<string, string> = {
      SERVICE: "WMTS",
      VERSION: "1.0.0",
      REQUEST: "GetFeatureInfo",
      LAYER: layerName,
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

    const dimensionParams = this.dimensions ?? {};
    Object.entries(dimensionParams).forEach(([key, value]) => {
      const stringValue =
        value === undefined || value === null ? undefined : String(value);
      addDimensionParam(key, stringValue);
    });

    const extraParams = this.getFeatureInfoParameters ?? {};
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        query[key] = String(value);
      }
    });

    const uri = new URI(featureInfoUrl);
    Object.entries(query).forEach(([key, value]) => uri.addQuery(key, value));

    const resource = new Resource({
      url: proxyCatalogItemUrl(this, uri.toString())
    });

    let fetchPromise: Promise<any> | undefined;
    switch (type) {
      case "xml":
        fetchPromise = resource.fetchXML();
        break;
      case "html":
      case "text":
        fetchPromise = resource.fetchText();
        break;
      default:
        fetchPromise = resource.fetchJson();
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
          return parser.callback(data) as ImageryLayerFeatureInfo[];
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

    imageryProvider.enablePickFeatures = this.allowFeaturePicking;

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

    const combined = getSingleLayerDimensionsFromCapabilities(layer, inherited);
    const identifier = layer.Identifier || layer.Name || layer.Title;
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
      units: dimension?.units,
      unitSymbol: dimension?.unitSymbol,
      default: dimension?.default || dimension?.Default || values[0],
      multipleValues: dimension?.multipleValues,
      nearestValue: dimension?.nearestValue
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

function forceArray<T>(value: T | T[] | undefined): T[] {
  if (!isDefined(value)) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
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

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export default WebMapTileServiceCatalogItem;
