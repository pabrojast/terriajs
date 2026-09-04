import { applyCogNoDataColor } from "../../../../lib/Models/Catalog/CatalogItems/CogRasterPostProcessor";
import {
  buildCogRenderOptions,
  finalizeCogProviders,
  getValidDisplayRange,
  getValidDomain,
  inclusiveProviderMaximum,
  resolveCogColorStops
} from "../../../../lib/Models/Catalog/CatalogItems/CogRenderStyle";

describe("CogRenderStyle", function () {
  it("omits domain from provider construction options", function () {
    const options = buildCogRenderOptions({
      single: {
        colorScale: "ylgnbu",
        domain: [0, 200],
        displayRange: [0, 500],
        applyDisplayRange: true
      }
    });

    expect(options.single.colorScale).toBe("ylgnbu");
    expect(options.single.domain).toBeUndefined();
    expect(options.single.displayRange).toBeUndefined();
    expect(options.single.applyDisplayRange).toBe(false);
  });

  it("selects a named palette over inherited custom colors explicitly", function () {
    const options = buildCogRenderOptions({
      single: {
        colorScaleMode: "named",
        colorScale: "jet",
        colors: ["#000000", "#ffffff"]
      }
    });

    expect(options.single.colorScale).toBe("jet");
    expect(options.single.colors).toBeUndefined();
  });

  it("keeps legacy custom-color precedence when no mode is supplied", function () {
    const options = buildCogRenderOptions({
      single: {
        colorScale: "jet",
        colors: ["#000000", "#ffffff"]
      }
    });

    expect(options.single.colors).toEqual(["#000000", "#ffffff"]);
    expect(options.single.colorScale).toBeUndefined();
  });

  it("uses exact provider stops and reverses their positions", function () {
    const stops = resolveCogColorStops(
      { colorScale: "jet", reverseColorScale: true },
      [0, 100]
    );

    expect(stops[0]).toEqual({ position: 0, color: "#800000" });
    expect(stops[1].position).toBeCloseTo(0.125, 6);
    expect(stops[stops.length - 1]).toEqual({
      position: 1,
      color: "#000083"
    });
  });

  it("spreads string colors across both endpoints", function () {
    const stops = resolveCogColorStops(
      { colorScaleMode: "custom", colors: ["#000000", "#ff0000", "#ffffff"] },
      [0, 1]
    );

    expect(stops.map((stop) => stop.position)).toEqual([0, 0.5, 1]);
  });

  it("validates color and transparency ranges separately", function () {
    expect(getValidDomain([1, 1])).toBeUndefined();
    expect(getValidDomain([1, 2])).toEqual([1, 2]);
    expect(getValidDisplayRange([1, 1])).toEqual([1, 1]);
    expect(getValidDisplayRange([2, 1])).toBeUndefined();
  });

  it("uses a shared aggregate domain and an inclusive transparency maximum", function () {
    const first = makeProvider([2, 10]);
    const second = makeProvider([-5, 8]);
    const style = finalizeCogProviders([first, second], {
      displayRange: [0, 8],
      applyDisplayRange: true
    });

    expect(style?.domain).toEqual([-5, 10]);
    expect(style?.nativeDomain).toEqual([-5, 10]);
    expect(style?.displayRange).toEqual([0, 8]);
    expect(first.plot.domain).toEqual([-5, 10]);
    expect(second.plot.domain).toEqual([-5, 10]);
    expect(first.plot.colorScaleCanvas.width).toBe(256);
    expect(first.plot.displayRange[0]).toBe(0);
    expect(first.plot.displayRange[1]).toBeGreaterThan(8);
    expect(first.plot.applyDisplayRange).toBe(true);
  });

  it("restyles domain and drops cached tiles without losing native statistics", function () {
    const provider = makeProvider([2, 80]);
    provider._imagesCache = new Map([["0_0_0", {}]]);

    const first = finalizeCogProviders([provider], {
      colorScale: "ylgnbu",
      domain: [0, 500]
    });
    expect(first?.domain).toEqual([0, 500]);
    expect(provider.plot.domain).toEqual([0, 500]);
    expect(provider._imagesCache.size).toBe(0);

    provider._imagesCache.set("1_1_1", {});
    const second = finalizeCogProviders([provider], {
      colorScale: "ylgnbu",
      domain: [0, 200]
    });
    expect(second?.domain).toEqual([0, 200]);
    expect(second?.nativeDomain).toEqual([2, 80]);
    expect(provider.plot.domain).toEqual([0, 200]);
    expect(provider._imagesCache.size).toBe(0);
  });

  it("keeps a configured domain and still reports native band statistics", function () {
    const provider = makeProvider([2, 80]);
    const style = finalizeCogProviders([provider], {
      colorScale: "ylgnbu",
      domain: [0, 500],
      displayRange: [0, 50000],
      applyDisplayRange: true
    });

    expect(style?.domain).toEqual([0, 500]);
    expect(style?.nativeDomain).toEqual([2, 80]);
    expect(provider.plot.domain).toEqual([0, 500]);
    expect(style?.displayRange).toEqual([0, 50000]);
  });

  it("does not apply malformed configured ranges", function () {
    const provider = makeProvider([0, 10]);
    const style = finalizeCogProviders([provider], {
      domain: [5, 5],
      displayRange: [9, 3],
      applyDisplayRange: true
    });

    expect(style?.domain).toEqual([0, 10]);
    expect(style?.invalidDomain).toBe(true);
    expect(style?.invalidDisplayRange).toBe(true);
    expect(style?.applyDisplayRange).toBe(false);
    expect(provider.plot.applyDisplayRange).toBe(false);
  });

  it("translates inclusive maxima for WebGL and 2D", function () {
    expect(inclusiveProviderMaximum(50, true)).toBeGreaterThan(50);
    expect(inclusiveProviderMaximum(50, false)).toBeGreaterThan(50);
    expect(inclusiveProviderMaximum(-50, true)).toBeGreaterThan(-50);
    expect(inclusiveProviderMaximum(-50, false)).toBeGreaterThan(-50);
  });

  it("fills only actual no-data pixels after provider rendering", async function () {
    const rendered = new ImageData(
      new Uint8ClampedArray([0, 0, 0, 0, 1, 2, 3, 255]),
      2,
      1
    );
    const provider: any = {
      noData: -9999,
      readSamples: [0],
      renderOptions: { single: { band: 1 } },
      _loadTile: async () => ({
        data: [new Float32Array([-9999, 5])],
        width: 2,
        height: 1
      }),
      requestImage: async function (x: number, y: number, z: number) {
        await this._loadTile(x, y, z);
        return rendered;
      }
    };

    applyCogNoDataColor(provider, 1, "#ff0000");
    const result = (await provider.requestImage(0, 0, 0)) as ImageData;
    expect(Array.from(result.data)).toEqual([255, 0, 0, 255, 1, 2, 3, 255]);
  });
});

function makeProvider(domain: [number, number]): any {
  const plot: any = {
    domain: domain.slice(),
    applyDisplayRange: false,
    gl: undefined,
    setDomain(value: number[]) {
      this.domain = value;
    },
    setClamp(low: boolean, high: boolean) {
      this.clampLow = low;
      this.clampHigh = high;
    },
    setColorType(value: string) {
      this.colorType = value;
    },
    setColorScaleImage(value: HTMLCanvasElement) {
      this.colorScaleImage = value;
    },
    setDisplayRange(value: number[]) {
      this.displayRange = value;
      this.applyDisplayRange = true;
    }
  };
  return {
    plot,
    bands: { 1: { min: domain[0], max: domain[1] } },
    readSamples: [0],
    renderOptions: { single: { band: 1 } }
  };
}
