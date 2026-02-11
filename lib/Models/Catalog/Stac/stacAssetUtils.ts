export interface StacAssetLike {
  href?: string;
  title?: string;
  description?: string;
  type?: string;
  roles?: string[];
  "auth:refs"?: string[];
}

export interface StacPreviewAsset {
  key: string;
  asset: StacAssetLike;
  resolvedHref: string;
}

export type StacLngLatBbox = [number, number, number, number];

interface TerrascopeViewerUrlOptions {
  collectionId?: string;
  bbox?: number[];
  datetime?: string | null;
}

interface StacAssetAccessLinkOptions {
  asset: StacAssetLike;
  resolvedAssetHref?: string;
  catalogUrl?: string;
  terrascopeViewerUrl?: string;
}

interface StacPreviewPreferenceOptions {
  asset?: StacAssetLike;
  resolvedAssetHref?: string;
  catalogUrl?: string;
}

export function resolveStacHref(
  href: string | undefined,
  baseUrl: string | undefined
): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

export function isStacAssetAuthProtected(
  asset: StacAssetLike | undefined
): boolean {
  return Array.isArray(asset?.["auth:refs"]) && asset["auth:refs"].length > 0;
}

export function isTerrascopeUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.toLowerCase().endsWith("terrascope.be");
  } catch {
    return false;
  }
}

export function findStacPreviewAsset(
  assets: Record<string, StacAssetLike> | undefined,
  baseUrl: string | undefined
): StacPreviewAsset | undefined {
  const previewAssets = findStacPreviewAssets(assets, baseUrl);
  return previewAssets[0];
}

export function findStacPreviewAssets(
  assets: Record<string, StacAssetLike> | undefined,
  baseUrl: string | undefined
): StacPreviewAsset[] {
  if (!assets) return [];

  const previewAssets = Object.entries(assets)
    .map(([key, asset]) => {
      const resolvedHref = resolveStacHref(asset.href, baseUrl);
      if (!resolvedHref) return undefined;
      return {
        key,
        asset,
        resolvedHref,
        score: previewAssetScore(key, asset)
      };
    })
    .filter(
      (
        entry
      ): entry is {
        key: string;
        asset: StacAssetLike;
        resolvedHref: string;
        score: number;
      } => entry !== undefined && entry.score > 0
    )
    .sort((a, b) => b.score - a.score);

  return previewAssets.map((previewAsset) => ({
    key: previewAsset.key,
    asset: previewAsset.asset,
    resolvedHref: previewAsset.resolvedHref
  }));
}

/**
 * Normalize STAC bbox values into a 2D [west, south, east, north] tuple.
 *
 * STAC allows 2*n bbox arrays (eg 6 values in 3D): [xmin, ymin, zmin, xmax, ymax, zmax].
 * For >2D bboxes we take min/max lon/lat from the first two dimensions.
 */
export function normalizeStacBbox(
  bbox: number[] | undefined | null
): StacLngLatBbox | undefined {
  if (!Array.isArray(bbox) || bbox.length < 4) return undefined;

  let west: number;
  let south: number;
  let east: number;
  let north: number;

  if (bbox.length === 4) {
    [west, south, east, north] = bbox;
  } else if (bbox.length % 2 === 0) {
    const dimensions = bbox.length / 2;
    west = bbox[0];
    south = bbox[1];
    east = bbox[dimensions];
    north = bbox[dimensions + 1];
  } else {
    [west, south, east, north] = bbox;
  }

  if (![west, south, east, north].every(Number.isFinite)) return undefined;

  // Sanity checks for geographic coordinates
  if (
    west < -180 ||
    west > 180 ||
    east < -180 ||
    east > 180 ||
    south < -90 ||
    south > 90 ||
    north < -90 ||
    north > 90
  ) {
    return undefined;
  }

  // Degenerate bbox
  if (south >= north || west === east) return undefined;

  return [west, south, east, north];
}

export function hasValidCesiumRectangle(
  rectangle:
    | {
        west?: number;
        south?: number;
        east?: number;
        north?: number;
      }
    | undefined
    | null
): rectangle is {
  west: number;
  south: number;
  east: number;
  north: number;
} {
  if (!rectangle) return false;
  return (
    Number.isFinite(rectangle.west) &&
    Number.isFinite(rectangle.south) &&
    Number.isFinite(rectangle.east) &&
    Number.isFinite(rectangle.north)
  );
}

export function buildTerrascopeViewerUrl(
  options: TerrascopeViewerUrlOptions
): string | undefined {
  if (!options.collectionId) return undefined;

  const viewerUrl = new URL("https://viewer.terrascope.be/");
  viewerUrl.searchParams.set("language", "en");
  viewerUrl.searchParams.set("overlay", "true");
  viewerUrl.searchParams.set("bgLayer", "OSM");

  const bbox = normalizeStacBbox(options.bbox);
  if (bbox) {
    viewerUrl.searchParams.set("bbox", bbox.join(","));
  }

  const isoDate = toIsoDate(options.datetime);
  if (isoDate) {
    viewerUrl.searchParams.set("date", isoDate);
  }

  const layerSuffix = inferTerrascopeLayerSuffix(options.collectionId);
  if (layerSuffix) {
    viewerUrl.searchParams.set(
      "layer",
      `${options.collectionId}_${layerSuffix}`
    );
  }

  return viewerUrl.href;
}

export function getStacAssetAccessLink(options: StacAssetAccessLinkOptions): {
  href?: string;
  requiresAuthentication: boolean;
  redirectsToTerrascopeLogin: boolean;
} {
  const requiresAuthentication = isStacAssetAuthProtected(options.asset);
  const resolvedAssetHref = options.resolvedAssetHref;

  const shouldUseTerrascopeViewer =
    !!options.terrascopeViewerUrl &&
    shouldForcePreviewForProtectedTerrascopeAsset({
      asset: options.asset,
      resolvedAssetHref,
      catalogUrl: options.catalogUrl
    });

  return {
    href: shouldUseTerrascopeViewer
      ? options.terrascopeViewerUrl
      : resolvedAssetHref,
    requiresAuthentication,
    redirectsToTerrascopeLogin: shouldUseTerrascopeViewer
  };
}

export function shouldForcePreviewForProtectedTerrascopeAsset(
  options: StacPreviewPreferenceOptions
): boolean {
  if (!isStacAssetAuthProtected(options.asset)) return false;

  return (
    isTerrascopeUrl(options.catalogUrl) ||
    isTerrascopeUrl(options.resolvedAssetHref)
  );
}

function previewAssetScore(key: string, asset: StacAssetLike): number {
  const roles = asset.roles?.map((role) => role.toLowerCase()) ?? [];
  const keyLower = key.toLowerCase();
  const typeLower = asset.type?.toLowerCase();

  let score = 0;

  if (roles.includes("overview")) score += 6;
  if (roles.includes("thumbnail")) score += 5;

  if (keyLower.includes("preview")) score += 4;
  if (keyLower.includes("thumbnail")) score += 3;
  if (keyLower.includes("quicklook")) score += 2;

  if (
    typeLower?.startsWith("image/") &&
    !typeLower.includes("tiff") &&
    !typeLower.includes("geotiff")
  ) {
    score += 1;
  }

  return score;
}

function toIsoDate(datetime: string | null | undefined): string | undefined {
  if (!datetime) return undefined;

  const directMatch = datetime.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (directMatch) return directMatch;

  const parsedDate = new Date(datetime);
  if (Number.isNaN(parsedDate.getTime())) return undefined;

  return parsedDate.toISOString().slice(0, 10);
}

function inferTerrascopeLayerSuffix(collectionId: string): string | undefined {
  const collectionIdLower = collectionId.toLowerCase();
  const explicitSuffix =
    TERRASCOPE_LAYER_SUFFIX_BY_COLLECTION[collectionIdLower];
  if (explicitSuffix) return explicitSuffix;

  const explicitPatternMatch = collectionIdLower.match(
    /^terrascope-s\d+-([a-z0-9]+)-v\d+$/i
  );
  if (explicitPatternMatch?.[1]) {
    return explicitPatternMatch[1];
  }

  const parts = collectionIdLower.split("-");
  if (parts.length === 0) return undefined;

  const versionIndex = parts.findIndex((part) => /^v\d+$/i.test(part));
  if (versionIndex > 0) {
    return parts[versionIndex - 1];
  }

  if (parts.length > 2) {
    return parts[2];
  }

  return parts[parts.length - 1];
}

const TERRASCOPE_LAYER_SUFFIX_BY_COLLECTION: Record<string, string> = {
  "terrascope-s2-rhow-v1": "rhow",
  "terrascope-s2-chl-v1": "chl"
};
