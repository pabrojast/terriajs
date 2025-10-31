import i18next from "i18next";
import L, { TileEvent } from "leaflet";
import {
  autorun,
  computed,
  IReactionDisposer,
  observable,
  makeObservable
} from "mobx";
import Cartesian2 from "terriajs-cesium/Source/Core/Cartesian2";
import Cartographic from "terriajs-cesium/Source/Core/Cartographic";
import CesiumCredit from "terriajs-cesium/Source/Core/Credit";
import defined from "terriajs-cesium/Source/Core/defined";
import CesiumEvent from "terriajs-cesium/Source/Core/Event";
import CesiumMath from "terriajs-cesium/Source/Core/Math";
import TileProviderError from "terriajs-cesium/Source/Core/TileProviderError";
import WebMercatorTilingScheme from "terriajs-cesium/Source/Core/WebMercatorTilingScheme";
import ImageryLayerFeatureInfo from "terriajs-cesium/Source/Scene/ImageryLayerFeatureInfo";
import ImageryProvider from "terriajs-cesium/Source/Scene/ImageryProvider";
import SplitDirection from "terriajs-cesium/Source/Scene/SplitDirection";
import isDefined from "../../Core/isDefined";
import TerriaError from "../../Core/TerriaError";
import Leaflet from "../../Models/Leaflet";
import getUrlForImageryTile from "../ImageryProvider/getUrlForImageryTile";
import { ProviderCoords } from "../PickedFeatures/PickedFeatures";

const swScratch = new Cartographic();
const neScratch = new Cartographic();
const swTileCoordinatesScratch = new Cartesian2();
const neTileCoordinatesScratch = new Cartesian2();

interface LeafletLevelInfo {
  level: number;
  leafletZoom: number;
}

class Credit extends CesiumCredit {
  _shownInLeaflet?: boolean;
  _shownInLeafletLastUpdate?: boolean;
}

export default class ImageryProviderLeafletTileLayer extends L.TileLayer {
  readonly tileSize = 256;
  readonly errorEvent = new CesiumEvent();

  private initialized = false;
  private _usable = false;
  private _delayedUpdate?: number;
  private _zSubtract = 0;
  private _requestImageError: TileProviderError | undefined;
  private _previousCredits: Credit[] = [];
  private _leafletUpdateInterval: number;
  private _useCustomTilingScheme: boolean = false;
  private _levelInfos?: LeafletLevelInfo[];

  @observable splitDirection = SplitDirection.NONE;
  @observable splitPosition: number = 0.5;

  constructor(
    private leaflet: Leaflet,
    readonly imageryProvider: ImageryProvider,
    options: L.TileLayerOptions = {}
  ) {
    super(undefined as any, {
      ...options,
      updateInterval: defined((imageryProvider as any)._leafletUpdateInterval)
        ? (imageryProvider as any)._leafletUpdateInterval
        : 100
    });
    makeObservable(this);
    this.imageryProvider = imageryProvider;
    this._useCustomTilingScheme = !(
      imageryProvider.tilingScheme instanceof WebMercatorTilingScheme
    );

    // Handle splitter rection (and disposing reaction)
    let disposeSplitterReaction: IReactionDisposer | undefined;
    this.on("add", () => {
      if (!disposeSplitterReaction) {
        disposeSplitterReaction = this._reactToSplitterChange();
      }
    });
    this.on("remove", () => {
      if (disposeSplitterReaction) {
        disposeSplitterReaction();
        disposeSplitterReaction = undefined;
      }
    });

    this._leafletUpdateInterval = defined(
      (imageryProvider as any)._leafletUpdateInterval
    )
      ? (imageryProvider as any)._leafletUpdateInterval
      : 100;

    // Hack to fix "Space between tiles on fractional zoom levels in Webkit browsers" (https://github.com/Leaflet/Leaflet/issues/3575#issuecomment-688644225)
    this.on("tileloadstart", (event: TileEvent) => {
      event.tile.style.width = this.getTileSize().x + 0.5 + "px";
      event.tile.style.height = this.getTileSize().y + 0.5 + "px";
    });
  }

  _reactToSplitterChange() {
    return autorun(() => {
      const container = this.getContainer();
      if (container === null) {
        return;
      }

      if (this.splitDirection === SplitDirection.LEFT) {
        const { left: clipLeft } = this._clipsForSplitter;
        container.style.clip = clipLeft;
      } else if (this.splitDirection === SplitDirection.RIGHT) {
        const { right: clipRight } = this._clipsForSplitter;
        container.style.clip = clipRight;
      } else {
        container.style.clip = "auto";
      }
    });
  }

  @computed
  get _clipsForSplitter() {
    let clipLeft = "";
    let clipRight = "";
    let clipPositionWithinMap;
    let clipX;

    if (this.leaflet.size && this.leaflet.nw && this.leaflet.se) {
      clipPositionWithinMap = this.leaflet.size.x * this.splitPosition;
      clipX = Math.round(this.leaflet.nw.x + clipPositionWithinMap);
      clipLeft =
        "rect(" +
        [this.leaflet.nw.y, clipX, this.leaflet.se.y, this.leaflet.nw.x].join(
          "px,"
        ) +
        "px)";
      clipRight =
        "rect(" +
        [this.leaflet.nw.y, this.leaflet.se.x, this.leaflet.se.y, clipX].join(
          "px,"
        ) +
        "px)";
    }
    return {
      left: clipLeft,
      right: clipRight,
      clipPositionWithinMap: clipPositionWithinMap,
      clipX: clipX
    };
  }

  _tileOnError(_done: unknown, _tile: unknown, _e: unknown) {
    // Do nothing, we'll handle tile errors separately.
  }

  createTile(coords: L.Coords, done: L.DoneCallback) {
    // Create a tile (Image) as normal.
    const tile = super.createTile(coords, done) as HTMLImageElement;

    // By default, Leaflet handles tile load errors by setting the Image to the error URL and raising
    // an error event.  We want to first raise an error event that optionally returns a promise and
    // retries after the promise resolves.

    const _doRequest = (waitPromise?: any) => {
      if (waitPromise) {
        waitPromise
          .then(function () {
            _doRequest();
          })
          .catch((e: unknown) => {
            // The tile has failed irrecoverably, so invoke Leaflet's standard
            // tile error handler.
            (L.TileLayer as any).prototype._tileOnError.call(
              this,
              done,
              tile,
              e
            );
          });
        return;
      }

      // Setting src will trigger a new load or error event, even if the
      // new src is the same as the old one.
      const tileUrl = this.getTileUrl(coords);
      if (isDefined(tileUrl)) {
        tile.src = tileUrl;
      }
    };

    L.DomEvent.on(tile, "error", (e) => {
      const level = (this as any)._getLevelFromZ(coords);
      const message = i18next.t("map.cesium.failedToObtain", {
        x: coords.x,
        y: coords.y,
        level: level
      });
      this._requestImageError = TileProviderError.reportError(
        this._requestImageError!, // TODO: Cesium type definitions incorrectly forbid undefined
        this.imageryProvider,
        this.imageryProvider.errorEvent,
        message,
        coords.x,
        coords.y,
        level,
        e as any
        // TODO: bring terriajs-cesium retry logic to cesium
        //doRequest
      );
    });

    return tile;
  }

  getTileUrl(tilePoint: L.Coords): string {
    const errorTileUrl = this.options.errorTileUrl || "";
    if (!this._useCustomTilingScheme) {
      const level = this._getLevelFromZ(tilePoint);
      if (level < 0) {
        return errorTileUrl;
      }
      return (
        getUrlForImageryTile(
          this.imageryProvider,
          tilePoint.x,
          tilePoint.y,
          level
        ) || errorTileUrl
      );
    }

    const providerLevel = this._leafletZoomToProviderLevel(tilePoint.z);
    if (providerLevel < 0) {
      return errorTileUrl;
    }

    const coords = this._computeProviderTileCoordinates(
      tilePoint,
      providerLevel
    );
    if (!coords) {
      return errorTileUrl;
    }

    return (
      getUrlForImageryTile(
        this.imageryProvider,
        coords.x,
        coords.y,
        providerLevel
      ) || errorTileUrl
    );
  }

  _getLevelFromZ(tilePoint: L.Coords) {
    return tilePoint.z - this._zSubtract;
  }

  _update(...args: unknown[]) {
    if (!this.initialized) {
      this.initialized = true;

      // Cancel the existing delayed update, if any.
      if (this._delayedUpdate) {
        clearTimeout(this._delayedUpdate);
        this._delayedUpdate = undefined;
      }

      this._delayedUpdate = setTimeout(() => {
        this._delayedUpdate = undefined;

        // If we're no longer attached to a map, do nothing.
        if (!this._map) {
          return;
        }

        const tilingScheme = this.imageryProvider.tilingScheme;
        if (tilingScheme instanceof WebMercatorTilingScheme) {
          if (
            tilingScheme.getNumberOfXTilesAtLevel(0) === 2 &&
            tilingScheme.getNumberOfYTilesAtLevel(0) === 2
          ) {
            this._zSubtract = 1;
          } else if (
            tilingScheme.getNumberOfXTilesAtLevel(0) !== 1 ||
            tilingScheme.getNumberOfYTilesAtLevel(0) !== 1
          ) {
            this.errorEvent.raiseEvent(
              this,
              i18next.t("map.cesium.unusalTilingScheme")
            );
            return;
          }
        } else {
          this._zSubtract = 0;
          this._ensureLevelInfos();
        }

        if (isDefined(this.imageryProvider.maximumLevel)) {
          this.options.maxNativeZoom = this.imageryProvider.maximumLevel;
        } else if (this._useCustomTilingScheme && this._levelInfos?.length) {
          const maxZoom =
            this._levelInfos[this._levelInfos.length - 1].leafletZoom;
          this.options.maxNativeZoom = Math.ceil(maxZoom);
        }

        if (defined(this.imageryProvider.minimumLevel)) {
          this.options.minNativeZoom = this.imageryProvider.minimumLevel;
        } else if (this._useCustomTilingScheme) {
          this.options.minNativeZoom = 0;
        }

        if (isDefined(this.imageryProvider.credit)) {
          (this._map as any).attributionControl.addAttribution(
            getCreditHtml(this.imageryProvider.credit)
          );
        }

        this._usable = true;

        this._update();
      }, this._leafletUpdateInterval) as any;
    }

    if (this._usable) {
      (L.TileLayer as any).prototype._update.apply(this, args);

      this._updateAttribution();
    }
  }

  _updateAttribution() {
    if (!this._usable || !isDefined(this.imageryProvider.getTileCredits)) {
      return;
    }

    for (let i = 0; i < this._previousCredits.length; ++i) {
      this._previousCredits[i]._shownInLeafletLastUpdate =
        this._previousCredits[i]._shownInLeaflet;
      this._previousCredits[i]._shownInLeaflet = false;
    }

    const bounds = this._map.getBounds();
    const leafletZoom = this._map.getZoom();
    const providerLevel = this._useCustomTilingScheme
      ? this._leafletZoomToProviderLevel(leafletZoom)
      : leafletZoom - this._zSubtract;

    const tilingScheme = this.imageryProvider.tilingScheme;

    swScratch.longitude = Math.max(
      CesiumMath.negativePiToPi(CesiumMath.toRadians(bounds.getWest())),
      tilingScheme.rectangle.west
    );
    swScratch.latitude = Math.max(
      CesiumMath.toRadians(bounds.getSouth()),
      tilingScheme.rectangle.south
    );
    let sw = tilingScheme.positionToTileXY(
      swScratch,
      providerLevel,
      swTileCoordinatesScratch
    );
    if (!isDefined(sw)) {
      sw = swTileCoordinatesScratch;
      sw.x = 0;
      sw.y = tilingScheme.getNumberOfYTilesAtLevel(providerLevel) - 1;
    }

    neScratch.longitude = Math.min(
      CesiumMath.negativePiToPi(CesiumMath.toRadians(bounds.getEast())),
      tilingScheme.rectangle.east
    );
    neScratch.latitude = Math.min(
      CesiumMath.toRadians(bounds.getNorth()),
      tilingScheme.rectangle.north
    );
    let ne = tilingScheme.positionToTileXY(
      neScratch,
      providerLevel,
      neTileCoordinatesScratch
    );
    if (!isDefined(ne)) {
      ne = neTileCoordinatesScratch;
      ne.x = tilingScheme.getNumberOfXTilesAtLevel(providerLevel) - 1;
      ne.y = 0;
    }

    const nextCredits = [];

    for (let j = ne.y; j <= sw.y; ++j) {
      for (let i = sw.x; i <= ne.x; ++i) {
        const credits = this.imageryProvider.getTileCredits(
          CesiumMath.mod(
            i,
            tilingScheme.getNumberOfXTilesAtLevel(providerLevel)
          ),
          j,
          providerLevel
        ) as Credit[];
        if (!defined(credits)) {
          continue;
        }

        for (let k = 0; k < credits.length; ++k) {
          const credit = credits[k];
          if (credit._shownInLeaflet) {
            continue;
          }

          credit._shownInLeaflet = true;
          nextCredits.push(credit);

          if (!credit._shownInLeafletLastUpdate) {
            (this._map as any).attributionControl.addAttribution(
              getCreditHtml(credit)
            );
          }
        }
      }
    }

    // Remove attributions that applied last update but not this one.
    for (let i = 0; i < this._previousCredits.length; ++i) {
      if (!this._previousCredits[i]._shownInLeaflet) {
        (this._map as any).attributionControl.removeAttribution(
          getCreditHtml(this._previousCredits[i])
        );
        this._previousCredits[i]._shownInLeafletLastUpdate = false;
      }
    }

    this._previousCredits = nextCredits;
  }

  private _ensureLevelInfos() {
    if (!this._useCustomTilingScheme || this._levelInfos) {
      return;
    }
    const tilingScheme = this.imageryProvider.tilingScheme;
    const worldWidthRadians =
      tilingScheme.rectangle.east - tilingScheme.rectangle.west;
    const worldHeightRadians =
      tilingScheme.rectangle.north - tilingScheme.rectangle.south;
    const minLevel = this.imageryProvider.minimumLevel ?? 0;
    const maxLevel = isDefined(this.imageryProvider.maximumLevel)
      ? this.imageryProvider.maximumLevel!
      : minLevel;
    const infos: LeafletLevelInfo[] = [];
    for (let level = minLevel; level <= maxLevel; level++) {
      try {
        const rect = tilingScheme.tileXYToRectangle(0, 0, level);
        const tileWidthRadians = rect.east - rect.west;
        const tileHeightRadians = rect.north - rect.south;
        if (
          !isFinite(tileWidthRadians) ||
          !isFinite(tileHeightRadians) ||
          tileWidthRadians <= 0 ||
          tileHeightRadians <= 0
        ) {
          continue;
        }
        const zoomX = Math.log2(worldWidthRadians / tileWidthRadians);
        const zoomY = Math.log2(worldHeightRadians / tileHeightRadians);
        const leafletZoom = (zoomX + zoomY) / 2;
        infos.push({ level, leafletZoom });
      } catch {
        break;
      }
    }
    if (infos.length > 0) {
      this._levelInfos = infos;
    }
  }

  private _leafletZoomToProviderLevel(leafletZoom: number): number {
    if (!this._useCustomTilingScheme) {
      return Math.max(0, Math.round(leafletZoom - this._zSubtract));
    }
    this._ensureLevelInfos();
    const infos = this._levelInfos;
    if (!infos || infos.length === 0) {
      return Math.max(0, Math.round(leafletZoom));
    }
    let best = infos[0];
    let bestDiff = Math.abs(leafletZoom - best.leafletZoom);
    for (const info of infos) {
      const diff = Math.abs(leafletZoom - info.leafletZoom);
      if (diff < bestDiff) {
        best = info;
        bestDiff = diff;
      } else if (diff === bestDiff && info.leafletZoom > best.leafletZoom) {
        best = info;
      }
    }
    return best.level;
  }

  private _computeProviderTileCoordinates(
    tilePoint: L.Coords,
    providerLevel: number
  ):
    | {
        x: number;
        y: number;
      }
    | undefined {
    const tilingScheme = this.imageryProvider.tilingScheme;
    const worldTileCount = Math.pow(2, tilePoint.z);
    if (!isFinite(worldTileCount) || worldTileCount <= 0) {
      return undefined;
    }
    const wrappedX = CesiumMath.mod(tilePoint.x, worldTileCount);
    const clampedY = CesiumMath.clamp(tilePoint.y, 0, worldTileCount - 1);
    const longitudeRadians =
      ((wrappedX + 0.5) / worldTileCount) * CesiumMath.TWO_PI - Math.PI;
    const mercatorY =
      Math.PI - (2.0 * Math.PI * (clampedY + 0.5)) / worldTileCount;
    const latitudeRadians = Math.atan(Math.sinh(mercatorY));
    const cartographic = new Cartographic(
      CesiumMath.negativePiToPi(longitudeRadians),
      CesiumMath.clamp(
        latitudeRadians,
        tilingScheme.rectangle.south,
        tilingScheme.rectangle.north
      )
    );
    const result = tilingScheme.positionToTileXY(
      cartographic,
      providerLevel,
      new Cartesian2()
    );
    if (!isDefined(result)) {
      return undefined;
    }
    const numberOfXTiles = tilingScheme.getNumberOfXTilesAtLevel(providerLevel);
    const numberOfYTiles = tilingScheme.getNumberOfYTilesAtLevel(providerLevel);
    return {
      x: CesiumMath.mod(
        Math.floor(result.x),
        numberOfXTiles > 0 ? numberOfXTiles : 1
      ),
      y: CesiumMath.clamp(
        Math.floor(result.y),
        0,
        numberOfYTiles > 0 ? numberOfYTiles - 1 : 0
      )
    };
  }

  async getFeaturePickingCoords(
    map: L.Map,
    longitudeRadians: number,
    latitudeRadians: number
  ): Promise<ProviderCoords> {
    const ll = new Cartographic(
      CesiumMath.negativePiToPi(longitudeRadians),
      latitudeRadians,
      0.0
    );
    const level = this._useCustomTilingScheme
      ? this._leafletZoomToProviderLevel(map.getZoom())
      : Math.round(map.getZoom());

    const tilingScheme = this.imageryProvider.tilingScheme;
    const coords = tilingScheme.positionToTileXY(ll, level);
    return {
      x: coords.x,
      y: coords.y,
      level: level
    };
  }

  async pickFeatures(
    x: number,
    y: number,
    level: number,
    longitudeRadians: number,
    latitudeRadians: number
  ): Promise<ImageryLayerFeatureInfo[] | undefined> {
    try {
      return await this.imageryProvider.pickFeatures(
        x,
        y,
        level,
        longitudeRadians,
        latitudeRadians
      );
    } catch (e) {
      TerriaError.from(
        e,
        `An error ocurred while calling \`ImageryProvider#.pickFeatures\`. \`ImageryProvider.url = ${
          (this.imageryProvider as any).url
        }\``
      ).log();
    }
  }

  onRemove(map: L.Map) {
    if (this._delayedUpdate) {
      clearTimeout(this._delayedUpdate);
      this._delayedUpdate = undefined;
    }

    for (let i = 0; i < this._previousCredits.length; ++i) {
      this._previousCredits[i]._shownInLeafletLastUpdate = false;
      this._previousCredits[i]._shownInLeaflet = false;
      (map as any).attributionControl.removeAttribution(
        getCreditHtml(this._previousCredits[i])
      );
    }

    if (this._usable && defined(this.imageryProvider.credit)) {
      (map as any).attributionControl.removeAttribution(
        getCreditHtml(this.imageryProvider.credit)
      );
    }

    L.TileLayer.prototype.onRemove.apply(this, [map]);

    // Check that this cancels tile requests when dragging the time slider and rapidly creating
    // and destroying layers.  If the image requests for previous times/layers are allowed to hang
    // around, they clog up the pipeline and it takes approximately forever for the browser
    // to get around to downloading the tiles that are actually needed.
    this._abortLoading();
    return this;
  }
}

function getCreditHtml(credit: Credit) {
  return credit.element.outerHTML;
}
