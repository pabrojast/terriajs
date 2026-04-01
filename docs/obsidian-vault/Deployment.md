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

## Vacios detectados

- `server-side-config.md` en `doc/customizing/` dice "Coming soon!".
- No hay un documento unico en este repo que explique despliegue de un consumidor que use solo `terriajs` como libreria embebida.
