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
- `ckanSession` (detalle abajo)

### `configParameters.ckanSession`

Integracion de sesion CKAN same-origin (`CkanSessionConfig` en `lib/Models/CkanSession.ts`). Default `undefined`: sin la clave no se crea `terria.ckanSession`, no aparece el boton y no se hace ninguna peticion. El flujo completo esta en [[Flujos Importantes]] (seccion 10).

| Clave               | Default                                               | Uso                                                                                                                        |
| ------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `sessionUrl`        | `/api/terria/user/session`                            | whoami; se le agrega `_=<timestamp>` anti-cache                                                                            |
| `privateCatalogUrl` | `/api/terria/user/private-catalog`                    | indice del catalogo privado cuando el whoami no trae `private_catalog_url`; se le agrega `catalog_id=<nonce>`              |
| `loginUrl`          | `/user/login`                                         | pagina de login; se le agrega `came_from=<pathname>`; el `login_url` del whoami tiene prioridad                            |
| `logoutUrl`         | `/user/_logout`                                       | logout; se le agrega `came_from`; el `logout_url` del whoami tiene prioridad                                               |
| `profileUrl`        | sin valor                                             | plantilla opcional con `{{user}}`; el `profile_url` del whoami tiene prioridad                                             |
| `catalogGroupName`  | sin valor (usa i18n `ckanSession.privateCatalogName`) | plantilla con `{{user}}` para el nombre del grupo privado                                                                  |
| `catalogGroupId`    | `ckan-private-catalog`                                | id del grupo raiz; la referencia interna es `<catalogGroupId>/catalog`                                                     |
| `checkOnFocus`      | `true`                                                | re-check de sesion al recuperar foco o visibilidad                                                                         |
| `focusThrottleMs`   | `5000`                                                | intervalo minimo entre re-checks por foco; mientras hay login/logout pendiente se usa 1000 ms (constante, no configurable) |

Reglas de validacion (`resolveConfig`):

- Solo rutas relativas: empiezan por `/` y no por `//`, sin `\`, espacios ni caracteres de control. Asi el XHR es same-origin, lleva la cookie de CKAN y nunca pasa por el proxy de terriajs-server. Un valor no seguro en `sessionUrl`, `privateCatalogUrl`, `loginUrl` o `logoutUrl` se ignora con `console.warn` y se usa el default; un `profileUrl` no seguro se descarta.
- `checkOnFocus` debe ser booleano y `focusThrottleMs` un numero finito `>= 0`; strings vacios en `catalogGroupName`/`catalogGroupId` se ignoran.
- La clave existe como `ckanSession: undefined` en los defaults de `configParameters` de `Terria.ts` porque `updateParameters` solo copia claves presentes en los defaults.

Ejemplo (dentro de `parameters` del `config.json` de TerriaMap):

```json
"ckanSession": {
  "sessionUrl": "/api/terria/user/session",
  "privateCatalogUrl": "/api/terria/user/private-catalog",
  "loginUrl": "/user/login",
  "logoutUrl": "/user/_logout",
  "catalogGroupId": "ckan-private-catalog",
  "checkOnFocus": true,
  "focusThrottleMs": 5000
}
```

## Nota

- **Inferencia:** para trabajo cotidiano en este repo normalmente basta con `NODE_OPTIONS`; el resto de variables se usan en CI/CD o despliegues de TerriaMap.
