import { JsonObject } from "../../../Core/Json";
import loadJson from "../../../Core/loadJson";
import { BaseModel } from "../../Definition/Model";
import UrlReference from "../CatalogReferences/UrlReference";
import proxyCatalogItemUrl from "../proxyCatalogItemUrl";

type StacItemLike = unknown;

interface StacLinkLike {
  rel: string;
  href: string;
}

interface StacCollectionLike {
  id: string;
  links: StacLinkLike[];
}

interface StacItemsResponseLike {
  features?: StacItemLike[];
  links?: StacLinkLike[];
}

interface StacItemsLoadOptions {
  collection: StacCollectionLike;
  collectionUrl: string;
  maximumItems?: number;
  itemsPageSize?: number;
  itemsPageLimit?: number;
  dateTimeFilter?: string;
  bboxFilter?: readonly number[];
  sortBy?: string;
  filterExpression?: string;
  filterLanguage?: string;
  intersectsGeometry?: JsonObject;
  additionalQueryParameters?: JsonObject;
  itemsQueryMode?: string;
  requestTimeoutSeconds?: number;
  requestRetryAttempts?: number;
  requestRetryDelaySeconds?: number;
}

type StacItemsQueryMode = "items" | "search";

const DEFAULT_ITEMS_LIMIT = 10;
const DEFAULT_ITEMS_PAGE_LIMIT = 1;
const DEFAULT_RETRY_ATTEMPTS = 0;
const DEFAULT_RETRY_DELAY_SECONDS = 1;
const DEFAULT_TIMEOUT_SECONDS = 30;

export async function loadStacItems(
  catalogItem: BaseModel | UrlReference | undefined,
  options: StacItemsLoadOptions
): Promise<StacItemLike[]> {
  const maximumItems = sanitizePositiveInt(
    options.maximumItems,
    DEFAULT_ITEMS_LIMIT
  );
  const itemsPageLimit = sanitizePositiveInt(
    options.itemsPageLimit,
    DEFAULT_ITEMS_PAGE_LIMIT
  );
  const retryAttempts = sanitizeNonNegativeInt(
    options.requestRetryAttempts,
    DEFAULT_RETRY_ATTEMPTS
  );
  const retryDelayMs = Math.max(
    0,
    (options.requestRetryDelaySeconds ?? DEFAULT_RETRY_DELAY_SECONDS) * 1000
  );
  const timeoutMs =
    (options.requestTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) > 0
      ? (options.requestTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000
      : undefined;

  const queryMode = resolveStacItemsQueryMode({
    itemsQueryMode: options.itemsQueryMode,
    filterExpression: options.filterExpression,
    intersectsGeometry: options.intersectsGeometry
  });

  const itemsLink = options.collection.links.find(
    (link) => link.rel === "items"
  );
  const itemsUrl =
    itemsLink && resolveRelativeUrl(itemsLink.href, options.collectionUrl);
  const searchUrl =
    queryMode === "search"
      ? resolveStacSearchUrl(options.collection, options.collectionUrl)
      : undefined;

  if (queryMode === "items" && !itemsUrl) return [];
  if (queryMode === "search" && !searchUrl) return [];

  const results: StacItemLike[] = [];
  const visitedNextUrls = new Set<string>();
  let nextUrl: string | undefined;

  for (let page = 0; page < itemsPageLimit; page++) {
    const remaining = maximumItems - results.length;
    if (remaining <= 0) break;

    const pageSize = sanitizePositiveInt(
      options.itemsPageSize,
      Math.min(maximumItems, remaining)
    );
    const limit = Math.max(1, Math.min(pageSize, remaining));

    const request = nextUrl
      ? { method: "GET" as const, url: nextUrl, body: undefined }
      : queryMode === "search"
      ? {
          method: "POST" as const,
          url: searchUrl!,
          body: buildStacSearchBody({
            collectionId: options.collection.id,
            limit,
            dateTimeFilter: options.dateTimeFilter,
            bboxFilter: options.bboxFilter,
            sortBy: options.sortBy,
            filterExpression: options.filterExpression,
            filterLanguage: options.filterLanguage,
            intersectsGeometry: options.intersectsGeometry,
            additionalQueryParameters: options.additionalQueryParameters
          })
        }
      : {
          method: "GET" as const,
          url: buildStacItemsGetUrl({
            itemsUrl: itemsUrl!,
            limit,
            dateTimeFilter: options.dateTimeFilter,
            bboxFilter: options.bboxFilter,
            sortBy: options.sortBy,
            filterExpression: options.filterExpression,
            filterLanguage: options.filterLanguage,
            additionalQueryParameters: options.additionalQueryParameters
          }),
          body: undefined
        };

    const response = (await requestWithRetryAndTimeout(
      () =>
        request.method === "POST"
          ? loadJson(
              proxyCatalogItemUrl(catalogItem, request.url),
              undefined,
              request.body
            )
          : loadJson(proxyCatalogItemUrl(catalogItem, request.url)),
      {
        retryAttempts,
        retryDelayMs,
        timeoutMs
      }
    )) as StacItemsResponseLike;

    const features = Array.isArray(response.features) ? response.features : [];
    if (features.length > 0) {
      results.push(...features.slice(0, remaining));
    }

    const resolvedNextUrl = resolveNextLinkUrl(response.links, request.url);
    if (!resolvedNextUrl || visitedNextUrls.has(resolvedNextUrl)) {
      break;
    }
    visitedNextUrls.add(resolvedNextUrl);
    nextUrl = resolvedNextUrl;
  }

  return results.slice(0, maximumItems);
}

export function resolveStacItemsQueryMode(options: {
  itemsQueryMode?: string;
  filterExpression?: string;
  intersectsGeometry?: JsonObject;
}): StacItemsQueryMode {
  const mode = (options.itemsQueryMode ?? "auto").toLowerCase();
  if (mode === "items" || mode === "search") return mode;

  // Prefer search endpoint when using CQL/intersects constraints.
  if (options.filterExpression || options.intersectsGeometry) {
    return "search";
  }

  return "items";
}

export function buildStacItemsGetUrl(options: {
  itemsUrl: string;
  limit: number;
  dateTimeFilter?: string;
  bboxFilter?: readonly number[];
  sortBy?: string;
  filterExpression?: string;
  filterLanguage?: string;
  additionalQueryParameters?: JsonObject;
}): string {
  const url = new URL(options.itemsUrl);
  url.searchParams.set("limit", String(options.limit));

  if (options.dateTimeFilter) {
    url.searchParams.set("datetime", options.dateTimeFilter);
  }
  if (options.bboxFilter && options.bboxFilter.length >= 4) {
    url.searchParams.set("bbox", options.bboxFilter.join(","));
  }
  if (options.sortBy) {
    url.searchParams.set("sortby", options.sortBy);
  }
  if (options.filterExpression) {
    url.searchParams.set("filter", options.filterExpression);
  }
  if (options.filterLanguage) {
    url.searchParams.set("filter-lang", options.filterLanguage);
  }

  appendAdditionalQueryParameters(url, options.additionalQueryParameters);
  return url.href;
}

export function buildStacSearchBody(options: {
  collectionId: string;
  limit: number;
  dateTimeFilter?: string;
  bboxFilter?: readonly number[];
  sortBy?: string;
  filterExpression?: string;
  filterLanguage?: string;
  intersectsGeometry?: JsonObject;
  additionalQueryParameters?: JsonObject;
}): JsonObject {
  const body: JsonObject = {
    collections: [options.collectionId],
    limit: options.limit
  };

  if (options.dateTimeFilter) {
    body.datetime = options.dateTimeFilter;
  }
  if (options.bboxFilter && options.bboxFilter.length >= 4) {
    body.bbox = [...options.bboxFilter];
  }
  if (options.sortBy) {
    body.sortby = options.sortBy;
  }
  if (options.filterExpression) {
    body.filter = options.filterExpression;
    body["filter-lang"] = options.filterLanguage ?? "cql2-text";
  } else if (options.filterLanguage) {
    body["filter-lang"] = options.filterLanguage;
  }
  if (options.intersectsGeometry) {
    body.intersects = options.intersectsGeometry;
  }

  appendAdditionalBodyParameters(body, options.additionalQueryParameters);
  return body;
}

export function resolveStacSearchUrl(
  collection: StacCollectionLike,
  collectionUrl: string
): string | undefined {
  const searchLink = collection.links.find((link) => link.rel === "search");
  if (searchLink) {
    return resolveRelativeUrl(searchLink.href, collectionUrl);
  }

  try {
    const parsedCollectionUrl = new URL(collectionUrl);
    const collectionPathMatch = parsedCollectionUrl.pathname.match(
      /^(.+)\/collections\/[^/]+\/?$/i
    );
    if (collectionPathMatch?.[1]) {
      return new URL(
        `${collectionPathMatch[1]}/search`,
        parsedCollectionUrl.origin
      ).href;
    }
    return new URL("search", parsedCollectionUrl).href;
  } catch {
    return undefined;
  }
}

function appendAdditionalQueryParameters(
  url: URL,
  parameters: JsonObject | undefined
) {
  if (!parameters) return;

  Object.entries(parameters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v !== undefined && v !== null) {
          url.searchParams.append(key, serializeParameterValue(v));
        }
      });
      return;
    }
    url.searchParams.set(key, serializeParameterValue(value));
  });
}

function appendAdditionalBodyParameters(
  body: JsonObject,
  parameters: JsonObject | undefined
) {
  if (!parameters) return;

  Object.entries(parameters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    // Do not override explicit standard parameters.
    if (body[key] !== undefined) return;
    body[key] = value;
  });
}

function resolveNextLinkUrl(
  links: StacLinkLike[] | undefined,
  baseUrl: string
): string | undefined {
  if (!Array.isArray(links)) return undefined;
  const nextLink = links.find((link) => link.rel === "next");
  if (!nextLink?.href) return undefined;
  return resolveRelativeUrl(nextLink.href, baseUrl);
}

function resolveRelativeUrl(url: string, baseUrl: string): string | undefined {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return undefined;
  }
}

function sanitizePositiveInt(
  value: number | undefined,
  fallback: number
): number {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value!);
  if (normalized <= 0) return fallback;
  return normalized;
}

function sanitizeNonNegativeInt(
  value: number | undefined,
  fallback: number
): number {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value!);
  if (normalized < 0) return fallback;
  return normalized;
}

function serializeParameterValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

async function requestWithRetryAndTimeout<T>(
  request: () => Promise<T>,
  options: {
    retryAttempts: number;
    retryDelayMs: number;
    timeoutMs?: number;
  }
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retryAttempts; attempt++) {
    try {
      return await withTimeout(request(), options.timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= options.retryAttempts || !isRetryableError(error)) {
        throw error;
      }
      if (options.retryDelayMs > 0) {
        await sleep(options.retryDelayMs);
      }
    }
  }

  throw lastError;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`STAC request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function isRetryableError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error))
    .toLowerCase()
    .trim();

  if (!message) return true;
  if (message.includes("timed out")) return true;
  if (message.includes("networkerror")) return true;
  if (message.includes("failed to fetch")) return true;
  if (message.includes("status code 5")) return true;
  if (
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  ) {
    return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
