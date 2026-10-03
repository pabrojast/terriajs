# Deployment

Ver tambien: [[Variables de Entorno]], [[Comandos Utiles]], [[Arquitectura]]

## Resumen

Este repo tiene tres salidas de despliegue observables:

- publicacion del paquete `terriajs` en npm
- generacion y deploy de documentacion estatica
- deploy CI de una app TerriaMap construida contra esta version de TerriaJS

## 1. Publicacion npm

Workflow: `.github/workflows/npm-publish.yml`

Flujo observado:

1. detectar cambio de version en `package.json`
2. instalar dependencias
3. correr `npx gulp lint release`
4. `npm publish --tag ${NPM_TAG}`
5. enviar notificaciones a Slack

Referencia adicional: `RELEASE_GUIDE.md`

## 2. Documentacion

- `netlify.toml` ejecuta `yarn gulp docs`
- publica `wwwroot/doc`
- fija `NODE_VERSION=20` y `PYTHON_VERSION=3.13`

## 3. Deploy CI de aplicacion

Workflow: `.github/workflows/deploy.yml`

Script: `buildprocess/ci-deploy.sh`

Flujo observado:

1. clona `TerriaMap`
2. reescribe su dependencia `terriajs` para apuntar al branch/repositorio actual
3. sincroniza dependencias
4. build de TerriaMap
5. build y push de imagen Docker a GCR
6. `helm upgrade --install` con `buildprocess/ci-values.yml`

## 4. Configuracion de deploy CI

`buildprocess/ci-values.yml` define, entre otros:

- `serverConfig.port: 3001`
- `allowProxyFor`
- share storage S3
- feedback config
- `singlePageRouting`
- `clientConfig.parameters`

## 5. Frontera TerriaJS vs TerriaMap

- Este repo no contiene un shell de aplicacion final equivalente a TerriaMap.
- La documentacion de `doc/deploying/*.md` describe sobre todo despliegues de TerriaMap y `terriajs-server`.
- **Inferencia:** para consumidores, el patron recomendado sigue siendo desplegar una app TerriaMap o equivalente que use este paquete.

## Entrega IHP de biblioteca de imagenes (2026-10-01)

El codigo funcional `2ac905a5c` esta publicado en `dev/cog-series` y `production`.
Git no permite crear `dev` mientras existen ramas `dev/*`; se conserva la rama
de desarrollo de la que parte esta entrega. TerriaMap fija ese commit en
`634903f`, publicado en sus ramas `dev` y `production`. La compilacion Docker
verificada en DEV se promueve con el mismo digest, despues del backend CKAN.
Los pins y la evidencia del despliegue viven en
`ckan-unesco-docker/deploy/docker/story-images-production.md`.

La CI de publicacion detecto una directiva ESLint obsoleta en `chartJsExport.ts`;
se elimina solo ese comentario, sin cambios en el comportamiento compilado.

## Editor editorial de Stories en DEV (2026-10-02)

TerriaJS `338ed1c72497e970644b12884d6378056704e32c` esta publicado en
`dev/cog-series`. TerriaMap `64c116162be77259e787b9a3680e66d5b7a38cca`, publicado
en `dev`, fija esa revision. El workflow oficial de `ckan-unesco-docker`
[`deploy-terria-dev.yml`, run 37082491233](https://github.com/pabrojast/ckan-unesco-docker/actions/runs/37082491233)
compilo y desplego la imagen `pabrojast/terriamap:20261002213229-64c1161`, digest
`sha256:7c88d555d6b23de77e92d79f399b66bbb30d22dc3031872775c561b44205a0d4`.

Contexto `default`, namespace `ckan`, deployment `terria-terriamap`: pod
`terria-terriamap-6c548f4cb4-ts5zj` 1/1 Ready, sin reinicios. La especificacion
del pod antes/despues es identica salvo la imagen. El alcance es Terria DEV;
no se desplegaron CKAN ni produccion. El run anterior `37081898404` se cancelo
antes de Helm para incluir la normalizacion del borrador y retorno de foco.

La prueba de navegador contra [DEV](https://data.dev-wins.com/terria/) confirma
la version `64c1161`, creacion/guardado/reapertura, formato clasico inicial,
conversion sin perder texto, descarte y retorno de foco. Ambos formatos se
revisaron a 1440×900, 1366×768 y 1024×600 con acciones visibles y sin
desbordamiento horizontal. Ver [[Testing]] y la
[guia de demo](https://github.com/pabrojast/ckan-unesco-docker/blob/miserver-2.10/docs/story-showcase-dev.md)
para alcance y limitaciones de las verificaciones.

## Vacios detectados

- `server-side-config.md` en `doc/customizing/` dice "Coming soon!".
- No hay un documento unico en este repo que explique despliegue de un consumidor que use solo `terriajs` como libreria embebida.
