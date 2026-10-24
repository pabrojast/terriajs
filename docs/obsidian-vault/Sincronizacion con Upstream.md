# Sincronizacion con Upstream

Ver tambien: [[Index]], [[Testing]], [[Comandos Utiles]], [[Deployment]], [[Troubleshooting]]

## Contexto

- Upstream: `https://github.com/TerriaJS/terriajs` (remoto `upstream`).
- El fork `pabrojast/terriajs` estuvo sincronizado hasta `e6f99ab0d` (PR #7657, mediados de 2025, base 8.9.5).
- Desde `a4bd89be9` (junio de 2026) upstream es un **monorepo** (pnpm + turbo): el codigo vive en `packages/terriajs`, con `terriajs-server` y `apps/terriamap` al lado. Publica `terriajs` 8.13.0 en npm.
- El fork mantiene el **layout plano** porque TerriaMap lo consume como dependencia `git+https://github.com/pabrojast/terriajs.git#<sha>` con yarn 1; esa forma no funciona con un monorepo.

## Estado

| Hito                                                                                                                                                                                              | Rama / ref                                                                                                                         | Fecha      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Integracion de ramas activas del fork                                                                                                                                                             | `integrate/upstream-8.13-flat-20261023` (commits `9999db93f`, `a8054b2a9`, `258b29498`)                                            | 2026-10-23 |
| Etapa 1: ultimo commit plano de upstream                                                                                                                                                          | tag `upstream-premove` = `2c0cef873` (8.12.2 + desarrollo hasta 2026-06-12); merge `96f18c8e0`                                     | 2026-10-23 |
| Etapa 2: `packages/terriajs` post-monorepo aplanado (8.12.3 → 8.13.0 → siguiente, `adaf90db7`)                                                                                                    | rama `upstream-flat` = `124f0edd6` (`git subtree split --prefix=packages/terriajs upstream/main`); merge en la rama de integracion | 2026-10-23 |
| TerriaMap: merge de `upstream/main` del TerriaMap independiente (0.4.8) + pin de esta rama                                                                                                        | `pabrojast/TerriaMap` rama `integrate/terriajs-8.13-20261024` (desde `node`); detalles en [[Deployment]]                           | 2026-10-24 |
| Rama `develop` en ambos repos (base para llevar a `main`): terriajs `develop` = `main` + rama de integracion; TerriaMap `develop` = `dev` + rama de integracion, conservando el branding IHP-WINS | terriajs `2c54c71cb`; TerriaMap `pabrojast/TerriaMap` rama `develop` (pin a terriajs `develop`)                                    | 2026-10-24 |

## Procedimiento

### Etapa 1 (hecha)

```bash
git remote add upstream https://github.com/TerriaJS/terriajs.git
git fetch upstream main
git fetch upstream 2c0cef87312b85899a60becea8e62301fded3ffe
git tag upstream-premove 2c0cef87312b85899a60becea8e62301fded3ffe
git -c merge.renameLimit=30000 merge --no-ff upstream-premove
```

30 conflictos. Reglas aplicadas:

- Busqueda: se adopta el modelo de upstream (`SearchProviderResult`, `autocompleteEnabled` por proveedor). Se conservan el boton "Buscar", la atribucion OSM y el hint del fork. `NominatimSearchProviderTraits.autocompleteEnabled` devuelve `true` en el fork (upstream lo deja en `false` para Nominatim): la busqueda de lugares autocompleta al escribir; una definicion puede desactivarlo con `autocompleteEnabled: false`. El spec `SearchBoxAndResultsSpec` lo desactiva explicitamente para probar la ruta manual de upstream.
- WMTS: se conserva `WebMapTileServiceCatalogItem` del fork (plantillas REST, dimensiones, `featureInfoRequest`); ahora usa el endpoint KVP `GetTile` de `OperationsMetadata` cuando existe. `WebMapTileServiceCapabilities.json` es publico porque el fork lo lee.
- Stories: se conservan `StoryPanel`, `StoryEditor` y `story-editor.scss` del fork; `Editor.tsx` pasa a TypeScript con la prop `language` (i18n de TinyMCE) y `licenseKey="gpl"` en el componente.
- Workbench: se adopta `WorkbenchControls.ts` de upstream y se agrega el flag `stac` del fork.
- `useDraggable`: version del fork (limites del viewport, API `controls`). El spec de `DragWrapper` se ajusto a ese comportamiento.
- `parseCustomMarkdownToReact` ya no registra los custom components al cargar el modulo (creaba un ciclo de imports que rompia el bundle de specs); TerriaMap llama a `registerCustomComponentTypes(terria)` en `index.js`.
- `MobileMenuItem` cambio de API en upstream (`MobileMenuItem.Button` / `.Link`); `CkanSessionPanel` se adapto.
- Traducciones `en`/`es`: merge a tres vias por claves (script `merge-json.py`, union sin conflictos).
- `CHANGES.md`: las entradas del fork viven en la seccion `Fork IHP-WINS` al inicio; el resto es el historial de upstream.
- Tests: se reinstalaron `jasmine-ajax`, `fetch-mock`, `react-test-renderer` (upstream migro a `msw` y testing-library); `createWithContexts` se restauro en `test/ReactViews/withContext.tsx`.

Tooling que llega con la etapa 1: Node 22, terriajs-cesium 23.0.2, TypeScript 5.9, ESLint 10 (flat config, reglas nuevas de `react-hooks`), Prettier 3, jasmine-browser-runner + msw, plugin propio de sprites SVG.

### Etapa 2 (hecha)

Trae `packages/terriajs` de `upstream/main` (8.12.3 → 8.13.0 → siguiente) en layout plano. 23 conflictos.

```bash
git subtree split --prefix=packages/terriajs upstream/main -b upstream-flat   # 233 commits, raiz 5f02f26c8
# conectar la raiz del split con la historia plana (replace local, no se empuja):
SYN=$(git commit-tree 5f02f26c8^{tree} -p upstream-premove -m "synthetic base")
git replace --graft 5f02f26c84fce10d853a5b0068ea17b75aa8c25a $SYN
git merge-base HEAD upstream-flat   # imprime 2c0cef873
git merge --no-ff upstream-flat
```

Decisiones aplicadas en el merge:

- Se conservan del fork: `WebMapTileServiceCatalogItem` y su spec, `FeatureInfoPanel`, `StoryPanel`, `StoryEditor`, `StoryBody`, `UserDrawing`, `ImageryProviderLeafletTileLayer`, `useDraggable`, `gulpfile.js` (tarea de licencias con yarn) y `buildprocess/ci-deploy.sh`.
- `Terria.applyInitData` adopta la estructura resiliente de upstream (`applyPart`) y re-inserta las piezas del fork: `storyOptions`, `featureInfoPanelState` y `accumulatedChartSeries`.
- `Editor.tsx` suma `underline subscript` a la barra y el `editor.skin.overrides.scss` de upstream; `getDataType` conserva los tipos STAC; `updateApplicationOnMessageFromParentWindow` combina la cola de escenas del fork con `getAllowedOrigins` de upstream.
- `package.json` se reconstruye desde el nuestro resolviendo los `catalog:` de upstream (`merge-package-json.py`); se re-agregan `husky`, `prettier` y `pretty-quick` (upstream los movio a la raiz del monorepo) y `resolutions.tinymce` evita una copia duplicada de tinymce.
- i18next 26 con selectores tipados: `lib/ThirdParty/i18n/i18next-string-keys.d.ts` vuelve a admitir claves string en `t()` para el codigo del fork (las claves string no se validan contra los recursos). Las llamadas que pasaban el modelo como opciones se cambiaron a selectores sin opciones.
- `test/ReactViews/Story/StoryPanel/StoryPanelSpec.ts` de upstream se elimina (prueba `activateStory`, que el `StoryPanel` del fork no expone).
- `test/ReactViews/StandardUserInterfaceSpec.tsx`: el test "asks the user whether to view the story" pasa a comprobar que el fork abre la historia sin preguntar. `test/mocks/browser.ts` deja pasar `HEAD /test/*` y responde 404 a `*.tif` remotos (geotiff ahora los pide al cargar). `WebMapTileServiceCatalogItemSpec` comprueba el endpoint KVP como prefijo (Cesium 26 expone la plantilla KVP completa en `provider.url`).
- Tooling que llega con la etapa 2: terriajs-cesium 26.3.0 (+ widgets 16.2.0), styled-components 6, i18next 26 / react-i18next 17, tinymce 7.9, zod, webpack 5.111.
- `package.json` del fork declara `version` 8.13.0 (la version de `packages/terriajs` en upstream al cerrar la etapa 2); TerriaMap la escribe en `version.json` al construir.

Advertencias medidas:

- Upstream formatea con oxfmt; el hook `pretty-quick` del fork reformatea con Prettier 3 los archivos de upstream que toca cada merge (22 en la etapa 2). Es ruido esperable en futuros merges, no un cambio funcional.

- El merge-base es `upstream-premove`, asi que los 18 archivos de metadatos que quedaron en la raiz del monorepo (`.github/*`, `.vscode/*`, `.nvmrc`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `.gitattributes`, `.gitmodules`, `.husky/pre-commit`, `yarn.lock`) aparecen como borrados: restaurarlos con `git checkout HEAD -- <archivo>` antes de commitear.
- `package.json` de upstream usa `catalog:<grupo>` y `workspace:*` (pnpm). Conservar el nuestro y portar solo cambios de dependencias resolviendo los catalogos con `pnpm-workspace.yaml` (script `merge-package-json.py` en el scratchpad de la sesion; terriajs-cesium pasa a 26.3.0).
- `tsconfig.json` de upstream apunta a `../../node_modules`: mantener rutas planas.
- Upstream migra i18next a 26 con claves tipadas (`t(($) => $.ruta)`, `enableSelector: true`); el codigo del fork con claves string sigue siendo valido.
- Breaking: se elimina `WebMapTileServiceCatalogItem.imageryProvider` y `MapInteractionMode.uiMode`.

## Verificacion usada

- `npx tsc --noEmit --skipLibCheck -p tsconfig.json`
- `yarn gulp lint`, `yarn prettier --check` sobre los archivos tocados
- `yarn gulp build` y `yarn gulp test` (ver [[Testing]] para los fallos esperables en una shell con locale `es` y sin WebGL)

## Pendientes conocidos tras la etapa 1

- Specs del fork que ya fallaban antes del merge (**Inferencia**: no tocan codigo cambiado por el merge): `StacCatalogGroup`/`StacCollectionCatalogItem` `typeName` (esperan texto traducido en `cimode`), `stacAssetUtils` QUICKLOOK, `stacItemsLoader` URL de busqueda, specs de autenticacion Terrascope, `BuildShareLink` token CKAN.
- `StoryDashboardGuidanceSpec` (es-CL) pasa aislado y falla en la suite completa (estado de i18n entre specs).
- Flujo de ramas acordado (2026-10-24): `main` de terriajs y de TerriaMap no se tocan. Lo nuevo vive en `develop` de cada repo; desde ahi se construye y verifica la imagen de dev y, cuando este validado, se lleva a `main`. En terriajs no puede existir una rama `dev` porque ya hay ramas `dev/*`; en TerriaMap `dev` ya existia (linea de dev con pins anteriores) y `develop` la contiene.
