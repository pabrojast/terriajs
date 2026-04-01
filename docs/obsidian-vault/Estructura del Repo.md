# Estructura del Repo

Ver tambien: [[Index]], [[Modulos]], [[Setup Local]]

## Directorios raiz

- `lib/`: codigo fuente principal.
- `buildprocess/`: configuracion y scripts de build, Karma, Webpack y utilidades de CI.
- `test/`: specs de Jasmine/Karma y utilidades de test.
- `wwwroot/`: assets, datos de prueba, traducciones y artefactos de build servidos al navegador.
- `doc/`: guia larga del proyecto y material de contribucion.
- `architecture/`: ADRs y notas de arquitectura.
- `.github/workflows/`: CI, deploy, publish y checks auxiliares.

## Directorios de codigo relevantes

- `lib/Core`
- `lib/Map`
- `lib/Models`
- `lib/ModelMixins`
- `lib/Traits`
- `lib/ReactViewModels`
- `lib/ViewModels`
- `lib/ReactViews`
- `lib/Table`
- `lib/Charts`

## Directorios de salida o generados

- `wwwroot/build/`: bundle de specs y assets copiados de Cesium.
- `dist/`: salida de `tsc -b tsconfig-node.json`.
- `ts-out/`: salida TypeScript del `tsconfig.json`.
- `coverage/`: reportes de cobertura de Karma.

## Otros archivos raiz utiles

- `package.json`: dependencias, scripts y version.
- `gulpfile.js`: tareas operativas.
- `tsconfig.json` y `tsconfig-node.json`: compilacion TS.
- `.eslintrc.js`, `.prettierrc`, `.editorconfig`: estilo y calidad.
- `netlify.toml`: build de documentacion en Netlify.
- `RELEASE_GUIDE.md`: flujo de publicacion.

## Estructura funcional de `wwwroot/`

- `wwwroot/data/`: datos base, incluyendo `regionMapping.json`.
- `wwwroot/languages/`: traducciones.
- `wwwroot/test/`: fixtures y datasets para tests.
- `wwwroot/images/`: imagenes e iconos.
- `wwwroot/build/`: salida de webpack/gulp.

## Nota

- **Inferencia:** el repo incluye tanto codigo fuente como varios artefactos de build ya presentes en working tree. Antes de eliminar o regenerar salidas conviene revisar si forman parte del flujo esperado del proyecto.
