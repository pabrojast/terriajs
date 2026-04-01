# Comandos Utiles

Ver tambien: [[Setup Local]], [[Testing]], [[Deployment]], [[Troubleshooting]]

## Scripts de `package.json`

| Comando               | Uso                                                  |
| --------------------- | ---------------------------------------------------- |
| `yarn install`        | instala dependencias                                 |
| `yarn gulp`           | ejecuta la tarea default de Gulp: lint + build       |
| `yarn start`          | levanta `terriajs-server` en puerto `3002`           |
| `yarn hot`            | intenta levantar webpack dev server con HMR          |
| `yarn build-docs`     | build de herramientas + `node build/generateDocs.js` |
| `yarn build-for-node` | compila `lib/` a `dist/` usando `tsconfig-node.json` |
| `yarn prettier`       | formatea el repo                                     |
| `yarn prettier-check` | verifica formato                                     |

## Tareas de Gulp observadas

| Comando                      | Uso                                                  |
| ---------------------------- | ---------------------------------------------------- |
| `yarn gulp lint`             | ejecuta ESLint en `lib/` y `test/`                   |
| `yarn gulp build`            | copia assets de Cesium y genera specs no minificadas |
| `yarn gulp release`          | copia assets de Cesium y genera specs minificadas    |
| `yarn gulp watch`            | build incremental de specs                           |
| `yarn gulp dev`              | `terriajs-server` + `watch`                          |
| `yarn gulp test`             | corre Karma con browsers detectados localmente       |
| `yarn gulp test-firefox`     | corre Karma en Firefox                               |
| `yarn gulp docs`             | genera docs de usuario y referencia                  |
| `yarn gulp code-attribution` | regenera `doc/acknowledgements/attributions.md`      |
| `yarn gulp reference-guide`  | genera referencia JSDoc                              |
| `yarn gulp terriajs-server`  | inicia `terriajs-server` directamente                |

## Build/test/docs en CI

- CI principal: `yarn prettier-check`, `yarn gulp lint build --continue`, `yarn gulp test-firefox`
- Publish npm: `npx gulp lint release`, luego `npm publish`
- Netlify docs: `yarn gulp docs`

## Notas operativas

- `yarn hot`: **Pendiente por confirmar**. El script referencia `buildprocess/webpack.config.hot.js`, pero ese archivo no existe actualmente.
- `yarn start` usa `terriajs-server --port 3002`, mientras que `gulp terriajs-server` tambien puede iniciar el server.
- `prepare` ejecuta `yarn build-for-node && husky install`.
