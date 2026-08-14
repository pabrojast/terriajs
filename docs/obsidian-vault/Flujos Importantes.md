# Flujos Importantes

Ver tambien: [[Arquitectura]], [[Modulos]], [[Testing]], [[Deployment]]

## 1. Arranque de Terria

Archivo clave: `lib/Models/Terria.ts`

Secuencia observada:

1. `Terria.start(...)` lee `configUrl`.
2. Carga JSON/JSON5 y aplica `parameters` con `updateParameters(...)`.
3. Resuelve `initializationUrls` y posibles `v7initializationUrls`.
4. Inicializa i18n.
5. Inicializa `ServerConfig`, proxy CORS y `ShareDataService`.
6. Inicializa basemaps y search providers.
7. Restaura estado desde URL/hash/share y luego carga init sources.

## 2. Carga y aplicacion de init sources

Archivos clave:

- `lib/Models/InitSource.ts`
- `lib/Models/Terria.ts`
- `doc/contributing/init-sources.md`

Fuentes observadas:

- `initializationUrls` del config
- fragments/hash
- `#start=...`
- `#share=...`
- rutas `/catalog/:id`
- rutas `/story/:id`
- conversion de v7 a v8 via `catalog-converter`

Estado observable relevante dentro de `initSources`:

- `pickedFeatures` puede restaurar la seleccion consultada en el mapa.
- `featureInfoPanel` puede restaurar posicion y dimensiones de la ventana flotante de feature info cuando el share/story incluye un pick activo.

## 3. Registro de tipos de catalogo y busqueda

Archivos clave:

- `lib/Models/Catalog/registerCatalogMembers.ts`
- `lib/Models/SearchProviders/registerSearchProviders.ts`

El sistema registra tipos de catalog items, groups, references y functions para que puedan crearse desde JSON/config.

## 4. Carga de archivos del usuario

Archivos clave:

- `lib/Models/Catalog/addUserFiles.ts`
- `lib/Models/Catalog/createCatalogItemFromFileOrUrl.ts`

Flujo observado:

1. Se detecta tipo o se usa el seleccionado.
2. Se crea un item temporal `ResultPendingCatalogItem`.
3. Si el archivo JSON contiene `catalog` o `stories`, se trata como init file.
4. Si no, se crea un catalog member desde archivo/URL.
5. El item se agrega al catalogo y workbench; si es temporal, tambien al timeline cuando aplica.

## 5. Indexacion de catalogo para search

Archivos clave:

- `buildprocess/generateCatalogIndex.ts`
- `lib/Models/SearchProviders/CatalogIndex.ts`

El indice se genera offline y se carga on-demand cuando hay `catalogIndexUrl`. Usa `flexsearch`.

## 6. Cambio entre 2D y 3D

Archivo clave: `lib/ViewModels/TerriaViewer.ts`

- Carga asincronamente `Leaflet` o `Cesium`.
- Usa `NoViewer` mientras el chunk real no esta listo.
- Maneja basemap, attach de contenedor y eventos de cambio de viewer.

## 7. Build de documentacion

Archivos clave:

- `gulpfile.js`
- `buildprocess/webpack-tools.config.js`
- `buildprocess/generateDocs.ts`
- `doc/mkdocs.yml`

El flujo `yarn gulp docs`:

1. genera atribuciones
2. build de herramientas de docs
3. copia `doc/` a `build/doc`
4. genera paginas de catalog members
5. ejecuta `mkdocs build`
6. publica salida en `wwwroot/doc`

## 8. CI, publish y demo deploy

Archivos clave:

- `.github/workflows/ci.yml`
- `.github/workflows/npm-publish.yml`
- `.github/workflows/deploy.yml`
- `buildprocess/ci-deploy.sh`

## 9. Styling y leyenda de COG

Archivos clave:

- `lib/Models/Catalog/CatalogItems/CogRenderStyle.ts`
- `lib/Models/Catalog/CatalogItems/CogRasterPostProcessor.ts`
- `lib/Models/Catalog/CatalogItems/CogLegendStratum.ts`
- `lib/Models/Catalog/CatalogItems/CogCatalogItem.ts`
- `lib/Models/Catalog/CatalogItems/CogTimeSeriesCatalogItem.ts`
- `lib/Models/Workflows/CogStylingWorkflow.ts`

Flujo observado para `cog` y `cog-time-series`:

1. El proveedor carga los metadatos y detecta si el render es de una sola banda.
2. `CogRenderStyle` resuelve una representacion efectiva unica para mapa, workflow y leyenda: dominio, paleta con posiciones exactas, inversion, clamps y rango visible.
3. Un `domain` configurado y valido (`min < max`) permanece fijo. Si no existe, se obtiene de los metadatos del proveedor; para un mosaico temporal se agrega un dominio comun entre todos los COG de la fecha activa.
4. `displayRange` filtra valores de manera inclusiva (`min <= valor <= max`). Si `applyDisplayRange` esta activo y no hay rango explicito, usa el dominio efectivo. Un rango invalido no se aplica.
5. Los clamps inferior y superior son independientes y, cuando no se configuran, ambos quedan activos. `noDataColor` se aplica despues del render solo a pixeles realmente marcados como no-data.
6. La leyenda automatica se deriva del mismo estilo efectivo despues de cargar el COG. Se genera solo para render de una banda; RGB y multibanda quedan sin leyenda automatica. Una leyenda configurada explicitamente mantiene precedencia.

La paleta activa se identifica con `colorScaleMode` (`default`, `named` o `custom`). Esto evita que colores heredados o residuales desplacen silenciosamente la seleccion actual. Las escalas continuas conservan las posiciones reales de cada stop; las discretas muestrean esa misma rampa segun `numberOfBins`.

## Nota

- **Inferencia:** el deploy continuo de aplicacion no empaqueta TerriaJS solo; clona TerriaMap, injerta la version/branch actual de TerriaJS y despliega esa app resultante.
