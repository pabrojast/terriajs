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

## Preguntar a los datos

`DataAssistantViewModel` mantiene una conversacion temporal por `ViewState`, ligada a `CkanSession`. El panel se carga bajo demanda desde el menu de escritorio/movil. El navegador envia preguntas a `/api/terriassistant/data`; CKAN valida sesion, CSRF y permisos, y ejecuta el bucle de herramientas con DeepSeek Flash en una cola RQ separada. La API key nunca llega al cliente.

`Models/DataAssistant/TableTools.ts` calcula sobre todas las filas cargadas (hasta 150000), no sobre una muestra: filtros, estadisticas, agrupacion, series, tendencia anual, Pearson y atipicos IQR. `LayerTools.ts` reutiliza los lectores COG para punto/poligono, banda, fechas, NoData y escala fisica; informa fechas fallidas y nivel de resolucion. La suma de mosaicos no deduplica teselas solapadas y lo advierte. Una imagen WMS sin valores numericos no permite estos calculos.

El backend puede buscar y leer recursos CKAN autorizados (CSV, GeoJSON y DataStore); las otras fuentes requieren una capa cargada. `ckanResourceId` y `ckanDatasetId` conservan procedencia; no conceden permisos. Cada resultado tiene evidencia, parametros, cobertura y fuente. Los botones para agregar, acercar y filtrar requieren un clic; las capas filtradas son temporales y no compartibles. Cerrar el panel conserva la conversacion; cambiar de cuenta, salir o destruir `ViewState` limpia el estado local. No se persiste en shares ni localStorage.

## Asistente IA: propuestas de edición y descubrimiento

El acceso se presenta como **AI Assistant / Asistente IA**. Conserva `dataAssistant` y `/api/terriassistant/data`. El bootstrap negocia `capabilities.map_editing=1`; con un backend anterior siguen disponibles las consultas originales. `MapEdits` describe capacidades reales de cada modelo y envía un contexto acotado sin URLs de datos, tokens ni archivos. Las selecciones de análisis siguen siendo independientes del mapa completo.

Las propuestas contienen operaciones tipadas, identificador y revisión de partida. Se validan todas antes de aplicar; las cargas se preparan antes de modificar el workbench. Los cambios de presentación viven en `CommonStrata.user`. El historial de deshacer conserva solo las propiedades afectadas y, cuando corresponda, orden, cámara y mapa base; rechaza conflictos con ediciones manuales. Cerrar el panel mantiene la conversación; cambiar de cuenta limpia conversación, propuestas e historial.

Se admiten composición, estilos de tablas/vectores, COG y estilos WMS anunciados. El backend convierte la especificación de estilo en traits y el navegador vuelve a validarlos. Las leyendas se regeneran a partir del estilo aplicado. Se reutilizan los cargadores de archivos/URLs y la serialización de compartir. Los archivos locales, capas privadas y otras capas no compartibles quedan excluidos del enlace y se identifican en el panel. No se publican datasets ni se guardan vistas CKAN.

El buscador del panel y `search_catalog` usan la misma búsqueda autorizada: `package_search` con `extras.ext_bbox`, seguida de intersección con la cobertura declarada del dataset. El cursor permite continuar tanto datasets como recursos; los lotes vacíos con candidatos pendientes no significan ausencia de datos. El corpus de conocimiento del backend contiene guías versionadas por formato; las vistas CKAN se consultan con permisos y no se indexan en ese corpus compartido.
