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

## Mapa base o capa de teselas carga a pedazos, o no carga en 3D

- Sintoma: en 2D las teselas llegan por tandas y en 3D el globo queda sin imagen; en la red aparecen `429` sobre `proxy/...`.
- Causa observada (2026-09-19, produccion): las teselas pasaban por el proxy de `terriajs-server` y el frontal HTTP (Varnish) aplica un limite global de peticiones por IP; un globo 3D pide cientos de teselas de golpe.
- `CorsProxy.shouldUseProxy` proxifica **siempre** un recurso `http://` desde una pagina `https`, aunque el host este en `corsDomains`. Algunos WMTS (p. ej. EOX `tiles.maps.eox.at`) publican plantillas `ResourceURL` en `http://` pese a servir el capabilities por `https`.
- `WebMapTileServiceCatalogItem` usa `matchCapabilitiesProtocol`: si el capabilities se cargo por `https` y la plantilla apunta al mismo host en `http://`, las teselas se piden por `https`. Con el host en `corsDomains` del init, el navegador las pide directo al servidor de teselas y no pasan por el proxy.
- Para otros servidores: comprobar que envian `Access-Control-Allow-Origin` en las teselas antes de agregarlos a `corsDomains`.

## Cambios en TerriaJS no se reflejan al probar con TerriaMap

- Evitar `npm link`.
- Preferir Yarn workspaces, segun `doc/contributing/development-environment.md`.

## Tests no levantan en local

- confirmar que ya corriste `yarn gulp`
- probar `yarn gulp test-firefox`
- abrir `http://localhost:3002/SpecRunner.html` para inspeccion manual
