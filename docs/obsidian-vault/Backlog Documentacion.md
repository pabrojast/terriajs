# Backlog de documentacion

## Operación de dashboards sencillos (2026-10-29)

- Hecho observado: resultados y revisiones usan tablas propias de PostgreSQL; snapshots/DuckDB usan `simple-sources` y `simple-tables`. El pruning antiguo de ResourceViews no administra estas rutas. Pendiente definir la retención operativa sin eliminar revisiones compartidas.
- Hecho observado: el transporte Node de COG valida URL/DNS y no reenvía cookies ni credenciales CKAN. Se verificaron COG públicos y series analíticas autorizadas. Pendiente verificar o implementar COG subidos cuyo endpoint de descarga exige sesión CKAN; la autorización del recurso por sí sola no garantiza que el transporte descargue ese archivo protegido. CSV/DataStore privados sí se verificaron con un lector no administrador.

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

Revalidado el 2026-10-23: [run 39985087715](https://github.com/pabrojast/terriajs/actions/runs/39985087715), revision `adf270acb`, conserva exactamente esos 14 warnings. El bundle de tests compila; los archivos con warnings no cambiaron en la correccion de enlaces cortos.

## Spec del token privado CKAN (2026-10-23)

- Hecho observado: al empaquetar `SpecMain.ts` y `BuildShareLinkSpec.ts` y ejecutarlos en Chromium, `strips the CKAN proxy token from private catalog items` falla porque `models[privateId]` es `undefined`. Ocurre en la base DEV `10980da71` y despues de corregir las series acumuladas; no es una regresion de ese cambio.
- Pendiente por confirmar: aislamiento/carga de los modelos WMS de ese test y su comportamiento en la suite completa. Los otros 15 casos del archivo pasan tras la correccion, y los ocho casos focalizados de seleccion/series pasan por separado. La evidencia de esta entrega esta en `ckan-unesco-docker/deploy/envoy-dev/validation-terria-shortlink-2026-10-23.md`.

## Autoría de Stories en pantalla pequeña (2026-10-02)

- Verificado: `StandardUserInterface.tsx` condiciona StoryBuilder a `!useSmallScreenInterface`. Al reducir el viewport de escritorio a 390 px, un editor abierto se desmonta; esta regla precede a la presentacion por capitulo. La prueba responsive de esta entrega corresponde al lector, no a autoria movil.
- Pendiente por confirmar: alcance de un editor movil y conservacion de borradores al cruzar el breakpoint. La autoria completa sigue disponible en escritorio; no se modifico este flujo en la recuperacion de ventanas clasicas.

## Revalidacion de referencias en la demo inglesa (2026-10-02)

- Verificado: 45 combinaciones de capitulo/viewport en Terria, video, fin del avance opcional, filtro Chile visible y drag/resize/restauracion de las ventanas clasicas. La misma edicion en CKAN paso referencias de mapas, dashboard y activacion al entrar al texto.
- Pendiente por confirmar: repetir el ciclo completo Chile → todos → activacion al entrar y Scroll en la nueva URL nativa inglesa. Los intentos adicionales agotaron el tiempo del navegador; una apertura limpia tambien presento `ERR_NETWORK_CHANGED` y timeout de navegacion. Los endpoints publicos respondieron HTTP 200 y los pods DEV siguieron Ready. No atribuir estos fallos al codigo sin reproducirlos con conectividad estable. La publicacion solo modifica contenido; evidencia y URLs en la guia de demos de Docker enlazada desde [[Testing]].

- Suite global Firefox (2026-10-29): resolver fallos preexistentes de STAC, stories y BuildShareLink reproducidos en la revision base; evidencia y diferencias de entorno en [[Testing]]. Pendiente por confirmar la causa de cada fallo y su correccion, fuera de la funcionalidad de preguntas sobre datos.
