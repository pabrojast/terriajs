# STAC (SpatioTemporal Asset Catalog) Support

TerriaJS provides full support for STAC (SpatioTemporal Asset Catalog) APIs, allowing you to browse and visualize Earth observation data from STAC-compliant catalogs like Copernicus Data Space.

## Overview

STAC is a specification for describing geospatial information, commonly used for satellite imagery and Earth observation data. TerriaJS supports:

- **STAC Version**: 1.1.0
- **STAC Catalog Groups**: Browse collections and organize data hierarchically
- **STAC Items**: Visualize individual assets from STAC items
- **Advanced Search**: Spatial, temporal, and attribute-based filtering
- **Multiple Asset Types**: Support for COG, imagery, and other visualizable formats

## Configuration

### Basic STAC Catalog Group

```json
{
  "type": "stac-group",
  "name": "Copernicus Data Space",
  "url": "https://stac.dataspace.copernicus.eu/v1/"
}
```

### Advanced Configuration

```json
{
  "type": "stac-group", 
  "name": "Sentinel-2 Data",
  "url": "https://stac.dataspace.copernicus.eu/v1/",
  "collections": ["sentinel-2-l2a", "sentinel-2-l1c"],
  "searchFilters": [
    {
      "property": "eo:cloud_cover",
      "operator": "lt",
      "values": ["20"]
    },
    {
      "property": "instruments",
      "operator": "in", 
      "values": ["MSI"]
    }
  ],
  "spatialExtent": [-10, 35, 30, 70],
  "temporalExtent": ["2023-01-01T00:00:00Z", "2023-12-31T23:59:59Z"],
  "maxItems": 50,
  "groupByCollection": true,
  "authToken": "your-auth-token-here"
}
```

## Configuration Properties

### StacCatalogGroup Properties

| Property | Type | Description | Example |
|----------|------|-------------|---------|
| `url` | string | **Required.** Base URL of the STAC API | `"https://stac.dataspace.copernicus.eu/v1/"` |
| `collections` | string[] | Specific collection IDs to load. If not specified, all collections are loaded | `["sentinel-2-l2a", "sentinel-1-grd"]` |
| `searchFilters` | object[] | Filters to apply when searching STAC items | See search filters section |
| `spatialExtent` | number[] | Bounding box [west, south, east, north] in WGS84 | `[-180, -90, 180, 90]` |
| `temporalExtent` | string[] | Time range [start, end] in ISO 8601 format | `["2023-01-01T00:00:00Z", "2023-12-31T23:59:59Z"]` |
| `maxItems` | number | Maximum items to load per collection (default: 100) | `50` |
| `groupByCollection` | boolean | Organize items into collection subgroups (default: true) | `false` |
| `autoLoadItems` | boolean | Automatically load items when opening collections (default: true) | `false` |
| `authToken` | string | Bearer token for authentication | `"your-token-here"` |
| `assetTypes` | string[] | Filter items by preferred asset types | `["visual", "data"]` |
| `sortField` | string | Field to sort results by (prefix with '-' for descending) | `"-datetime"` |

### Search Filters

Search filters are converted to CQL2 queries and support various operators:

```json
{
  "searchFilters": [
    {
      "property": "eo:cloud_cover",
      "operator": "lt",
      "values": ["20"]
    },
    {
      "property": "platform",
      "operator": "in",
      "values": ["Sentinel-2A", "Sentinel-2B"]
    },
    {
      "property": "datetime",
      "operator": "gte", 
      "values": ["2023-06-01T00:00:00Z"]
    }
  ]
}
```

**Supported Operators:**
- `eq` - Equal to
- `lt` - Less than
- `lte` - Less than or equal
- `gt` - Greater than
- `gte` - Greater than or equal
- `in` - In array
- `like` - Pattern matching

### StacCatalogItem Properties

| Property | Type | Description |
|----------|------|-------------|
| `url` | string | **Required.** Direct URL to STAC item or API base URL |
| `stacItemId` | string | STAC item ID (used with API base URL) |
| `collectionId` | string | Collection ID (used with API base URL) |
| `preferredAssetTypes` | string[] | Asset types to prefer for visualization |
| `selectedAssetKey` | string | Key of currently selected asset |
| `authToken` | string | Bearer token for authentication |
| `useCogOptimization` | boolean | Use COG optimizations when available (default: true) |

## Examples

### Copernicus Data Space

```json
{
  "type": "stac-group",
  "name": "Copernicus Data Space",
  "url": "https://stac.dataspace.copernicus.eu/v1/",
  "description": "Access to Copernicus Earth observation data via STAC",
  "collections": ["sentinel-2-l2a", "sentinel-1-grd"],
  "searchFilters": [
    {
      "property": "eo:cloud_cover",
      "operator": "lt",
      "values": ["30"]
    }
  ],
  "maxItems": 100,
  "authToken": "${COPERNICUS_TOKEN}"
}
```

### Specific STAC Item

```json
{
  "type": "stac-item",
  "name": "Sentinel-2 L2A Scene",
  "url": "https://stac.dataspace.copernicus.eu/v1/",
  "collectionId": "sentinel-2-l2a", 
  "stacItemId": "S2A_MSIL2A_20231201T103251_N0509_R108_T32UPU_20231201T134115",
  "preferredAssetTypes": ["visual", "data"],
  "authToken": "${COPERNICUS_TOKEN}"
}
```

### Low Cloud Cover Imagery

```json
{
  "type": "stac-group",
  "name": "Clear Sky Imagery",
  "url": "https://stac.dataspace.copernicus.eu/v1/",
  "collections": ["sentinel-2-l2a"],
  "searchFilters": [
    {
      "property": "eo:cloud_cover",
      "operator": "lt",
      "values": ["10"]
    }
  ],
  "spatialExtent": [2.0, 48.5, 2.7, 49.0],
  "temporalExtent": ["2023-06-01T00:00:00Z", "2023-08-31T23:59:59Z"],
  "sortField": "-datetime"
}
```

## Authentication

Many STAC APIs require authentication. TerriaJS supports Bearer token authentication:

1. **Environment Variables**: Use `${TOKEN_NAME}` in your catalog config
2. **Direct Token**: Set the `authToken` property directly
3. **User Input**: Prompt users for authentication tokens

```json
{
  "authToken": "${COPERNICUS_AUTH_TOKEN}"
}
```

## Asset Visualization

STAC items contain multiple assets. TerriaJS automatically:

1. **Asset Selection**: Chooses the best asset for visualization based on roles and media types
2. **Format Support**: Supports COG, GeoTIFF, and other imagery formats
3. **Asset Switching**: Allows users to switch between available assets

### Asset Priority

TerriaJS prioritizes assets in this order:
1. Assets with `visual` role
2. Assets with `data` role  
3. Assets with `overview` role
4. Other visualizable assets

## Supported STAC Extensions

TerriaJS recognizes and utilizes data from these STAC extensions:

- **Electro-Optical (eo)**: Cloud cover, bands information
- **SAR**: Orbit state, relative orbit
- **View Geometry**: Sun angles, view angles
- **Projection**: Coordinate reference systems
- **File**: File size information

## Performance Considerations

- **Pagination**: Large collections are paginated automatically
- **Lazy Loading**: Items are loaded on demand
- **Caching**: API responses are cached according to `cacheDuration`
- **COG Optimization**: Cloud Optimized GeoTIFFs are rendered efficiently

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure the STAC API supports CORS or use a proxy
2. **Authentication**: Verify your auth token is valid and has necessary permissions
3. **Large Collections**: Use filters to reduce the number of items loaded
4. **Asset Visualization**: Check that assets have supported media types

### Debug Information

Enable debug logging to see STAC API requests:

```javascript
// In browser console
localStorage.setItem('terriajs-debug', 'stac');
```

## Advanced Features (Phase 3)

### Advanced Search and Filtering

The STAC implementation includes sophisticated search capabilities:

#### Queryable Properties
Automatically discovers and uses STAC queryables for dynamic filtering:

```json
{
  "type": "stac-group",
  "url": "https://stac.dataspace.copernicus.eu/v1/",
  "searchFilters": [
    {
      "property": "eo:cloud_cover",
      "operator": "lt", 
      "values": ["15"]
    },
    {
      "property": "instruments",
      "operator": "in",
      "values": ["MSI", "SLSTR"]
    }
  ]
}
```

#### Preset Filter Collections
Built-in filter sets for common scenarios:

- **Clear Sky**: `eo:cloud_cover < 20%`
- **Recent Data**: Last 30/90 days
- **High Resolution**: `gsd <= 10m`
- **Specific Instruments**: Sentinel-2 MSI, Sentinel-1 SAR, etc.

### STAC Extensions Support

Full support for major STAC extensions:

#### Electro-Optical (eo)
- Cloud cover filtering and display
- Spectral band information
- Sun angle metadata
- Snow/water cover statistics

#### Synthetic Aperture Radar (sar)
- Polarization information
- Frequency band details
- Instrument modes
- Resolution parameters

#### Satellite (sat)
- Orbit information (ascending/descending)
- Relative orbit numbers
- Platform designators

#### View Geometry (view)
- Off-nadir angles
- Incidence angles
- Sun/sensor geometry

### Advanced Asset Management

#### Smart Asset Selection
- Automatic prioritization of visualizable assets
- Role-based asset filtering (`visual`, `data`, `thumbnail`)
- Format-specific optimization (COG, GeoTIFF, etc.)

#### Multi-Asset Support
- Preview multiple assets before selection
- Asset metadata display (file size, format, roles)
- Direct download links

### Spectral Band Visualization

#### Band Information Display
- Spectral band metadata from EO extension
- Wavelength and FWHM information
- Common name mapping (red, green, blue, NIR, etc.)

#### RGB Composite Generation
- Suggested band combinations (True Color, False Color IR, etc.)
- Custom RGB composite creation
- Band selection interface

### Pagination and Performance

#### Intelligent Loading
- Lazy loading of large collections
- Configurable page sizes
- Token-based pagination support
- Infinite scroll capabilities

#### Memory Management  
- Automatic cleanup of unused resources
- Efficient caching strategies
- Background loading optimization

### Link Relationship Navigation

#### STAC Link Support
- Parent/child navigation
- Collection relationships
- Alternative format links
- Service documentation links

#### Breadcrumb Navigation
- Hierarchical navigation paths
- Back/forward navigation
- Quick access to parent resources

### UI Components

#### Advanced Search Interface
- Visual filter builder
- Spatial extent selection (draw on map)
- Temporal range picker
- Collection multi-select

#### Asset Selector
- Grid view of available assets
- Asset previews and metadata
- One-click asset switching

#### Band Selector
- Interactive spectral band information
- RGB composite preview
- Band combination suggestions

## Integration Examples

### Complete Advanced Configuration

```json
{
  "type": "stac-group",
  "name": "Advanced Sentinel-2 Search",
  "url": "https://stac.dataspace.copernicus.eu/v1/",
  "collections": ["sentinel-2-l2a"],
  "searchFilters": [
    {
      "property": "eo:cloud_cover",
      "operator": "lt",
      "values": ["15"]
    },
    {
      "property": "gsd",
      "operator": "lte", 
      "values": ["20"]
    }
  ],
  "spatialExtent": [2.0, 48.5, 2.7, 49.0],
  "temporalExtent": ["2023-06-01T00:00:00Z", "2023-08-31T23:59:59Z"],
  "maxItems": 100,
  "sortField": "-datetime",
  "authToken": "${COPERNICUS_TOKEN}",
  "assetTypes": ["visual", "data"],
  "groupByCollection": false,
  "autoLoadItems": true
}
```

### Extension-Specific Filtering

```json
{
  "searchFilters": [
    {
      "property": "sat:orbit_state",
      "operator": "eq",
      "values": ["descending"]
    },
    {
      "property": "sar:polarizations",
      "operator": "in",
      "values": ["VV", "VH"]
    },
    {
      "property": "view:off_nadir",
      "operator": "lt",
      "values": ["30"]
    }
  ]
}
```

## Performance Optimization

### Best Practices

1. **Use Spatial Filters**: Always constrain searches spatially when possible
2. **Limit Time Ranges**: Use reasonable temporal extents
3. **Filter Early**: Apply property filters at the API level, not client-side
4. **Page Sizes**: Use appropriate page sizes (20-100 items)
5. **Asset Prefiltering**: Specify preferred asset types to reduce loading

### Caching Strategy

- Collection metadata: 1 hour
- Search results: 15 minutes  
- Item details: 30 minutes
- Queryables: 24 hours

## Related Documentation

- [Catalog Items](catalog-items.md)
- [Catalog Groups](catalog-groups.md) 
- [Authentication](../customizing/authentication.md)
- [STAC Specification](https://stacspec.org/)
- [STAC Extensions](https://stac-extensions.github.io/)