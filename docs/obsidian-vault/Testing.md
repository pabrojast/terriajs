# Testing

Ver tambien: [[Comandos Utiles]], [[Setup Local]], [[Troubleshooting]]

## Stack de testing

- Framework: Jasmine
- Runner: Karma
- React testing: `@testing-library/react` y `@testing-library/jasmine-dom`
- Cobertura: `coverage-istanbul`

## Bootstrap observado

Archivo clave: `test/SpecMain.ts`

- inicializa prerequisitos del navegador
- registra catalog members
- configura MobX para tests
- inicializa i18next en modo `cimode`
- agrega matchers de `jasmine-dom`

## Comandos

```bash
yarn gulp test
yarn gulp test-firefox
```

## Como corre el suite

- Webpack empaqueta specs a `wwwroot/build/TerriaJS-specs.js`
- Karma sirve archivos desde `wwwroot/`
- `karma-local.conf.js` detecta browsers locales y genera cobertura
- `karma-firefox.conf.js` fuerza Firefox

## Estructura de tests

- Los tests viven en `test/`
- La estructura replica bastante bien `lib/`
- Hay fixtures y datos en `wwwroot/test/`

### Enlaces compartidos y series acumuladas

`BuildShareLinkSpec.ts` verifica que las series de un COG se serializan y se restauran mediante `Terria.applyInitData` tanto sin `pickedFeatures` como con un pick vacio. Esta regresion se detecto al abrir una Story de Dnipro y volver a compartir: el grafico seguia visible, pero el JSON omitia las series. La validacion integrada usa el enlace del usuario, cuatro capitulos y dos series con 37/36 puntos; el WAF se prueba separadamente en `ckan-unesco-docker/deploy/envoy-dev/check_terria_share.py`.

### Cobertura de styling COG

- `test/Models/Catalog/CatalogItems/CogRenderStyleSpec.ts` cubre resolucion de dominio y paleta, inversion, clamps, rangos inclusivos, validacion y `nativeDomain` cuando hay un `domain` configurado.
- `test/Models/Catalog/CatalogItems/CogLegendStratumSpec.ts` cubre leyendas continuas (ticks min/max del domain), discretas, override de bins y omision multibanda.
- `CogCatalogItemSpec.ts` y `CogTimeSeriesCatalogItemSpec.ts` cubren la integracion tras la carga, incluida la leyenda automatica, un dominio de share fijo entre fechas y la precedencia de leyendas explicitas.
- `CogStylingWorkflowSpec.ts` cubre la edicion repetida de estilos, la seleccion explicita de paleta, los defaults visibles del workflow y el auto-fit de series.

### Cobertura de series COG (pasos, pick y serie en punto)

- `CogTimeSeriesCatalogItemSpec.ts`, bloque "time stepping": reuso de pasos por URL (con tags repetidos), build superado que no se publica, restyle que conserva la cache, LRU que no expulsa el paso visible, precarga con `alpha: 0` promovida sin capa nueva y rebuild ante opciones de construccion. Bloque "value at a point": un feature con `position`, valor fisico, unidad y fecha; una sola respuesta por click en mosaicos; no-data frente a fuera de cobertura; el pick nunca rechaza; serie del punto, contrato del dock y restauracion desde share; dominio en unidades almacenadas frente a fisicas.
- `CogTimeSeriesCatalogItemSpec.ts`, bloque "resolutions": valores de la resolucion activa frente a los compartidos del item, fallback a la primera, cambio mensual a anual que conserva el periodo (`fromContinuous: "previous"`), escala y resampling por resolucion, limpieza del rango del usuario, reuso de pasos al ir y volver, carga unica por URL, dimensiones del workbench y validez de `wwwroot/test/init/cog-time-series-example.json`.
- `CogTimeSeriesCatalogItemSpec.ts`, bloque "with real imagery providers": sin stubs, con `terriajs-tiff-imagery-provider` y el fixture `4326.tif`. Cubre el build con `domain` configurado sin leer estadisticas, el rango nativo bajo demanda, el dominio nativo cuando no hay `domain`, y el pick + serie del punto a traves del `pickFeatures` que llamaria Cesium.
- `CogTimeSeriesCatalogItemSpec.ts`, bloque "statistics, places and long series": banda/estilo/unidad de la estadistica activa, persistencia del `id` entre resoluciones con otro numero de banda, relectura de series al cambiar de banda, leyenda por paradas reales, lugar → zoom + serie con nombre que sobrevive a un share, ventana centrada en la fecha visible y relectura fuera de ella, y descarte de un click sin datos. En "time stepping": la precarga de cabeceras solo ocurre con `prefetchHeaders`.
- Datos reales en un navegador real: un spec temporal (no se commitea) que carga el init de produccion con `upsertModelFromJson` contra los blobs de Azure y escribe mediciones con `console.log` (karma con `client.captureConsole`). Asi se validaron Dnipro y Madagascar; ver la memoria del proyecto.
- `test/Core/CogPointReaderSpec.ts` cubre la matematica de pixel, la reproyeccion (fixture `32756.tif`), la clasificacion de no-data sin adivinar centinelas, la escala, el orden hacia afuera, el conteo separado de errores y la cancelacion.
- `test/Core/CogSourceCacheSpec.ts` cubre la apertura compartida, que un fallo no se cachea, la adopcion de GeoTIFF y las estadisticas por URL.
- `test/ReactViews/Custom/Chart/ChartJs/chartJsStatsSpec.ts` cubre estadisticas, maximo, valor en una fecha exacta, tendencia (y cuando no se informa) y formato. `test/Models/ChartSeriesAccumulatorSpec.ts` cubre el guard estructural, la activacion del CSV y el contexto del dock de COG (marcador, salto de fecha, progreso y cancelacion).
- `test/Core/CogSharedPoolsSpec.ts` cubre los pools compartidos y sirve de alarma sobre los internos de `terriajs-tiff-imagery-provider` que se usan (`workerPool`, `geotiffWorkerPool`, `_loadTile`, `_source`): si una actualizacion de la libreria los cambia, falla aqui.
- Los stubs de `_createImageryProvider` dejan lecturas en curso; los specs cancelan las series (`clearAccumulatedSeries`) antes de vaciar `CogSourceCache`, y `readCogStepPointValue` no abre un COG con el `signal` ya abortado.

### Cobertura de sesion CKAN

- `test/Models/CkanSessionSpec.ts` cubre `CkanSession` contra HTTP stubbeado: inercia sin `configParameters.ckanSession`, conservacion de la clave en `updateParameters`, anonimo sin cambios en el catalogo, alta de un unico grupo `ckan-private-catalog` con referencia `ckan-private-catalog-reference` y carga ansiosa, nonce estable para el mismo usuario, logout que elimina grupo, descendientes, huerfanos `__ckan_private_catalog__/*` y capas del workbench (y notifica en cada logout), cambio de usuario A -> B, dedupe contra un id pre-creado por share, convivencia con un miembro inyectado por `#start=`, whoami 500 (conserva el grupo y no llama a `raiseErrorToUser`) y 401 (anonimo), `handleUnauthorized`, respuestas obsoletas, respuestas que no son un whoami (403, HTML de login, JSON no-objeto: `error` y el grupo se conserva), payloads malformados, URLs no seguras de servidor y de config, `isSafeRelativePath`, `buildLoginHref`, `openLogin`/`openLogout`, throttle por foco, notificacion `shareRequiresLogin` (con la re-aplicacion unica del share tras el login) y `dispose`. `BuildShareLinkSpec.ts` comprueba que el share quita el `token` solo de los items `__ckan_private_catalog__/`.
- `test/Models/Catalog/CatalogReferences/CkanPrivateCatalogReferenceSpec.ts` cubre el registro en `CatalogMemberFactory`, la carga como `terria-reference` sin proxy, el mapeo de 401/403 a `TerriaError` con severidad `Error` y claves `ckanSession.errors.*` (mas la llamada a `handleUnauthorized`), el relanzado de un 500 sin cambios y el funcionamiento sin `terria.ckanSession`.
- `test/ReactViews/Map/Panels/CkanSessionPanel/CkanSessionPanelSpec.tsx` renderiza el panel con `createWithContexts` (`test/ReactViews/withContext.tsx`) y un `CkanSession` con `refresh` espiado: nada sin sesion, boton "checking" clicable, enlace de login con `came_from` y `target="_blank"` que marca `pendingLogin`, estado pendiente, `MobileMenuItem` como enlace o boton en movil, nombre y acciones autenticado, enlace de perfil y aviso de administrador, "Open my private datasets" (explorador visible y `activeTabIdInCategory`), reintento en error y limpieza de pestana y preview al desaparecer el grupo.
- `test/Models/TerriaSpec.ts` (`describe("terria start")`, bloque `ckanSession`) comprueba que `start()` no crea `terria.ckanSession` sin config y que con `parameters.ckanSession` lo crea, conserva la config y hace exactamente un whoami fuera del proxy.

### Patron `jasmine.Ajax` para HTTP

Los specs de sesion CKAN siguen el patron de `describe("terria start")` en `test/Models/TerriaSpec.ts`:

```ts
beforeEach(function () {
  terria = new Terria({ appBaseHref: "/", baseUrl: "./" });
  jasmine.Ajax.install();
  jasmine.Ajax.stubRequest(/.*/).andError({}); // todo falla por defecto
  jasmine.Ajax.stubRequest(/\/api\/terria\/user\/session/).andReturn({
    status: 200,
    contentType: "application/json",
    responseText: JSON.stringify({ authenticated: false })
  });
});

afterEach(function () {
  session.dispose();
  jasmine.Ajax.uninstall();
});
```

- `jasmine.Ajax.requests.filter(regex)` permite contar peticiones y comprobar que la URL no contiene `proxy/`.
- Un stub posterior sobre la misma URL sustituye al anterior; asi un mismo caso encadena login, logout y errores 401/500 re-stubbeando el whoami.
- `TerriaReferenceSpec.ts` no stubbea HTTP; no usarlo de precedente para specs que dependan de la red.
- i18n corre en `cimode` (`test/SpecMain.ts`), asi que `t()` devuelve la clave y los asserts comparan con `ckanSession.errors.sessionExpired`, `ckanSession.btnLogin`, etc.
- MobX corre con `enforceActions: "always"`: mutar `terria.ckanSession`, `status` o traits desde un spec requiere `runInAction`.
- Para el throttle por foco se usa `jasmine.clock().install()` con `mockDate(new Date(0))` y `tick(...)`, desinstalando el reloj al final del caso.

## Ejecucion manual en navegador

1. `yarn gulp`
2. `yarn start`
3. abrir `http://localhost:3002/SpecRunner.html`

## Riesgos o huecos

- El repo no documenta una matriz oficial de browsers de desarrollo local mas alla de los launchers instalados y el uso de Firefox en CI.
- **Pendiente por confirmar:** si existe un flujo oficial para tests headless en Chrome dentro del repo actual.

## Cola de escenas

`node --test test/ViewModels/sceneQueue.test.mjs` valida la serialización y que un fallo no bloquee la siguiente escena. Ejecutar ESLint en los módulos cambiados y compilar TerriaMap contra estos fuentes antes de desplegar. Verificar en navegador que escribir no consulta el geocoder, Enter/botón sí, y que seleccionar un resultado conserva el mapa base.

## Stories e información de entidades (2026-09-24)

`test/ReactViews/Story/StoryImageUploadSpec.ts` verifica origen permitido, sesión expirada y URL persistente con CSRF. `FeatureInfoPanelSpec.tsx` comprueba dimensiones antiguas y que el modo automático no persiste el tamaño del loader. Ejecutar junto a `StoryPanel/StoryBodySpec.tsx` en navegador con Karma. `tsc --noEmit --skipLibCheck` evita incompatibilidades preexistentes de tipos de Jasmine de terceros; no sustituye la prueba de navegador.

En dev comprobar guardar/recargar imágenes con sesión CKAN, error y reintento, panel con carga asíncrona y vuelta de manual a automático. TerriaMap debe fijar el commit de esta biblioteca y configurar `storyImageUploadUrl` en el mismo origen que CKAN.

## Biblioteca de imagenes (2026-10-01)

`StoryImageLibrarySpec.ts` comprueba origen, ventana emisora y cancelacion del selector. Ejecutar junto a `StoryImageUploadSpec.ts` y `StoryPanel/StoryBodySpec.tsx` en Karma. Compilar TerriaMap con la revision de esta biblioteca. La comprobacion integrada requiere CKAN del mismo origen y una sesion real: subir, insertar desde biblioteca, guardar/recargar y abrir el share sin sesion; probar ademas expiracion/reintento y 390 px.

## Composiciones de Stories

`StoryCompositionSpec.ts` cubre cola de escenas y solicitudes superadas, recuperacion, medios seguros, filtros y ventana/origen del selector de dashboards. Ejecutar junto a los specs de imagenes y StoryBody en Chromium; `tsc --noEmit --skipLibCheck` y ESLint sobre los archivos cambiados comprueban los contratos.

La validacion integrada requiere CKAN y TerriaMap del mismo origen. Comprobar crear/guardar/reabrir una composicion, compartirla, importar sus escenas en CKAN, activar referencias y filtros, recapturar COG series, pausa/final y Scroll/Slides. Revisar escritorio y 390 px, el tamaño efectivo del mapa y que volver a un dashboard conserve su iframe. El modo anterior sin `composition` debe mantener su panel y dimensiones.

## Demo de composiciones en DEV (2026-10-02)

[El agua tambien se cuenta](https://data.dev-wins.com/terria/#share=g-0e9d02c035f26e47ed759004559fe9a0) contiene nueve capitulos con imagenes de CKAN, escenas COG mensual/anual, dashboard, referencias manuales y `on_enter`, grafico, video y cierre. Los valores del dashboard y la animacion son simulados y se distinguen de la fuente COG.

La revision de Chromium sobre TerriaJS `367781b0e` y TerriaMap `a32476d` cubrio los nueve capitulos a 1440, 1024, 768, 390 y 360 px: 45 casos sin desbordamiento ni controles de navegacion menores de 44 px. Tambien comprobo filtros/restablecimiento, referencias automaticas en Slides/Scroll, llegada al ultimo capitulo por scroll, pausa real del video al navegar y parada de la reproduccion opcional al final. Se inspeccionaron capturas de mapa, narrativa y medios; los viewports moviles no sustituyen dispositivos fisicos ni Safari.

Guia, documentos reutilizables y evidencia del despliegue: [demo en ckan-unesco-docker](https://github.com/pabrojast/ckan-unesco-docker/blob/miserver-2.10/docs/story-showcase-dev.md). Para capturar el mapa, esperar las teselas despues de aplicar la escena; el texto del placeholder de `TerriaViewerWrapper` sigue en el DOM detras del canvas y no sirve como condicion de finalizacion.

La correccion final del menu y los espacios paso 16 specs de Stories en Chromium, incluido un caso que conserva separadores entre referencias y sigue omitiendo whitespace de la estructura de tablas. TypeScript y ESLint de los archivos cambiados pasaron.

El CI global de esta revision sigue fallando por 14 warnings previos fuera de los archivos de Stories; ver [[Backlog Documentacion]]. Los controles focalizados no equivalen a un CI global verde.

## Ventanas clasicas y recorridos mixtos (2026-10-02)

23 specs de Stories pasan en Chromium. `StoryCompositionSpec.ts` comprueba inferencia de shares antiguos, prioridad de la presentacion explicita, Scroll conservado, geometria compartida y aplicacion de snapshots sin reemplazar la narrativa. `StoryPanelSpec.tsx` monta ambos lectores y verifica una activacion por capitulo, cambio con teclado, navegacion rapida serializada, restauracion del mapa/fullscreen y ausencia de escrituras al recibir resize o pointerup ajenos. Un gesto tactil en la cabecera mueve la ventana sin navegar; el swipe en el cuerpo sigue cambiando de capitulo. `StoryBodySpec.tsx` comprueba referencias inactivas como texto y recuperacion al volver a Composicion.

Prueba de navegador local: resize real de 520 x 390 a 593 x 443, arrastre de cabecera, viewport de 390 px con ventana contenida y retorno a 1440 px conservando dimensiones/posicion. Las capturas se guardan en `output/playwright/classic-*.png` (artefactos locales). El build local usa el checkout de TerriaJS enlazado desde TerriaMap; no equivale a desplegar.

La demo mixta [Historias a tu medida](https://data.dev-wins.com/terria/#share=g-8087f3b1896a8dd9cd96bc8517e2c7c6) tiene cuatro capitulos y conserva la demo anterior. En el build local final, los cuatro capitulos pasaron a 1440, 1024, 768, 390 y 360 px (20 casos sin desbordamiento horizontal, texto de controles cortado ni imagenes visibles rotas). La demo antigua de nueve composiciones, sin campo `presentation`, mantuvo Scroll hasta el ultimo capitulo y Play opcional. El editor guardo una nueva escena clasica; convertir a clasica y volver a composicion conservo los metadatos, y recapturar mantuvo geometria sin incluir la historia en el snapshot.

El run [37016518841](https://github.com/pabrojast/terriajs/actions/runs/37016518841) confirma los mismos 14 warnings previos del CI global, fuera de Stories. El despliegue DEV final y su digest se registran en la guia de demo de `ckan-unesco-docker`.

La autoria se comprobo en escritorio. StoryBuilder se desmonta bajo el breakpoint movil por una condicion anterior en StandardUserInterface; ver [[Backlog Documentacion]].

Verificacion final sobre DEV: [workflow 37016628398](https://github.com/pabrojast/ckan-unesco-docker/actions/runs/37016628398) correcto, TerriaMap `b90881cb` con TerriaJS `3f5b9704e`, pod Ready y sin reinicios. Sesion limpia: ventana inicial compartida, filtro Chile = 3.334, retorno de composicion a clasica con mapa completo, movil a 390 px y recuperacion de dimensiones de escritorio; sin errores de pagina ni alertas durante el recorrido. Digest y recursos preservados registrados en la guia de demo de Docker.

## Demos en ingles (2026-10-02)

Ediciones publicas independientes en DEV: [CKAN Slides](https://data.dev-wins.com/data-stories/demo-web-stories-en#storymap), [CKAN Scroll](https://data.dev-wins.com/data-stories/demo-web-stories-en-scroll#storymap), [Terria Compositions](https://data.dev-wins.com/terria/#share=g-2cb6e9b74fe8fa93c7ea1b7d031dc315) y [Terria con ventanas clasicas](https://data.dev-wins.com/terria/#share=g-eb6ece82cac01c3239002db57fc1140c). Los textos, dashboard, ilustraciones y video estan en ingles; las demos anteriores se conservan.

Las dos ediciones de nueve composiciones pasaron 45 combinaciones de capitulo y viewport cada una (1440, 1024, 768, 390 y 360 px), sin desbordamiento horizontal ni controles de navegacion menores de 44 px. Se verifico reproduccion de video y pausa al navegar, y fin del avance opcional en Terria. La guia de Docker incluye el recorrido en ingles, documentos JSON reutilizables y las comprobaciones de referencias, mapas y ventanas. Son cambios de contenido sobre el runtime DEV ya desplegado, sin cambios en produccion.

## Editor editorial de Stories (2026-10-02)

`StoryEditorSpec.jsx` agrega seis casos del ciclo de borrador: titulo vacio mediante teclado, bloqueo de doble guardado/cierre durante subidas, recuperacion tras error y URLs temporales, formato clasico inicial, normalizacion de HTML sin falsos cambios y descarte explicito con Escape en dialogos anidados. Los selectores de imagen/dashboard usan ahora sus etiquetas traducidas en las pruebas.

La suite focalizada de Stories pasa 29 specs en Chromium. TypeScript, ESLint focalizado y compilacion local de TerriaMap pasan; el build mantiene los avisos existentes de Sass y Cesium. Playwright verifica Classic/Composition a 1440×900, 1366×768, 1024×768 y 1024×600: ocho casos con cabecera/acciones contenidas y sin desbordamiento horizontal del modal. Tambien comprueba cancelar sin perder el borrador, titulo vacio por atajo, Escape en TinyMCE, rechazo de URL insegura, guardar/reabrir recursos, referencias `on_enter` y conversion reversible conservando geometria 520×390.

La seleccion de dashboard de esa prueba local usa un mensaje simulado del iframe correcto; no representa una subida autenticada a CKAN. Las pruebas de upload cubren origen, CSRF y expiracion/reintento con transporte simulado. Las capturas de antes/despues viven en `output/playwright/story-editor-*.png` como artefactos locales. Ver [[Deployment]] para la revision efectivamente publicada.

La revision final recorre 35 pasos de Tab sin salir del modal y confirma retorno de foco desde los selectores CKAN y al menu del capitulo existente. Abrir/cancelar una story real sin cambios no pide descarte por la normalizacion de HTML de TinyMCE; modificar el titulo si pide confirmacion. El CI general conserva 14 warnings previos fuera de Stories (run `37081847936`); las verificaciones focalizadas no equivalen a CI global verde.

La revision desplegada `338ed1c72` / TerriaMap `64c11616` paso seis casos de formato/viewport en DEV (1440×900, 1366×768 y 1024×600), creacion/guardado/reapertura, titulo vacio por atajo, Escape del dialogo de imagen, cancelar/conservar borrador, descarte real y cierre sin falsos cambios con retorno de foco al capitulo. No hubo errores de pagina en ese recorrido. Las rutas publicas Terria, Data Stories, Rapid Response y una imagen de CKAN respondieron HTTP 200. El CI de TerriaMap [37082461923](https://github.com/pabrojast/TerriaMap/actions/runs/37082461923) paso; el CI global final de TerriaJS [37082449753](https://github.com/pabrojast/terriajs/actions/runs/37082449753) confirma los mismos 14 warnings previos en `WebMapTileServiceCatalogItem.ts` y `mustacheExpressions.ts`.

La demo mixta inglesa conservo sus 11 capitulos en el editor publicado. Abrir/cerrar el capitulo real de introduccion mantuvo su texto, presentacion y retorno de foco sin pedir descarte. Se inspeccionaron las capturas de escritorio y del modal reducido; `story-editor-dev-real-demo.png` muestra la edicion de esa demo.

### Pilotos de calidad de agua y zonales físicos

`test/Core/WaterQualitySpec.ts` verifica umbral de cobertura, fechas sin dato,
separación de fila regional, años parciales, Theil–Sen/Mann–Kendall, clasificación,
cutoffs temporales, CSV con procedencia y fallos/reintentos del loader JSON.
`CogZonalEngineSpec.ts` verifica escala/offset antes de estadísticas, nodata,
metadatos GDAL, polígonos con huecos y propagación del contrato a series zonales.

Validación de esta implementación: 28 specs focalizados pasan en Karma/Chrome;
TypeScript con `--skipLibCheck` y ESLint/Prettier focalizados. El chequeo sin
`--skipLibCheck` encuentra tres referencias preexistentes a `AsymmetricMatcher`
en `@types/testing-library__jasmine-dom`. La validación visual y los datos
publicados deben comprobarse en el consumidor TerriaMap y DEV, por separado.

Aceptación integrada: selección de Andraikiba y Kyiv, cambios CHL/TUR/SPM y
resoluciones, fecha gráfico→mapa, comparar cuerpos, CSV, cierre móvil, errores,
share, clic cuerpo frente a píxel, y Kakhovka antes/después del corte. Revisar
`narrative=1` en escritorio y 390 px, leyenda/atribución disponibles y ninguna
petición a `/xcube/`.

`WaterQualitySharingSpec.ts` verifica que compartir conserve IDs seleccionados
y omita el GeoJSON derivado de límites; este se reconstruye desde la URL de
analytics al abrir el piloto. Evita enlaces gigantes y duplicación del overlay.
También comprueba que cambiar CHL/TUR/SPM promueva el producto visible en la
línea temporal, conserve fecha y cuerpos seleccionados, responda al reloj y
serialice la resolución y el orden de la línea temporal sin duplicar capas.
La regresión de reapertura usa `applyInitData` real: el lector reconstruye la
línea temporal desde el orden del workbench. El observador del piloto recupera
el producto visible sin tocar fecha, banda ni selección; respeta otras capas y
deja de observar al desmontarse el panel.

### Guia de dashboards de IHP-WINS (2026-10-12)

`StoryDashboardGuidanceSpec.tsx` monta el editor de composicion con traducciones
EN/ES. Comprueba normalizacion de en-AU/es-CL, titulo accesible y URL del iframe,
insercion con filtros copiados sin modificar el original ni elegir una plantilla
por el autor, y cambio explicito a Mapa y dashboard conservando la seleccion.
El tercer caso comprueba fallback ingles para fr-FR, cancelacion y retorno de
foco al boton que abrio el selector. Los specs existentes mantienen las pruebas
de origen/ventana, esquema de filtros, composicion y ciclo del borrador.

Pasan 32 specs focalizados de Stories en Chrome, TypeScript con `--skipLibCheck`,
ESLint/Prettier y compilacion webpack focalizada. La compilacion conserva el
aviso existente de Cesium sobre `import.meta`. El transporte del selector se
simula desde su iframe; estas pruebas no sustituyen la validacion integrada de
Pages en DEV. TerriaMap conserva su configuracion de idiomas: probar EN/ES en
la biblioteca no declara que el visor publicado permita cambiar ambos idiomas.

### Analisis de area y grafico claro (2026-10-23)

`createAreaPolygonSpec.ts` comprueba cierre unico, vertices repetidos, areas
degeneradas, intersecciones, concavidad y cruce del antimeridiano.
`CogCalculationViewModelSpec.ts` recorre cierre explicito y primer vertice,
conservacion del overlay, deshacer/reiniciar y limpieza idempotente sin retirar
interacciones ajenas. Junto con `UserDrawingSpec.ts` y `chartJsStatsSpec.ts`,
pasan 28 specs en Chromium; un caso antiguo dependiente de WebGL se omite.
La geometria 3D se comprueba adicionalmente en navegador real.

TypeScript (`--noEmit --skipLibCheck`), ESLint de los archivos modificados y
compilacion del consumidor TerriaMap pasan. El build mantiene avisos previos
de Sass y Cesium. Estas verificaciones focalizadas no declaran verde la CI
global. Las capturas y CSV locales estan en
`output/playwright/area-analysis-20261023/`; la evidencia de la revision
publicada corresponde al informe enlazado desde [[Deployment]].

La vista previa del consumidor se comprueba en 1440×900, 1024×600, 390×844 y
360×800: cierre por primer vertice y boton, dibujo tactil, resultados y CSV,
modal/tabla de series, zoom y restauracion del grafico. El grafico movil tiene
220 px de trazado y desplazamiento vertical; no hay overflow horizontal.
El calculo y el dibujo funcionan en Leaflet, aunque la capa COG del ejemplo
conserva su restriccion previa de visualizacion a Cesium. EN/ES tienen las
mismas 76 claves y plurales verificados; el consumidor DEV ofrece solo ingles.
No se cambio esa configuracion. Compartir desde la vista previa conserva por
igualdad profunda las cuatro historias y las series originales de 37/36 puntos.

### Resolucion temporal, tema y Tools (2026-10-24)

`cogAnalysisPeriodSpec.ts` cubre meses completos, febrero bisiesto, cambio mensual/anual, fechas invalidas y resoluciones personalizadas. `CogCalculationResolutionSpec.ts` cubre sincronizacion en ambos sentidos, inclusion del ultimo dia, cancelacion y respuestas obsoletas, reintento y limpieza al cerrar por el controlador. Se ejecutan junto a las regresiones de dibujo, motor zonal, catalogo COG y estadisticas del grafico: 127 pruebas pasan en Chromium, con un caso previo dependiente de WebGL omitido. TypeScript, ESLint de los archivos modificados, Prettier y compilacion de TerriaMap pasan.

La comprobacion del consumidor usa el enlace original con cuatro historias y dos series. Revisar Tools/medicion, cierre del poligono, mensual/anual/diario, limites inclusivos, CSV, carga fallida/reintento, y pantallas 1440×900, 1024×600, 390×844 y 360×800. Evidencia local en `output/playwright/area-temporal-tools-20261024/`; resultado de la entrega en [[Deployment]]. La revision oscura reemplaza la paleta clara de la entrega del 23, conservando la geometria y dimensionado.
