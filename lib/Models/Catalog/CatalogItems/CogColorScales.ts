import { ColorScaleNames } from "../../../Traits/TraitsClasses/CogCatalogItemTraits";

/**
 * Color scale definitions for COG legend generation
 * These are sample colors from each scale, used to generate legend items
 */
export const COG_COLOR_SCALES: Record<
  ColorScaleNames,
  { colors: string[]; positions?: number[] }
> = {
  turbo: {
    colors: [
      "#30123b",
      "#4145ab",
      "#4675ed",
      "#39a2fc",
      "#1bcfd4",
      "#24eca6",
      "#61fc6c",
      "#a4fc3b",
      "#d1e834",
      "#f1bf38",
      "#fb8022",
      "#e8450e",
      "#c00303",
      "#7a0403"
    ]
  },
  rainbow: {
    colors: [
      "#96005A",
      "#0000C8",
      "#0019FF",
      "#0098FF",
      "#2CFF96",
      "#97FF00",
      "#FFEA00",
      "#FF6F00",
      "#FF0000"
    ]
  },
  jet: {
    colors: [
      "#000083",
      "#003CAA",
      "#05FFFF",
      "#FFFF00",
      "#FA0000",
      "#800000"
    ]
  },
  hsv: {
    colors: [
      "#ff0000",
      "#fdff02",
      "#00fc04",
      "#01f9ff",
      "#0200fd",
      "#ff00fb",
      "#ff0006"
    ]
  },
  hot: {
    colors: ["#000000", "#e60000", "#ffd200", "#ffffff"]
  },
  cool: {
    colors: ["#00ffff", "#ff00ff"]
  },
  spring: {
    colors: ["#ff00ff", "#ffff00"]
  },
  summer: {
    colors: ["#008066", "#ffff66"]
  },
  autumn: {
    colors: ["#ff0000", "#ffff00"]
  },
  winter: {
    colors: ["#0000ff", "#00ff80"]
  },
  bone: {
    colors: ["#000000", "#545474", "#a9c8c8", "#ffffff"]
  },
  copper: {
    colors: ["#000000", "#ffa066", "#ffc77f"]
  },
  greys: {
    colors: ["#000000", "#ffffff"]
  },
  ylgnbu: {
    colors: [
      "#081d58",
      "#253494",
      "#225ea8",
      "#1d91c0",
      "#41b6c4",
      "#7fcdbb",
      "#c7e9b4",
      "#edf8d9",
      "#ffffd9"
    ]
  },
  greens: {
    colors: [
      "#00441b",
      "#006d2c",
      "#238b45",
      "#41ab5d",
      "#74c476",
      "#a1d99b",
      "#c7e9c0",
      "#e5f5e0",
      "#f7fcf5"
    ]
  },
  ylorrd: {
    colors: [
      "#800026",
      "#bd0026",
      "#e31a1c",
      "#fc4e2a",
      "#fd8d3c",
      "#feb24c",
      "#fed976",
      "#ffeda0",
      "#ffffcc"
    ]
  },
  bluered: {
    colors: ["#0000ff", "#ff0000"]
  },
  rdbu: {
    colors: [
      "#050aac",
      "#6a89f7",
      "#bebebe",
      "#dcaa84",
      "#e6915a",
      "#b20a1c"
    ]
  },
  picnic: {
    colors: [
      "#0000ff",
      "#3399ff",
      "#66ccff",
      "#99ccff",
      "#ccccff",
      "#ffffff",
      "#ffccff",
      "#ff99ff",
      "#ff66cc",
      "#ff6666",
      "#ff0000"
    ]
  },
  portland: {
    colors: ["#0c3383", "#0a88ba", "#f2d338", "#f28f38", "#d91e1e"]
  },
  blackbody: {
    colors: ["#000000", "#e60000", "#e6d200", "#ffffff", "#a0c8ff"]
  },
  earth: {
    colors: [
      "#000082",
      "#00b4b4",
      "#28d228",
      "#e6e632",
      "#784614",
      "#ffffff"
    ]
  },
  electric: {
    colors: [
      "#000000",
      "#1e0064",
      "#780064",
      "#a05a00",
      "#e6c800",
      "#fffadc"
    ]
  }
};
