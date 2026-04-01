# Arquitectura

Ver tambien: [[Index]], [[Modulos]], [[Flujos Importantes]], [[Glosario]]

## Resumen

TerriaJS es una libreria geoespacial web con estado reactivo en MobX, UI en React y dos engines de mapa: Cesium para 3D y Leaflet para 2D.

El estado raiz vive en `lib/Models/Terria.ts`. La UI estandar se construye encima de `lib/ReactViewModels/ViewState.ts` y `lib/ReactViews/StandardUserInterface/`. El cambio entre viewers se orquesta en `lib/ViewModels/TerriaViewer.ts`.

## Capas principales

- `lib/Core`: utilidades de bajo nivel sin dependencia de UI.
- `lib/Map`: adaptadores y extensiones para Cesium y Leaflet.
- `lib/Charts`: logica de charts sin depender directamente de React.
- `lib/Models`: nucleo del dominio, catalogo, configuracion, workflows, sharing, base maps.
- `lib/ModelMixins`: capacidades reutilizables para modelos.
- `lib/Traits`: definicion de configuracion tipada y estratificada.
- `lib/ReactViewModels` y `lib/ViewModels`: estado cercano a UI y adaptadores.
- `lib/ReactViews`: componentes React.

## Piezas estructurales

### 1. Estado raiz

- `Terria` concentra configuracion, modelos, workbench, viewer principal, catalog index, sharing, server config y carga de init sources.
- `Terria.start(...)` carga `config.json`/JSON5, inicializa i18n, server config, proxy, basemaps y search providers.

### 2. Sistema de traits y strata

- Los modelos configurables usan `Traits` para definir propiedades.
- Los valores se resuelven por strata: defaults, loadable, definition y user.
- La documentacion mas actual sobre este enfoque esta en `doc/contributing/model-layer.md` y `doc/contributing/traits-in-depth.md`.

### 3. Mixins y catalog members

- Los catalog items/groups/functions se componen con mixins.
- Los tipos concretos se registran en `lib/Models/Catalog/registerCatalogMembers.ts`.
- Esto habilita la fabrica `CatalogMemberFactory` para construir modelos desde JSON/init files.

### 4. Viewer abstraido

- `TerriaViewer` carga Cesium o Leaflet de forma asincrona.
- Mientras el viewer real no esta disponible, usa `NoViewer`.
- La seleccion de basemap y el cambio 2D/3D pasan por este objeto.

### 5. UI estandar

- La UI por defecto se exporta desde `lib/ReactViews/StandardUserInterface/index.ts`.
- `ViewState` administra paneles, preview, mobile view, help, trainer bar, story state y varios toggles de interfaz.

## Entrypoints tecnicos observados

- Build de specs: `gulpfile.js` + `buildprocess/webpack.config.make.js`
- Build de herramientas de Node: `buildprocess/webpack-tools.config.js`
- Test bootstrap: `test/SpecMain.ts`
- Server local: `terriajs-server` invocado por script npm o tarea de Gulp

## Decisiones y notas

- `architecture/` contiene ADRs numerados.
- `doc/contributing/architecture.md` declara explicitamente que necesita actualizacion mayor para TerriaJS v8.
- `doc/contributing/model-layer.md` parece ser la referencia mas actual para la capa de modelos.

## Lectura recomendada del codigo

- Estado raiz: `lib/Models/Terria.ts`
- UI state: `lib/ReactViewModels/ViewState.ts`
- Viewer: `lib/ViewModels/TerriaViewer.ts`
- Registro de catalog members: `lib/Models/Catalog/registerCatalogMembers.ts`
- Search providers: `lib/Models/SearchProviders/registerSearchProviders.ts`
