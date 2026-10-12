import {
  adoptCogSource,
  clearCogSourceCache,
  computeMinMax,
  getCogBandStats,
  hasCogSource,
  openCogSource
} from "../../lib/Core/CogSourceCache";

const FIXTURE_4326 = "/test/cogs/4326.tif";

describe("CogSourceCache", function () {
  beforeEach(function () {
    clearCogSourceCache();
  });

  afterEach(function () {
    clearCogSourceCache();
  });

  describe("computeMinMax", function () {
    it("ignores no-data, NaN and infinities", function () {
      const data = new Float32Array([-9999, 3, NaN, 12.5, Infinity, -2, -9999]);
      expect(computeMinMax(data, -9999)).toEqual([-2, 12.5]);
    });

    it("returns undefined when every value is no-data", function () {
      expect(computeMinMax(new Uint16Array([65535, 65535]), 65535)).toBe(
        undefined
      );
    });

    it("keeps values equal to a sentinel that is not this file's no-data", function () {
      // 65535 / 255 are only no-data when the GeoTIFF says so.
      expect(computeMinMax(new Uint16Array([0, 255, 65535]), null)).toEqual([
        0, 65535
      ]);
    });
  });

  describe("openCogSource", function () {
    it("shares one open between concurrent and later callers", async function () {
      const first = openCogSource(FIXTURE_4326);
      const second = openCogSource(FIXTURE_4326);
      expect(second).toBe(first);

      const tiff = await first;
      expect(await openCogSource(FIXTURE_4326)).toBe(tiff);
      expect((await tiff.getImage(0)).getWidth()).toBeGreaterThan(0);
    });

    it("does not cache a failed open", async function () {
      const url = "/test/cogs/does-not-exist.tif";
      let failed = false;
      try {
        await openCogSource(url);
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
      expect(hasCogSource(url)).toBe(false);
    });

    it("reuses a GeoTIFF adopted from an imagery provider", async function () {
      const adopted: any = { adopted: true };
      adoptCogSource("adopted.tif", adopted);
      expect(await openCogSource("adopted.tif")).toBe(adopted);
    });

    it("keeps the first source when the same URL is adopted again", async function () {
      const original: any = { id: 1 };
      adoptCogSource("twice.tif", original);
      adoptCogSource("twice.tif", { id: 2 } as any);
      expect(await openCogSource("twice.tif")).toBe(original);
    });
  });

  describe("getCogBandStats", function () {
    it("computes a finite native range once per URL and band", async function () {
      const first = getCogBandStats(FIXTURE_4326, 1);
      expect(getCogBandStats(FIXTURE_4326, 1)).toBe(first);

      const range = await first;
      expect(range).toBeDefined();
      expect(Number.isFinite(range![0])).toBe(true);
      expect(Number.isFinite(range![1])).toBe(true);
      expect(range![0]).toBeLessThanOrEqual(range![1]);
    });
  });
});
