# Setup Local

Ver tambien: [[Comandos Utiles]], [[Variables de Entorno]], [[Troubleshooting]]

## Prerrequisitos verificados en el repo

- Node `>= 20.0.0` en `package.json`
- `.nvmrc`: `v20.18.3`
- Yarn classic (`yarn@^1.x`) segun scripts y documentacion
- Python + dependencias de `requirements.txt` para build de docs

## Setup recomendado

1. Usar la version de Node de `.nvmrc`.
2. Instalar dependencias:

```bash
yarn install
```

3. Build base del repo:

```bash
yarn gulp
```

4. Levantar servidor local:

```bash
yarn start
```

5. Abrir:

- app/server local: `http://localhost:3002`
- runner de specs: `http://localhost:3002/SpecRunner.html`

## Para documentacion

Instalar dependencias Python:

```bash
pip install -r requirements.txt
```

Generar docs:

```bash
yarn gulp docs
```

## Para build de artefactos Node

```bash
yarn build-for-node
```

## Recomendaciones practicas

- Exportar `NODE_OPTIONS=--max_old_space_size=4096` si hay problemas de memoria en install/build/docs.
- El servidor `terriajs-server` escribe logs en `terriajs-server.log`.
- `postinstall` ejecuta `gulp post-npm-install`, que copia assets de Cesium a `wwwroot/build/`.

## Vacios

- `devserverconfig.json`: `Pendiente por confirmar`. No existe en este repo, aunque parte de la documentacion historica de TerriaMap lo menciona para aplicaciones consumidoras.
