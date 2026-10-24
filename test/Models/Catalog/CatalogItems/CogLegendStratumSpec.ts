import { createAutomaticCogLegends } from "../../../../lib/Models/Catalog/CatalogItems/CogLegendStratum";
import { CogEffectiveStyle } from "../../../../lib/Models/Catalog/CatalogItems/CogRenderStyle";

describe("Cog automatic legends", function () {
  it("creates a continuous legend for the default single-band style", function () {
    const legends = createAutomaticCogLegends(makeStyle());

    expect(legends?.length).toBe(1);
    expect(legends?.[0].urlMimeType).toBe("image/svg+xml");
    expect(legends?.[0].url).toContain("data:image/svg+xml;base64,");
    expect(legends?.[0].items?.length).toBe(2);
    expect(legends?.[0].items?.[0].value).toBe(100);
    expect(legends?.[0].items?.[1].value).toBe(0);
  });

  it("encodes the configured domain and palette for a CHL-style continuous series", function () {
    const legends = createAutomaticCogLegends({
      ...makeStyle(),
      domain: [0, 500],
      colorScaleName: "ylgnbu",
      stops: [
        { position: 0, color: "#081d58" },
        { position: 1, color: "#ffffd9" }
      ]
    });

    expect(legends?.[0].items?.[0].value).toBe(500);
    expect(legends?.[0].items?.[1].value).toBe(0);
    const svg = decodeLegendSvg(legends?.[0].url);
    expect(svg).toContain("#081d58");
    expect(svg).toContain("#ffffd9");
    expect(svg).not.toContain("<text");
  });

  it("samples the actual discrete ramp and configured bin count", function () {
    const legends = createAutomaticCogLegends({
      ...makeStyle(),
      type: "discrete",
      numberOfBins: 4,
      stops: [
        { position: 0, color: "#000000" },
        { position: 0.5, color: "#ff0000" },
        { position: 1, color: "#ffffff" }
      ]
    });

    expect(legends?.[0].items?.length).toBe(4);
    expect(legends?.[0].items?.[0].value).toBe(100);
    expect(legends?.[0].items?.[3].value).toBe(0);
  });

  it("uses a live bin count override for discrete legends", function () {
    const legends = createAutomaticCogLegends(
      { ...makeStyle(), type: "discrete", numberOfBins: 8 },
      4
    );

    expect(legends?.[0].items?.length).toBe(4);
    expect(legends?.[0].items?.[0].value).toBe(100);
    expect(legends?.[0].items?.[3].value).toBe(0);
  });

  it("omits numeric legends for RGB or multiband rendering", function () {
    expect(
      createAutomaticCogLegends({ ...makeStyle(), isSingleBand: false })
    ).toBeUndefined();
  });
});

function decodeLegendSvg(url: string | undefined): string {
  if (!url) return "";
  const encoded = url.slice(url.indexOf(",") + 1);
  return Buffer.from(encoded, "base64").toString("utf8");
}

function makeStyle(): CogEffectiveStyle {
  return {
    isSingleBand: true,
    domain: [0, 100],
    applyDisplayRange: false,
    invalidDomain: false,
    invalidDisplayRange: false,
    clampLow: true,
    clampHigh: true,
    type: "continuous",
    numberOfBins: 8,
    reverseColorScale: false,
    colorScaleName: "blackwhite",
    stops: [
      { position: 0, color: "#000000" },
      { position: 1, color: "#ffffff" }
    ]
  };
}
