# Backlog de documentacion

Ver tambien: [[Guia de Mantenimiento]], [[Troubleshooting]]

## Huecos y validaciones pendientes

- [ ] Confirmar el estado real del script `yarn hot` y si falta `buildprocess/webpack.config.hot.js` o si el script esta obsoleto.
- [ ] Documentar con mas precision el boundary entre TerriaJS libreria y TerriaMap aplicacion para equipos nuevos.
- [ ] Revisar y modernizar la informacion de `doc/contributing/architecture.md`, que hoy se marca como desactualizada para v8.
- [ ] Documentar una estrategia oficial de desarrollo local con browsers headless ademas de Firefox.
- [ ] Resumir los `ConfigParameters` mas usados por el equipo en una nota operativa, si el repo empieza a necesitarlos con frecuencia.
- [ ] Confirmar si deben versionarse artefactos generados como `wwwroot/build/`, `dist/` y `coverage/` en todos los flujos o solo en algunos contextos.
- [ ] Documentar mejor el flujo de deploy CI que clona TerriaMap en la rama `react-18-upgrade`, incluyendo su razon o caducidad.
- [ ] Completar una nota de entrypoints de consumidor externo si el equipo usa TerriaJS embebido fuera de TerriaMap.

## CI global y warnings de lint (2026-10-02)

Hecho observado: los runs `36964126663` (revision `367781b0e`) y `36967195573` (`c2223702d`) fallaron en `yarn gulp lint build --continue` por 14 warnings con `--max-warnings=0`: 13 en `WebMapTileServiceCatalogItem.ts` y uno en `mustacheExpressions.ts`. Esos archivos no cambiaron en el trabajo de la demo de Stories. La compilacion del bundle termino y los 16 specs focalizados de Stories, TypeScript y ESLint de los archivos modificados pasaron.

Pendiente: corregir esos warnings en una tarea propia y volver a ejecutar CI global. No presentar los controles focalizados como un CI completo verde. Evidencia: [run de CI](https://github.com/pabrojast/terriajs/actions/runs/36967195573).
