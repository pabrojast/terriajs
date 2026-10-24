import type TIFFImageryProvider from "terriajs-tiff-imagery-provider";
import {
  DETACHED_RESAMPLE_POOL,
  getSharedGeotiffPool,
  getSharedResamplePool
} from "../../../Core/CogSharedPools";
import { adoptCogSource } from "../../../Core/CogSourceCache";
import type { CogRange } from "./CogRenderStyle";

/**
 * Set on providers that were constructed with `single.domain`. The library then
 * skips its statistics read and reports that domain as the band statistics, so
 * the real native range has to be tracked here instead.
 */
const CONSTRUCTION_DOMAIN_FLAG = "_terriaCogConstructionDomain";
const NATIVE_DOMAIN_KEY = "_terriaCogNativeDomain";

export interface CreateCogImageryProviderOptions {
  credit?: string;
  tileSize?: number;
  maximumLevel?: number;
  minimumLevel?: number;
  enablePickFeatures?: boolean;
  hasAlphaChannel?: boolean;
  projFunc?: unknown;
  /** Output of `buildCogRenderOptions`. */
  renderOptions?: any;
  /** Rendered tiles kept per provider (library default is 100). */
  tileCacheSize?: number;
  /** Native band range when already known (e.g. from `getCogBandStats`). */
  nativeDomain?: CogRange;
}

/**
 * Build a TIFFImageryProvider that decodes and resamples on the session-wide
 * shared worker pools instead of spawning (and leaking) its own, exposes `url`
 * so TerriaJS can record/restore picks for it, and shares its opened GeoTIFF
 * with point and zonal readers.
 *
 * @param fetchUrl The URL to fetch, i.e. already proxied if needed.
 */
export async function createCogImageryProvider(
  fetchUrl: string,
  options: CreateCogImageryProviderOptions
): Promise<TIFFImageryProvider> {
  const [{ default: TIFFImageryProviderCtor }, geotiffPool] = await Promise.all(
    [import("terriajs-tiff-imagery-provider"), getSharedGeotiffPool()]
  );

  const { tileCacheSize, nativeDomain, ...providerOptions } = options;
  const provider = await TIFFImageryProviderCtor.fromUrl(fetchUrl, {
    ...providerOptions,
    // No private pools: see CogSharedPools.
    workerPoolSize: 0,
    cacheSize: tileCacheSize
  } as any);

  const internals = provider as any;
  const resamplePool = getSharedResamplePool(TIFFImageryProviderCtor as any);
  if (resamplePool) internals.workerPool = resamplePool;
  internals.geotiffWorkerPool = geotiffPool;
  if (internals.url === undefined) internals.url = fetchUrl;

  if (options.renderOptions?.single?.domain !== undefined) {
    internals[CONSTRUCTION_DOMAIN_FLAG] = true;
    internals[NATIVE_DOMAIN_KEY] = nativeDomain;
  }

  adoptCogSource(fetchUrl, internals._source);
  return provider;
}

/** Destroy a provider built by `createCogImageryProvider` without touching the shared pools. */
export function destroyCogImageryProvider(
  provider: TIFFImageryProvider | undefined
): void {
  if (!provider) return;
  const internals = provider as any;
  if (internals._destroyed) return;
  internals.workerPool = DETACHED_RESAMPLE_POOL;
  internals.geotiffWorkerPool = undefined;
  provider.destroy();
}

/** True when the provider's band statistics are a configured domain, not data. */
export function hasCogConstructionDomain(
  provider: TIFFImageryProvider
): boolean {
  return (provider as any)[CONSTRUCTION_DOMAIN_FLAG] === true;
}

/** Native band range recorded for a provider built with a construction domain. */
export function getCogProviderNativeDomain(
  provider: TIFFImageryProvider
): CogRange | undefined {
  return (provider as any)[NATIVE_DOMAIN_KEY];
}

export function setCogProviderNativeDomain(
  provider: TIFFImageryProvider,
  nativeDomain: CogRange | undefined
): void {
  (provider as any)[NATIVE_DOMAIN_KEY] = nativeDomain;
}

/** The URL the provider fetches, as set by `createCogImageryProvider`. */
export function getCogProviderUrl(
  provider: TIFFImageryProvider
): string | undefined {
  const url = (provider as any).url;
  return typeof url === "string" ? url : undefined;
}
