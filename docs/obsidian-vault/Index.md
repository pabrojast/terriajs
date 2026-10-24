# Index

Vault operativa del repositorio `terriajs`.

## Empezar aqui

- [[Arquitectura]]
- [[Estructura del Repo]]
- [[Setup Local]]
- [[Comandos Utiles]]
- [[Flujos Importantes]]
- [[Modulos]]
- [[Testing]]
- [[Deployment]]
- [[Sincronizacion con Upstream]]
- [[Troubleshooting]]
- [[Guia de Mantenimiento]]
- [[Backlog Documentacion]]
- [[Glosario]]

## Hechos rapidos

- Paquete: `terriajs` (fork IHP-WINS sobre upstream 8.13.0+, `adaf90db7`; ver [[Sincronizacion con Upstream]]). Rama de trabajo: `develop` (`main` se mantiene hasta validar el despliegue).
- Runtime de desarrollo soportado: Node `>= 22`; `.nvmrc` fija `v22.22.3`.
- Tooling principal: TypeScript 5.9, React 18, MobX 6, terriajs-cesium 26, styled-components 6, i18next 26, Leaflet, Webpack 5, Gulp 5, jasmine-browser-runner, msw, ESLint 10 (flat config), Prettier 3.
- Entrypoints operativos del repo:
  - estado raiz: `lib/Models/Terria.ts`
  - estado de UI: `lib/ReactViewModels/ViewState.ts`
  - orquestacion del viewer: `lib/ViewModels/TerriaViewer.ts`
  - registro de catalog members: `lib/Models/Catalog/registerCatalogMembers.ts`
  - test bootstrap: `test/SpecMain.ts`
  - build/test/docs: `gulpfile.js` y `buildprocess/`
- Artefactos generados frecuentes:
  - `wwwroot/build/`
  - `dist/`
  - `coverage/`
  - `ts-out/`

## Lectura recomendada segun tarea

- Onboarding rapido: [[Setup Local]] -> [[Comandos Utiles]] -> [[Arquitectura]]
- Cambio funcional en catalogo o datos: [[Arquitectura]] -> [[Modulos]] -> [[Flujos Importantes]]
- Cambio en build o tooling: [[Comandos Utiles]] -> [[Variables de Entorno]] -> [[Deployment]]
- Cambio en UI o viewer: [[Arquitectura]] -> [[Modulos]] -> [[Testing]]

## Notas de contexto

- **Inferencia:** este repo es la libreria TerriaJS y no el shell de aplicacion completo usado en produccion. El despliegue de una app final ocurre normalmente via TerriaMap, aunque este repo si tiene pipelines propios de CI, publicacion npm y generacion/deploy de documentacion.
- Se detecto una posible inconsistencia operativa: el script `yarn hot` referencia `buildprocess/webpack.config.hot.js`, archivo que no existe en el arbol actual. Ver [[Backlog Documentacion]] y [[Troubleshooting]].
