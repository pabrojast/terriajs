# Modulos

Ver tambien: [[Arquitectura]], [[Flujos Importantes]], [[Estructura del Repo]]

## Modulos y carpetas clave

| Modulo/carpeta                     | Responsabilidad                                                     | Archivos de entrada utiles                                          |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `lib/Models/Terria.ts`             | estado raiz, start, config, init sources, sharing, viewer principal | `Terria.ts`                                                         |
| `lib/Models/Catalog/`              | items, groups, references, functions y fabrica de catalog members   | `registerCatalogMembers.ts`, `CatalogMemberFactory.ts`              |
| `lib/ModelMixins/`                 | capacidades reusables para modelos                                  | `CatalogMemberMixin`, `MappableMixin`, `ReferenceMixin`, `UrlMixin` |
| `lib/Traits/`                      | definicion de propiedades configurables y strata                    | `TraitsClasses/`, `mixTraits.ts`                                    |
| `lib/Map/`                         | integracion con Cesium/Leaflet y providers                          | `ImageryProvider/`, `Leaflet/`, `Cesium/`                           |
| `lib/ReactViewModels/ViewState.ts` | estado de UI                                                        | `ViewState.ts`                                                      |
| `lib/ViewModels/TerriaViewer.ts`   | ciclo de vida del viewer y carga 2D/3D                              | `TerriaViewer.ts`                                                   |
| `lib/ReactViews/`                  | UI React estandar                                                   | `StandardUserInterface/`                                            |
| `lib/Models/SearchProviders/`      | search providers y catalog index                                    | `registerSearchProviders.ts`, `CatalogIndex.ts`                     |
| `lib/Models/BaseMaps/`             | basemaps y modelo asociado                                          | `BaseMapsModel.ts`                                                  |
| `lib/Models/Workflows/`            | workflows de dimensiones y paneles                                  | `SelectableDimensionWorkflow`                                       |
| `buildprocess/`                    | build/test/docs/CI utilities                                        | `configureWebpack.js`, `createKarmaBaseConfig.js`                   |

## Subdominios del catalogo observados

Dentro de `lib/Models/Catalog/` hay conectores y familias de integracion para:

- OWS: WMS, WMTS, WFS, WPS, CSW, SOS
- Esri/ArcGIS
- CKAN
- STAC
- SDMX
- GTFS
- GLTF / AssImp
- OpenDataSoft
- Socrata
- Thredds
- formatos de archivo como CSV, GeoJSON, KML, CZML, GPX, Shapefile

## Search y navegacion

- `SearchProviderFactory` registra proveedores de busqueda.
- `CatalogIndex` carga y consulta indices de catalogo.
- `MapNavigationModel` y `ViewingControlsMenu` soportan controles del mapa.

## Assets y traducciones

- `wwwroot/languages/` contiene los paquetes de idioma.
- `wwwroot/data/regionMapping.json` es un asset relevante para datos tabulares/regionales.

## Nota

- **Inferencia:** `lib/ReactViewModels` y `lib/ViewModels` coexisten por razones historicas; en la practica ambos participan del estado cercano a UI.
