import TIFFImageryProvider from "terriajs-tiff-imagery-provider";
import {
  DETACHED_RESAMPLE_POOL,
  getCogWorkerPoolSize,
  getSharedGeotiffPool,
  getSharedResamplePool
} from "../../lib/Core/CogSharedPools";
import {
  createCogImageryProvider,
  destroyCogImageryProvider,
  getCogProviderUrl
} from "../../lib/Models/Catalog/CatalogItems/CogProviderFactory";
import { hasCogSource } from "../../lib/Core/CogSourceCache";

const FIXTURE_4326 = "/test/cogs/4326.tif";

describe("CogSharedPools", function () {
  it("bounds the pool size regardless of core count", function () {
    const size = getCogWorkerPoolSize();
    expect(size).toBeGreaterThanOrEqual(2);
    expect(size).toBeLessThanOrEqual(4);
  });

  it("returns the same pools on every call", async function () {
    expect(await getSharedGeotiffPool()).toBe(await getSharedGeotiffPool());
    const resample = getSharedResamplePool(TIFFImageryProvider as any);
    expect(resample).toBeDefined();
    expect(getSharedResamplePool(TIFFImageryProvider as any)).toBe(resample);
  });

  // Guards the library internals this relies on: the pool fields are public
  // and read at call time, and `_source` is the opened GeoTIFF.
  it("builds providers on the shared pools and keeps them alive on destroy", async function () {
    const provider = await createCogImageryProvider(FIXTURE_4326, {});
    const internals = provider as any;
    const geotiffPool = await getSharedGeotiffPool();
    const resamplePool = getSharedResamplePool(TIFFImageryProvider as any)!;

    expect(internals.geotiffWorkerPool).toBe(geotiffPool);
    expect(internals.workerPool).toBe(resamplePool);
    expect(typeof internals._loadTile).toBe("function");
    expect(getCogProviderUrl(provider)).toBe(FIXTURE_4326);
    expect(hasCogSource(FIXTURE_4326)).toBe(true);

    const destroyResample = spyOn(resamplePool, "destroy").and.callThrough();
    const destroyGeotiff = spyOn(geotiffPool, "destroy").and.callThrough();
    destroyCogImageryProvider(provider);

    expect(destroyResample).not.toHaveBeenCalled();
    expect(destroyGeotiff).not.toHaveBeenCalled();
    expect(internals.workerPool).toBe(DETACHED_RESAMPLE_POOL);

    // Destroying twice is harmless.
    destroyCogImageryProvider(provider);
  });
});
