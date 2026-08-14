import { createAutomaticCogLegends } from "../../../../lib/Models/Catalog/CatalogItems/CogLegendStratum";
import { CogEffectiveStyle } from "../../../../lib/Models/Catalog/CatalogItems/CogRenderStyle";

describe("Cog automatic legends", function () {
  it("creates a continuous legend for the default single-band style", function () {
    const legends = createAutomaticCogLegends(makeStyle());

    expect(legends?.length).toBe(1);
    expect(legends?.[0].urlMimeType).toBe("image/svg+xml");
    expect(legends?.[0].url).toContain("data:image/svg+xml;base64,");
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

  it("omits numeric legends for RGB or multiband rendering", function () {
    expect(
      createAutomaticCogLegends({ ...makeStyle(), isSingleBand: false })
    ).toBeUndefined();
  });
});

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
