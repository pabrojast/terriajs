/**
 * Support for STAC Extensions
 * 
 * This module provides utilities for working with various STAC extensions
 * commonly used in Earth observation data.
 */

import { StacItem, StacItemProperties, StacCollection } from "./StacApiHelpers";

// Electro-Optical Extension (eo)
export interface EoExtension {
  "eo:bands"?: EoBand[];
  "eo:cloud_cover"?: number;
  "eo:snow_cover"?: number;
  "eo:water_cover"?: number;
  "eo:sun_azimuth"?: number;
  "eo:sun_elevation"?: number;
}

export interface EoBand {
  name: string;
  common_name?: "coastal" | "blue" | "green" | "red" | "yellow" | "pan" | "rededge" | "nir" | "nir08" | "nir09" | "cirrus" | "swir16" | "swir22" | "lwir" | "lwir11" | "lwir12";
  description?: string;
  center_wavelength?: number;
  full_width_half_max?: number;
  solar_illumination?: number;
}

// SAR Extension (sar)
export interface SarExtension {
  "sar:instrument_mode"?: string;
  "sar:frequency_band"?: "P" | "L" | "S" | "C" | "X" | "Ku" | "K" | "Ka";
  "sar:center_frequency"?: number;
  "sar:polarizations"?: ("HH" | "VV" | "HV" | "VH")[];
  "sar:product_type"?: string;
  "sar:resolution_range"?: number;
  "sar:resolution_azimuth"?: number;
  "sar:pixel_spacing_range"?: number;
  "sar:pixel_spacing_azimuth"?: number;
  "sar:looks_range"?: number;
  "sar:looks_azimuth"?: number;
  "sar:looks_equivalent_number"?: number;
  "sar:observation_direction"?: "left" | "right";
}

// Satellite Extension (sat)
export interface SatExtension {
  "sat:orbit_state"?: "ascending" | "descending" | "geostationary";
  "sat:absolute_orbit"?: number;
  "sat:relative_orbit"?: number;
  "sat:platform_international_designator"?: string;
  "sat:anx_datetime"?: string;
}

// View Geometry Extension (view)
export interface ViewExtension {
  "view:off_nadir"?: number;
  "view:incidence_angle"?: number;
  "view:azimuth"?: number;
  "view:sun_azimuth"?: number;
  "view:sun_elevation"?: number;
}

// Projection Extension (proj)
export interface ProjExtension {
  "proj:epsg"?: number;
  "proj:wkt2"?: string;
  "proj:projjson"?: object;
  "proj:geometry"?: object;
  "proj:bbox"?: number[];
  "proj:centroid"?: object;
  "proj:shape"?: number[];
  "proj:transform"?: number[];
}

// Processing Extension (processing)
export interface ProcessingExtension {
  "processing:expression"?: object;
  "processing:lineage"?: string;
  "processing:level"?: string;
  "processing:facility"?: string;
  "processing:software"?: Record<string, string>;
  "processing:version"?: string;
  "processing:datetime"?: string;
}

// Scientific Extension (sci)
export interface SciExtension {
  "sci:doi"?: string;
  "sci:citation"?: string;
  "sci:publications"?: SciPublication[];
}

export interface SciPublication {
  doi?: string;
  citation: string;
}

// Raster Extension
export interface RasterBand {
  nodata?: number | string;
  data_type?: "int8" | "int16" | "int32" | "int64" | "uint8" | "uint16" | "uint32" | "uint64" | "float16" | "float32" | "float64" | "cint16" | "cint32" | "cfloat32" | "cfloat64" | "other";
  bits_per_sample?: number;
  spatial_resolution?: number;
  scale?: number;
  offset?: number;
  sampling?: "area" | "point";
  unit?: string;
  histogram?: RasterHistogram;
  statistics?: RasterStatistics;
}

export interface RasterHistogram {
  count: number;
  min: number;
  max: number;
  buckets: number[];
}

export interface RasterStatistics {
  minimum?: number;
  maximum?: number;
  mean?: number;
  stddev?: number;
  valid_percent?: number;
}

// Extension utility functions
export class StacExtensionParser {
  
  static parseEoExtension(properties: StacItemProperties): EoExtension {
    const eo: EoExtension = {};
    
    if (properties["eo:bands"]) {
      // Type conversion from StacBand[] to EoBand[]
      eo["eo:bands"] = properties["eo:bands"].map(band => ({
        name: band.name,
        common_name: band.common_name as EoBand["common_name"],
        description: (band as any).description,
        center_wavelength: band.center_wavelength,
        full_width_half_max: band.full_width_half_max,
        solar_illumination: (band as any).solar_illumination
      }));
    }
    if (properties["eo:cloud_cover"] !== undefined) eo["eo:cloud_cover"] = properties["eo:cloud_cover"];
    if (properties["eo:snow_cover"] !== undefined) eo["eo:snow_cover"] = properties["eo:snow_cover"];
    if (properties["eo:water_cover"] !== undefined) eo["eo:water_cover"] = properties["eo:water_cover"];
    if (properties["eo:sun_azimuth"] !== undefined) eo["eo:sun_azimuth"] = properties["eo:sun_azimuth"];
    if (properties["eo:sun_elevation"] !== undefined) eo["eo:sun_elevation"] = properties["eo:sun_elevation"];
    
    return eo;
  }

  static parseSarExtension(properties: StacItemProperties): SarExtension {
    const sar: SarExtension = {};
    
    if (properties["sar:instrument_mode"]) sar["sar:instrument_mode"] = properties["sar:instrument_mode"];
    if (properties["sar:frequency_band"]) sar["sar:frequency_band"] = properties["sar:frequency_band"];
    if (properties["sar:center_frequency"]) sar["sar:center_frequency"] = properties["sar:center_frequency"];
    if (properties["sar:polarizations"]) sar["sar:polarizations"] = properties["sar:polarizations"];
    if (properties["sar:product_type"]) sar["sar:product_type"] = properties["sar:product_type"];
    if (properties["sar:resolution_range"]) sar["sar:resolution_range"] = properties["sar:resolution_range"];
    if (properties["sar:resolution_azimuth"]) sar["sar:resolution_azimuth"] = properties["sar:resolution_azimuth"];
    if (properties["sar:pixel_spacing_range"]) sar["sar:pixel_spacing_range"] = properties["sar:pixel_spacing_range"];
    if (properties["sar:pixel_spacing_azimuth"]) sar["sar:pixel_spacing_azimuth"] = properties["sar:pixel_spacing_azimuth"];
    if (properties["sar:observation_direction"]) sar["sar:observation_direction"] = properties["sar:observation_direction"];
    
    return sar;
  }

  static parseSatExtension(properties: StacItemProperties): SatExtension {
    const sat: SatExtension = {};
    
    if (properties["sat:orbit_state"]) sat["sat:orbit_state"] = properties["sat:orbit_state"] as SatExtension["sat:orbit_state"];
    if (properties["sat:absolute_orbit"]) sat["sat:absolute_orbit"] = properties["sat:absolute_orbit"];
    if (properties["sat:relative_orbit"]) sat["sat:relative_orbit"] = properties["sat:relative_orbit"];
    if (properties["sat:platform_international_designator"]) sat["sat:platform_international_designator"] = properties["sat:platform_international_designator"];
    if (properties["sat:anx_datetime"]) sat["sat:anx_datetime"] = properties["sat:anx_datetime"];
    
    return sat;
  }

  static parseViewExtension(properties: StacItemProperties): ViewExtension {
    const view: ViewExtension = {};
    
    if (properties["view:off_nadir"]) view["view:off_nadir"] = properties["view:off_nadir"];
    if (properties["view:incidence_angle"]) view["view:incidence_angle"] = properties["view:incidence_angle"];
    if (properties["view:azimuth"]) view["view:azimuth"] = properties["view:azimuth"];
    if (properties["view:sun_azimuth"]) view["view:sun_azimuth"] = properties["view:sun_azimuth"];
    if (properties["view:sun_elevation"]) view["view:sun_elevation"] = properties["view:sun_elevation"];
    
    return view;
  }

  static parseProjExtension(properties: StacItemProperties): ProjExtension {
    const proj: ProjExtension = {};
    
    if (properties["proj:epsg"]) proj["proj:epsg"] = properties["proj:epsg"];
    if (properties["proj:wkt2"]) proj["proj:wkt2"] = properties["proj:wkt2"];
    if (properties["proj:projjson"]) proj["proj:projjson"] = properties["proj:projjson"];
    if (properties["proj:geometry"]) proj["proj:geometry"] = properties["proj:geometry"];
    if (properties["proj:bbox"]) proj["proj:bbox"] = properties["proj:bbox"];
    if (properties["proj:centroid"]) proj["proj:centroid"] = properties["proj:centroid"];
    if (properties["proj:shape"]) proj["proj:shape"] = properties["proj:shape"];
    if (properties["proj:transform"]) proj["proj:transform"] = properties["proj:transform"];
    
    return proj;
  }

  static parseProcessingExtension(properties: StacItemProperties): ProcessingExtension {
    const processing: ProcessingExtension = {};
    
    if (properties["processing:expression"]) processing["processing:expression"] = properties["processing:expression"];
    if (properties["processing:lineage"]) processing["processing:lineage"] = properties["processing:lineage"];
    if (properties["processing:level"]) processing["processing:level"] = properties["processing:level"];
    if (properties["processing:facility"]) processing["processing:facility"] = properties["processing:facility"];
    if (properties["processing:software"]) processing["processing:software"] = properties["processing:software"];
    if (properties["processing:version"]) processing["processing:version"] = properties["processing:version"];
    if (properties["processing:datetime"]) processing["processing:datetime"] = properties["processing:datetime"];
    
    return processing;
  }

  static parseSciExtension(properties: StacItemProperties): SciExtension {
    const sci: SciExtension = {};
    
    if (properties["sci:doi"]) sci["sci:doi"] = properties["sci:doi"];
    if (properties["sci:citation"]) sci["sci:citation"] = properties["sci:citation"];
    if (properties["sci:publications"]) sci["sci:publications"] = properties["sci:publications"];
    
    return sci;
  }

  // Utility function to get all extension data from a STAC item
  static parseAllExtensions(properties: StacItemProperties) {
    return {
      eo: this.parseEoExtension(properties),
      sar: this.parseSarExtension(properties),
      sat: this.parseSatExtension(properties),
      view: this.parseViewExtension(properties),
      proj: this.parseProjExtension(properties),
      processing: this.parseProcessingExtension(properties),
      sci: this.parseSciExtension(properties)
    };
  }

  // Check which extensions are used by a STAC item
  static getUsedExtensions(item: StacItem | StacCollection): string[] {
    return item.stac_extensions || [];
  }

  // Check if a specific extension is used
  static hasExtension(item: StacItem | StacCollection, extensionId: string): boolean {
    return (item.stac_extensions || []).includes(extensionId);
  }

  // Get human-readable extension names
  static getExtensionName(extensionId: string): string {
    const extensionNames: Record<string, string> = {
      "https://stac-extensions.github.io/eo/v1.1.0/schema.json": "Electro-Optical",
      "https://stac-extensions.github.io/sar/v1.0.0/schema.json": "Synthetic Aperture Radar",
      "https://stac-extensions.github.io/sat/v1.0.0/schema.json": "Satellite",
      "https://stac-extensions.github.io/view/v1.0.0/schema.json": "View Geometry",
      "https://stac-extensions.github.io/projection/v1.1.0/schema.json": "Projection",
      "https://stac-extensions.github.io/processing/v1.1.0/schema.json": "Processing",
      "https://stac-extensions.github.io/scientific/v1.0.0/schema.json": "Scientific",
      "https://stac-extensions.github.io/raster/v1.1.0/schema.json": "Raster",
      "https://stac-extensions.github.io/file/v2.1.0/schema.json": "File Info",
      "https://stac-extensions.github.io/version/v1.2.0/schema.json": "Versioning"
    };

    return extensionNames[extensionId] || extensionId;
  }

  // Generate human-readable description of extension data
  static generateExtensionDescription(properties: StacItemProperties): string {
    const extensions = this.parseAllExtensions(properties);
    const descriptions: string[] = [];

    // EO Extension
    if (extensions.eo["eo:cloud_cover"] !== undefined) {
      descriptions.push(`**Cloud Cover:** ${extensions.eo["eo:cloud_cover"]}%`);
    }
    if (extensions.eo["eo:bands"] && extensions.eo["eo:bands"].length > 0) {
      descriptions.push(`**Spectral Bands:** ${extensions.eo["eo:bands"].length} bands`);
    }
    if (extensions.eo["eo:sun_elevation"] !== undefined) {
      descriptions.push(`**Sun Elevation:** ${extensions.eo["eo:sun_elevation"]}°`);
    }

    // SAR Extension
    if (extensions.sar["sar:polarizations"]) {
      descriptions.push(`**Polarizations:** ${extensions.sar["sar:polarizations"].join(", ")}`);
    }
    if (extensions.sar["sar:frequency_band"]) {
      descriptions.push(`**Frequency Band:** ${extensions.sar["sar:frequency_band"]}`);
    }
    if (extensions.sar["sar:instrument_mode"]) {
      descriptions.push(`**Instrument Mode:** ${extensions.sar["sar:instrument_mode"]}`);
    }

    // Satellite Extension
    if (extensions.sat["sat:orbit_state"]) {
      descriptions.push(`**Orbit State:** ${extensions.sat["sat:orbit_state"]}`);
    }
    if (extensions.sat["sat:relative_orbit"]) {
      descriptions.push(`**Relative Orbit:** ${extensions.sat["sat:relative_orbit"]}`);
    }

    // View Extension
    if (extensions.view["view:off_nadir"] !== undefined) {
      descriptions.push(`**Off Nadir:** ${extensions.view["view:off_nadir"]}°`);
    }
    if (extensions.view["view:incidence_angle"] !== undefined) {
      descriptions.push(`**Incidence Angle:** ${extensions.view["view:incidence_angle"]}°`);
    }

    // Processing Extension
    if (extensions.processing["processing:level"]) {
      descriptions.push(`**Processing Level:** ${extensions.processing["processing:level"]}`);
    }

    return descriptions.join("\n\n");
  }

  // Get band information with common names
  static getBandInfo(properties: StacItemProperties): EoBand[] {
    const eoBands = properties["eo:bands"] || [];
    return eoBands.map(band => ({
      name: band.name,
      common_name: band.common_name as EoBand["common_name"],
      description: (band as any).description,
      center_wavelength: band.center_wavelength,
      full_width_half_max: band.full_width_half_max,
      solar_illumination: (band as any).solar_illumination,
      displayName: band.common_name ? 
        `${band.name} (${band.common_name})` : 
        band.name
    }));
  }

  // Check if item is suitable for RGB visualization
  static canCreateRgbComposite(properties: StacItemProperties): boolean {
    const bands = this.getBandInfo(properties);
    const hasRed = bands.some(b => b.common_name === "red");
    const hasGreen = bands.some(b => b.common_name === "green");
    const hasBlue = bands.some(b => b.common_name === "blue");
    
    return hasRed && hasGreen && hasBlue;
  }

  // Get suggested band combinations for visualization
  static getSuggestedBandCombinations(properties: StacItemProperties): Array<{ name: string; bands: string[]; description: string }> {
    const bands = this.getBandInfo(properties);
    const combinations: Array<{ name: string; bands: string[]; description: string }> = [];

    // True Color (RGB)
    const red = bands.find(b => b.common_name === "red")?.name;
    const green = bands.find(b => b.common_name === "green")?.name;
    const blue = bands.find(b => b.common_name === "blue")?.name;
    
    if (red && green && blue) {
      combinations.push({
        name: "True Color",
        bands: [red, green, blue],
        description: "Natural color composite using red, green, and blue bands"
      });
    }

    // False Color Infrared
    const nir = bands.find(b => b.common_name === "nir")?.name;
    if (nir && red && green) {
      combinations.push({
        name: "False Color Infrared",
        bands: [nir, red, green],
        description: "Highlights vegetation in red using near-infrared, red, and green bands"
      });
    }

    // SWIR Composite
    const swir16 = bands.find(b => b.common_name === "swir16")?.name;
    const swir22 = bands.find(b => b.common_name === "swir22")?.name;
    if (swir22 && swir16 && red) {
      combinations.push({
        name: "SWIR Composite", 
        bands: [swir22, swir16, red],
        description: "Useful for geology and burn scar analysis using SWIR bands"
      });
    }

    return combinations;
  }
}