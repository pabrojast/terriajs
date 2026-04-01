# Variables de Entorno

Ver tambien: [[Setup Local]], [[Deployment]], [[Comandos Utiles]]

## Resumen

Este repo usa pocas variables de entorno propias en runtime de libreria. La configuracion funcional de TerriaJS vive sobre todo en `config.json`/init files y en `ConfigParameters`, no en variables de entorno.

## Variables observadas

| Variable                     | Donde aparece                                 | Uso observado                                      |
| ---------------------------- | --------------------------------------------- | -------------------------------------------------- |
| `NODE_OPTIONS`               | workflows, Netlify, docs historicas           | ampliar memoria para install/build/test/docs       |
| `GITHUB_ACTION`              | `package.json` `postpublish`                  | evitar tag/push automatico fuera de GitHub Actions |
| `GITHUB_TOKEN`               | deploy workflow, `buildprocess/ci-cleanup.js` | llamadas a GitHub API y housekeeping de CI         |
| `SHARE_S3_ACCESS_KEY_ID`     | deploy workflow                               | secreto para share storage en deploy CI            |
| `SHARE_S3_SECRET_ACCESS_KEY` | deploy workflow                               | secreto para share storage en deploy CI            |
| `FEEDBACK_GITHUB_TOKEN`      | deploy workflow                               | token para feedback service en deploy CI           |
| `NODE_AUTH_TOKEN`            | workflow de publish npm                       | autenticacion contra npm                           |
| `SLACK_WEBHOOK_URL`          | workflow de publish npm                       | notificaciones de publish                          |
| `GCP_CREDENTIALS`            | workflow de deploy                            | acceso a GCP                                       |
| `GKE_CLUSTER`                | workflow de deploy                            | cluster GKE                                        |
| `GKE_LOCATION`               | workflow de deploy                            | region/ubicacion GKE                               |
| `NPM_TAG`                    | workflow de publish npm                       | tag de publicacion npm                             |
| `NODE_VERSION`               | `netlify.toml`                                | version de Node para docs                          |
| `PYTHON_VERSION`             | `netlify.toml`                                | version de Python para docs                        |
| `NETLIFY_USE_YARN`           | `netlify.toml`                                | fuerza uso de Yarn en Netlify                      |

## Variables/flags internos derivados

- `process.env.NODE_ENV` se define en webpack (`development` o `production`) y se usa en codigo, por ejemplo en `Terria.ts` y `GoogleAnalytics.ts`.

## Configuracion que no es variable de entorno

Estas viven en JSON/configuracion del consumidor y conviene no confundirlas con env vars:

- `configParameters` en `lib/Models/Terria.ts`
- `clientConfig`, `serverConfig` e `initConfig` en TerriaMap/Helm
- `allowProxyFor`, `corsProxyBaseUrl`, `serverConfigUrl`, `shareUrl`

## Nota

- **Inferencia:** para trabajo cotidiano en este repo normalmente basta con `NODE_OPTIONS`; el resto de variables se usan en CI/CD o despliegues de TerriaMap.
