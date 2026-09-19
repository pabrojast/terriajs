import {
  CogGridMeta,
  isCogNoData,
  loadCogPointSeries,
  lonLatToPixel,
  outwardOrder,
  readCogPointValue,
  toPhysicalValue
} from "../../lib/Core/CogPointReader";
import {
  adoptCogSource,
  clearCogSourceCache,
  openCogSource
} from "../../lib/Core/CogSourceCache";

const FIXTURE_4326 = "/test/cogs/4326.tif";
const FIXTURE_32756 = "/test/cogs/32756.tif";

/** A 10x10 geographic grid covering 30–31°E, 50–51°N. */
const GEOGRAPHIC: CogGridMeta = {
  origin: [30, 51],
  resolution: [0.1, -0.1],
  width: 10,
  height: 10,
  projectedEpsg: undefined
};

/** Stand-in for a GeoTIFF whose single pixel holds `raw`. */
function fakeTiff(raw: number, noData: number | null = null): any {
  const image = {
    getOrigin: () => [30, 51, 0],
    getResolution: () => [0.1, -0.1, 0],
    getWidth: () => 10,
    getHeight: () => 10,
    getGeoKeys: () => ({ GeographicTypeGeoKey: 4326 }),
    getGDALNoData: () => noData,
    readRasters: async (options: any) => {
      if (options.signal?.aborted) {
        const error: any = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return [new Float32Array([raw])];
    }
  };
  return { getImage: async () => image };
}

describe("CogPointReader", function () {
  afterEach(function () {
    clearCogSourceCache();
  });

  describe("lonLatToPixel", function () {
    it("maps a coordinate to the pixel that contains it", function () {
      expect(lonLatToPixel(GEOGRAPHIC, 30.05, 50.95)).toEqual({ px: 0, py: 0 });
      expect(lonLatToPixel(GEOGRAPHIC, 30.95, 50.05)).toEqual({ px: 9, py: 9 });
      expect(lonLatToPixel(GEOGRAPHIC, 30.31, 50.69)).toEqual({ px: 3, py: 3 });
    });

    it("returns undefined outside the image", function () {
      expect(lonLatToPixel(GEOGRAPHIC, 29.99, 50.5)).toBeUndefined();
      expect(lonLatToPixel(GEOGRAPHIC, 31.01, 50.5)).toBeUndefined();
      expect(lonLatToPixel(GEOGRAPHIC, 30.5, 51.01)).toBeUndefined();
      expect(lonLatToPixel(GEOGRAPHIC, 30.5, 49.99)).toBeUndefined();
    });

    it("reprojects into a projected CRS before indexing", function () {
      const projected: CogGridMeta = {
        origin: [500000, 6000000],
        resolution: [10, -10],
        width: 100,
        height: 100,
        projectedEpsg: 32756
      };
      const forward = jasmine
        .createSpy("forward")
        .and.returnValue([500255, 5999745]);
      const proj4 = jasmine.createSpy("proj4").and.returnValue({ forward });

      expect(lonLatToPixel(projected, 153, -36.1, proj4 as any)).toEqual({
        px: 25,
        py: 25
      });
      expect(proj4).toHaveBeenCalledWith("EPSG:4326", "EPSG:32756");
      expect(forward).toHaveBeenCalledWith([153, -36.1]);
    });

    it("does not guess when a projected image cannot be reprojected", function () {
      const projected: CogGridMeta = { ...GEOGRAPHIC, projectedEpsg: 32756 };
      expect(lonLatToPixel(projected, 30.5, 50.5)).toBeUndefined();
      const throwing: any = () => {
        throw new Error("unknown CRS");
      };
      expect(lonLatToPixel(projected, 30.5, 50.5, throwing)).toBeUndefined();
    });
  });

  describe("no-data and scaling", function () {
    it("treats only declared values as no-data", function () {
      expect(isCogNoData(-9999, -9999)).toBe(true);
      expect(isCogNoData(65535, 65535)).toBe(true);
      expect(isCogNoData(NaN, null)).toBe(true);
      expect(isCogNoData(-999, null, [-999])).toBe(true);
      // Common sentinels are real values unless the file or catalog says so.
      expect(isCogNoData(255, null)).toBe(false);
      expect(isCogNoData(65535, null)).toBe(false);
      expect(isCogNoData(-9999, 0)).toBe(false);
    });

    it("converts stored values to physical values", function () {
      expect(toPhysicalValue(437, { scale: 0.1, offset: 0 })).toBeCloseTo(
        43.7,
        6
      );
      expect(toPhysicalValue(10, { scale: 2, offset: -5 })).toBe(15);
      expect(toPhysicalValue(7)).toBe(7);
    });

    it("reads a scaled value and reports no-data and outside distinctly", async function () {
      const transform = { scale: 0.1, offset: 0 };
      expect(
        await readCogPointValue(fakeTiff(437, 65535), 30.5, 50.5, { transform })
      ).toEqual({ status: "value", value: 437 * 0.1, raw: 437 });
      expect(
        await readCogPointValue(fakeTiff(65535, 65535), 30.5, 50.5, {
          transform
        })
      ).toEqual({ status: "nodata" });
      expect(await readCogPointValue(fakeTiff(437), 10, 10)).toEqual({
        status: "outside"
      });
    });
  });

  describe("real fixtures", function () {
    it("reads the pixel of a geographic GeoTIFF", async function () {
      const tiff = await openCogSource(FIXTURE_4326);
      const image = await tiff.getImage(0);
      const [west, south, east, north] = image.getBoundingBox();
      const read = await readCogPointValue(
        tiff,
        (west + east) / 2,
        (south + north) / 2
      );
      expect(read.status).not.toBe("outside");
    });

    it("finds the pixel of a projected (EPSG:32756) GeoTIFF from lon/lat", async function () {
      const tiff = await openCogSource(FIXTURE_32756);
      const image = await tiff.getImage(0);
      const [minX, minY, maxX, maxY] = image.getBoundingBox();
      const proj4 = (await import("proj4-fully-loaded")).default as any;
      const [lon, lat] = proj4("EPSG:4326", "EPSG:32756").inverse([
        (minX + maxX) / 2,
        (minY + maxY) / 2
      ]);

      expect((await readCogPointValue(tiff, lon, lat)).status).not.toBe(
        "outside"
      );
      // The same numbers taken as degrees are nowhere near the image.
      expect((await readCogPointValue(tiff, 0, 0)).status).toBe("outside");
    });
  });

  describe("loadCogPointSeries", function () {
    it("orders dates outwards from the starting index", function () {
      expect(outwardOrder(5, 2)).toEqual([2, 3, 1, 4, 0]);
      expect(outwardOrder(4, 0)).toEqual([0, 1, 2, 3]);
      expect(outwardOrder(3, 99)).toEqual([2, 1, 0]);
      expect(outwardOrder(0, 0)).toEqual([]);
    });

    it("reads every step, mosaic-aware, and accounts for gaps and failures separately", async function () {
      adoptCogSource("a.tif", fakeTiff(10));
      adoptCogSource("broken.tif", {
        getImage: async () => {
          throw new Error("corrupt file");
        }
      } as any);
      adoptCogSource("nodata.tif", fakeTiff(-9999, -9999));
      adoptCogSource("c.tif", fakeTiff(30));
      // Second tile of a mosaic holds the value; the first does not cover it.
      const farAway = fakeTiff(99);
      const farImage = await farAway.getImage();
      farImage.getOrigin = () => [0, 1, 0];
      adoptCogSource("far.tif", farAway);

      const progressCalls: number[] = [];
      const result = await loadCogPointSeries({
        entries: [
          { time: "2024-01-01T00:00:00Z", cogs: ["a.tif"] },
          { time: "2024-02-01T00:00:00Z", cogs: ["nodata.tif"] },
          { time: "2024-03-01T00:00:00Z", cogs: ["far.tif", "c.tif"] },
          { time: "2024-04-01T00:00:00Z", cogs: ["far.tif"] },
          { time: "2024-05-01T00:00:00Z", cogs: ["broken.tif"] }
        ],
        lon: 30.5,
        lat: 50.5,
        concurrency: 2,
        onProgress: (progress) => progressCalls.push(progress.loaded)
      });

      expect(result.aborted).toBe(false);
      expect(result.loaded).toBe(5);
      expect(result.noData).toBe(1);
      expect(result.outside).toBe(1);
      // A broken file is an error, not a silent gap.
      expect(result.errors).toBe(1);
      expect(
        result.points
          .slice()
          .sort((a, b) => a.x - b.x)
          .map((point) => [point.time, point.y])
      ).toEqual([
        ["2024-01-01T00:00:00Z", 10],
        ["2024-03-01T00:00:00Z", 30]
      ]);
      expect(result.points[0].x).toBe(Date.parse(result.points[0].time));
      expect(progressCalls.length).toBe(5);
    });

    it("stops reading when aborted", async function () {
      const controller = new AbortController();
      const entries = Array.from({ length: 20 }, (_, index) => {
        adoptCogSource(`step${index}.tif`, fakeTiff(index));
        return {
          time: new Date(Date.UTC(2024, index, 1)).toISOString(),
          cogs: [`step${index}.tif`]
        };
      });

      const result = await loadCogPointSeries({
        entries,
        lon: 30.5,
        lat: 50.5,
        concurrency: 1,
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.loaded === 3) controller.abort();
        }
      });

      expect(result.aborted).toBe(true);
      expect(result.loaded).toBe(3);
    });
  });
});
