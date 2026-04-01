# Troubleshooting

Ver tambien: [[Setup Local]], [[Comandos Utiles]], [[Variables de Entorno]]

## Build o install se queda sin memoria

Sintoma:

- `yarn install`, `yarn gulp` o `yarn gulp docs` fallan por memoria

Accion:

```bash
export NODE_OPTIONS=--max_old_space_size=4096
```

## `terriajs-server` falla o no responde

Accion:

- revisar `terriajs-server.log`
- confirmar que el puerto `3002` esta libre

## `yarn hot` falla

- **Pendiente por confirmar:** el script apunta a `buildprocess/webpack.config.hot.js`, archivo no presente en el repo actual.
- Mientras no se confirme, preferir `yarn gulp dev` o `yarn gulp watch` + `yarn start`.

## Build de docs falla con `mkdocs`

Accion:

```bash
pip install -r requirements.txt
yarn gulp docs
```

## Problemas de CORS/proxy al consumir datos

- Este repo usa `terriajs-server`/proxy en muchos flujos.
- Para apps consumidoras, revisar `allowProxyFor`, `corsProxyBaseUrl` y `serverConfig`.
- Material fuente: `doc/connecting-to-data/cross-origin-resource-sharing.md`

## Cambios en TerriaJS no se reflejan al probar con TerriaMap

- Evitar `npm link`.
- Preferir Yarn workspaces, segun `doc/contributing/development-environment.md`.

## Tests no levantan en local

- confirmar que ya corriste `yarn gulp`
- probar `yarn gulp test-firefox`
- abrir `http://localhost:3002/SpecRunner.html` para inspeccion manual
