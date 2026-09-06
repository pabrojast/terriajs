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
6. Si `configParameters.ckanSession` esta definido, crea `terria.ckanSession` (`CkanSession`) y lanza el whoami (`refresh()`) en paralelo con el resto del arranque. Sin esa clave no se crea nada ni se hace ninguna peticion (ver seccion 10).
7. Inicializa basemaps y search providers.
8. Restaura estado desde URL/hash/share y luego carga init sources.
9. En el `finally` de `restoreAppState` llama a `ckanSession.setReady()`: el grupo privado solo puede entrar al catalogo despues de los miembros del init y del procesado de `models`/`#start=` (que puede pre-crear su id o inyectar `__ckan_private_catalog__/...`).

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
3. Un `domain` configurado y valido (`min < max`) permanece fijo entre fechas. No se pasa al crear el proveedor (el proveedor pisaria las estadisticas nativas). Se aplica despues, con `setDomain`, y se vacia la cache de teselas pintadas. Si no existe, se obtiene de las estadisticas de banda; para un mosaico temporal se agrega un dominio comun entre todos los COG de la fecha activa. Cambiar min/max restylea el provider actual sin recargar el COG.
4. `displayRange` filtra valores de manera inclusiva (`min <= valor <= max`) y no alimenta la leyenda. Si `applyDisplayRange` esta activo y no hay rango explicito, usa el dominio efectivo. Un rango invalido no se aplica.
5. Los clamps inferior y superior son independientes y, cuando no se configuran, ambos quedan activos. `noDataColor` se aplica despues del render solo a pixeles realmente marcados como no-data.
6. La leyenda automatica se deriva del mismo estilo efectivo despues de cargar el COG. Continua: barra de rampa mas ticks HTML con min/max del `domain`. Discreta: bins con `value`. Se genera solo para render de una banda; RGB y multibanda quedan sin leyenda automatica. Una leyenda configurada explicitamente mantiene precedencia.
7. En series, "Auto-fit color scale to current timestep" escribe las estadisticas nativas de la fecha activa en `domain` y deja la leyenda fija. "Use automatic COG range" borra `domain` y vuelve a seguir cada fecha.

La paleta activa se identifica con `colorScaleMode` (`default`, `named` o `custom`). Esto evita que colores heredados o residuales desplacen silenciosamente la seleccion actual. Las escalas continuas conservan las posiciones reales de cada stop; las discretas muestrean esa misma rampa segun `numberOfBins` leido en vivo desde el trait.

## 10. Sesion CKAN y catalogo privado

Archivos clave:

- `lib/Models/CkanSession.ts`
- `lib/Models/Catalog/CatalogReferences/CkanPrivateCatalogReference.ts`
- `lib/Models/Catalog/CatalogReferences/TerriaReference.ts` (hook `loadInitJson()`)
- `lib/ReactViews/Map/Panels/CkanSessionPanel/CkanSessionPanel.tsx`
- `lib/ReactViews/Map/MenuBar/MenuBar.jsx` y `lib/ReactViews/Mobile/MobileMenu.jsx`
- `wwwroot/languages/en/translation.json` y `es/translation.json` (bloque `ckanSession`; el resto de idiomas cae al fallback `en`)

Contexto: cuando Terria y un portal CKAN comparten origen, un XHR same-origin lleva la cookie de sesion de CKAN. `CkanSession` usa eso para mostrar el estado de sesion en la barra de menu y montar en el catalogo los datasets no publicos del usuario. Todo el flujo es inerte si `configParameters.ckanSession` es `undefined` (claves y defaults en [[Variables de Entorno]]). El contrato del servidor (`/api/terria/user/session`, `/api/terria/user/private-catalog`) vive en el plugin `ckanext-terria_view`, fuera de este repo.

### Whoami sin proxy

1. `refresh()` hace `GET` a `sessionUrl` (default `/api/terria/user/session`) con un parametro `_=<timestamp>` anti-cache, via `loadJson` con la URL literal.
2. Las URLs son rutas relativas con `/` inicial: `CorsProxy.shouldUseProxy` devuelve `false` cuando el host esta vacio, asi que la peticion nunca pasa por el `/proxy/` de terriajs-server (que descarta `Cookie` y reescribe `Cache-Control`).
3. `refresh()` nunca rechaza ni llama a `raiseErrorToUser`. Las llamadas concurrentes comparten la peticion en vuelo y cada refresh lleva un numero de secuencia: una respuesta obsoleta (por ejemplo un whoami lento que resuelve tras un logout) se ignora.
4. Respuesta esperada: `authenticated`, `user { name, display_name, sysadmin }`, `private_catalog_url`, `login_url`, `logout_url`, `profile_url`. Las URLs del servidor solo se aceptan si pasan `isSafeRelativePath` (empiezan por `/` y no por `//`; sin `\`, espacios ni caracteres de control).
5. `status` pasa de `unknown` a `anonymous`, `authenticated` o `error`. Un 401 del whoami equivale a anonimo. Cualquier otro fallo (500, red) deja `status = "error"` y `lastError`, pero conserva `user` y el grupo privado: un fallo transitorio no desmonta nada.

### Boton de sesion (`CkanSessionPanel`)

Se renderiza solo si `terria.ckanSession` existe: en escritorio entre Story y Share (`MenuBar.jsx`), en movil como entrada del menu hamburguesa (`MobileMenu.jsx`, con `MobileMenuItem`). Ningun estado renderiza un boton `disabled`.

- `unknown`, o refrescando sin usuario conocido: boton "Checking session…" clicable que llama a `refresh()`.
- `anonymous`: enlace real `<a target="_blank" rel="noopener noreferrer">` a `buildLoginHref()` = `loginUrl` + `came_from=<location.pathname>`. Se usa el pathname sin hash porque el hash de un share puede llevar URLs con token. El click marca `pendingLogin`. En movil `MobileMenuItem` recibe `href` y renderiza el mismo tipo de enlace.
- `anonymous` con `pendingLogin`: boton "Finish logging in…" mas un `Prompt` con "Check now"; ambos llaman a `refresh()`.
- `authenticated` (hay `user`, aunque `status` sea `error` por un fallo transitorio): `MenuPanel` con "Signed in as", "Open my private datasets", "Refresh session", "Portal profile" (enlace, solo si hay `profileUrl`) y "Log out" (enlace a `logoutUrl` + `came_from`, marca `pendingLogout`). Mientras `pendingLogout` el boton vuelve a mostrar "Checking session…".
- `error` sin usuario: boton "Session unavailable" con el mensaje del error en `title`; el click reintenta.

Login y logout se abren en pestana nueva: el mapa no se recarga y las capas publicas y la camara se conservan. Re-check por foco: con `checkOnFocus` (default `true`) se escuchan `focus` de `window` y `visibilitychange` de `document` (solo si `visibilityState === "visible"`), con throttle `focusThrottleMs` (default 5 s) que baja a 1 s mientras hay `pendingLogin` o `pendingLogout`.

"Open my private datasets" abre el explorador (`openAddData()`), fija `activeTabIdInCategory` al grupo privado cuando hay `tabbedCatalog` (`viewCatalogMember` no cambia de pestana para miembros raiz) y llama a `viewCatalogMember` sobre la referencia interna o sobre el miembro inyectado por la vista embebida.

### Grupo privado en el catalogo

Una reaction observa `{ ready, status, user.name, privateCatalogUrl }` y no hace nada hasta `setReady()`.

- `authenticated`: upsert de un grupo raiz `catalogGroupId` (default `ckan-private-catalog`, tipo `group`, `isOpen: true`, `shareable: false`, nombre `ckanSession.privateCatalogName` o la plantilla `catalogGroupName`, descripcion `ckanSession.groupDescription`) con un unico hijo `<catalogGroupId>/catalog` de tipo `ckan-private-catalog-reference` (`isGroup: true`, `url` = catalogo privado). Se agrega con `addMembersFromJson` en `CommonStrata.definition`, al final de los miembros raiz; con `tabbedCatalog` aparece como ultima pestana.
- Carga ansiosa: tras el alta se llama a `loadReference()` (un GET con cookie) y el target recibe `isOpen: true` y `shareable: false`, de modo que la pestana muestra Grupo -> Organizaciones -> datasets sin clicks extra. Los grupos por organizacion y las referencias por dataset (`terria-reference` estandar) los emite CKAN.
- Nonce estable por usuario: `privateCatalogUrl` (con `catalog_id`) solo se fija cuando cambia `user.name`. Un refresh del mismo usuario no re-agrega el grupo ni reescribe la `url` aunque el whoami acune otro `catalog_id` (cambiar la `url` re-ejecutaria la carga de la referencia y crearia ids nuevos). Si el whoami no trae un `private_catalog_url` valido, se usa `privateCatalogUrl` de config mas `catalog_id=<nonce local>` (16 caracteres base64url).
- Cambio de usuario A -> B: se eliminan los modelos de A (incluidos huerfanos) y se vuelve a agregar el grupo con la URL de B.
- Dedupe: si un share link pre-creo un miembro con el mismo id, se elimina antes de agregar el nuevo (`GroupMixin.add` no deduplica).
- Vista embebida en un recurso CKAN: el `#start=` del plugin ya inyecta (en el stratum `user`) un miembro raiz cuyo id empieza por `__ckan_private_catalog__/`. Si existe (`injectedPrivateCatalogId`), `CkanSession` no agrega su propio grupo y "Open my private datasets" abre ese miembro.
- `anonymous`: `removePrivateCatalog` recorre el envoltorio y sus descendientes (`memberModels` y `getDereferencedIfExists`), suma los ids `<catalogGroupId>/*` y todo `terria.modelIds` con prefijo `__ckan_private_catalog__/`, cuenta cuantos estan en el workbench, llama a `terria.removeModelReferences(m)` y `m.dispose()` y quita cada modelo de todos los strata del grupo raiz (`root.strata`), porque el `#start=` vive en `user` y no en `definition`.
- `catalogGeneration` se incrementa en cada alta o baja. El panel lo observa para limpiar `activeTabIdInCategory` y `previewedItem` cuando apuntan a modelos que ya no existen.

### Notificaciones

- Logout con capas privadas en el workbench: notificacion "Logged out" (`ckanSession.notifications.loggedOut*`, con el numero de capas retiradas). La `key` es por evento (`ckanSession/loggedOut/<catalogGeneration>`): `NotificationState` ignora para siempre una key ya vista y una key fija solo se mostraria en el primer logout.
- Share link con capas privadas abierto sin sesion: una sola vez por carga de pagina, si el usuario es anonimo (sin haber estado autenticado antes) y el catalogo contiene ids `__ckan_private_catalog__/...`, notificacion "This map contains private datasets" con "Log in" (`openLogin()`) y "Continue without logging in".

### 401/403 del catalogo privado

- `TerriaReference` expone el hook `protected loadInitJson()`; lee `url` y `cacheDuration` de forma sincrona, asi que el `AsyncLoader` sigue re-ejecutando al cambiar la `url`.
- `CkanPrivateCatalogReference` lo envuelve: un `RequestErrorEvent` 401 o 403 llama a `ckanSession.handleUnauthorized(status)` (refresh inmediato, sin throttle, que supersede al whoami en vuelo) y lanza un `TerriaError` con `ckanSession.errors.sessionExpired` (401) o `ckanSession.errors.forbidden` (403) y severidad por defecto `Error`; una `Warning` solo iria a consola. El resto de errores se relanzan sin cambios.
- El tipo `ckan-private-catalog-reference` se registra en `registerCatalogMembers.ts` junto a `terria-reference` y reutiliza `TerriaReferenceTraits` (sin traits nuevos).

### Alcance real de `shareable: false`

- Quedan fuera del share link el envoltorio, la referencia interna (cuya URL lleva el nonce) y los grupos por organizacion.
- Las referencias por dataset y los items privados del workbench si se serializan en el share: el endpoint exige cookie, asi que para un anonimo solo producen la notificacion de login, y el barrido al pasar a anonimo limpia los huerfanos.

### Invariantes de seguridad

- Solo rutas relativas seguras, tanto en config como en las URLs que devuelve el whoami; un valor no seguro se ignora con `console.warn` y se usa el default.
- `came_from` es `location.pathname`; toda pestana nueva lleva `rel="noopener noreferrer"`.
- El grupo privado solo se agrega con `status === "authenticated"`.
- `Terria.dispose()` llama a `ckanSession.dispose()`: quita listeners y la reaction, no toca el catalogo.

Limites conocidos:

- El nombre del grupo se escribe en el stratum `definition`, asi que un cambio de idioma en caliente no lo re-traduce.
- Si la sesion expira con el mapa abierto, el grupo sigue visible hasta el siguiente foco o click; el primer intento de carga muestra el mensaje traducido y dispara el re-check.
- Tras recargar la pagina el nonce cambia: Terria conserva el primero de cada usuario solo durante la vida de la pagina.

## Nota

- **Inferencia:** el deploy continuo de aplicacion no empaqueta TerriaJS solo; clona TerriaMap, injerta la version/branch actual de TerriaJS y despliega esa app resultante.
