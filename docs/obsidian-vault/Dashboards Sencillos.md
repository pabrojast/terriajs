# Dashboards Sencillos

Ver [[Index]], [[Modulos]], [[Testing]], [[Deployment]].

Opción nativa complementaria al Dashboard Builder de CKAN. El botón abre una biblioteca y un editor de tres pasos: capas cargadas, bloques, revisión/guardado. Se admiten hasta seis fuentes y seis bloques en una columna: indicador, línea, barras y tabla. El panel se puede minimizar y pasa a la parte inferior en móvil. Chart.js representa los resultados; las fechas de los gráficos actualizan el reloj de Terria.

`parameters.simpleDashboards.enabled` activa la interfaz. El backend independiente vive en `ckanext-dashboard_view.simple`; requiere migración, cola dedicada y su propia bandera. No modifica ResourceViews existentes ni sustituye WaterQualityPanel. Al abrir el nuevo panel se oculta temporalmente el panel del piloto para evitar solapamientos.

## Persistencia y acceso

Las fuentes registradas usan sus identificadores CKAN. Los pilotos públicos usan espacios de URL autorizados por el administrador. Las tablas locales solo tienen vista previa: para guardar se necesita una fuente persistente. Crear requiere sesión IHP y lectura/descarga de todas las fuentes; editar requiere ser propietario o administrador. Cada lectura vuelve a comprobar permisos. Publicar una revisión requiere que todas las fuentes sean públicas.

Los diseños se guardan como revisiones inmutables, privadas inicialmente. Publicar es una acción explícita. Un borrador posterior no altera la revisión publicada. Las revisiones publicadas anteriores siguen disponibles; volver privado revoca todas. Las historias y enlaces llevan `simpleDashboard: {id, revision}`, nunca resultados calculados ni credenciales. Las historias usan `kind: "simple"` y `simple: {id, revision}`, manteniendo los campos anteriores para compatibilidad. CKAN Stories genera un embed Terria con `dashboardOnly=1`, sujeto al mismo control de acceso.

## Cálculos

El servidor prepara CSV/DataStore/GeoJSON con el motor DuckDB existente. Los resultados se guardan en PostgreSQL y se revalidan cada 300 segundos mientras el panel está activo. Las claves incluyen versión de motor, contenido, selección temporal, geometría y parámetros de bloque. Se reutilizan los bloques y fechas que no cambiaron. Los errores transitorios pueden mostrar el último resultado con aviso; una revocación de acceso nunca permite devolverlo.

`server/simple-dashboard/` genera un pequeño bundle Node con CogPointReader, CogZonalEngine y WaterQuality. Su transporte valida DNS público y redirecciones, fija la dirección de conexión y limita cada respuesta. El worker nunca recibe código ni fórmulas. Los pilotos usan sus series analíticas originales, con cobertura, huecos y períodos parciales; los píxeles y polígonos conservan su método aparte. Una URL fechada permanece en esa edición mientras la fuente registrada no cambie.

## Comprobaciones

- `npm ci --prefix server/simple-dashboard` y `npm run build --prefix server/simple-dashboard`.
- `npm test --prefix server/simple-dashboard`: límites del transporte.
- Suite Jasmine `Simple dashboards`: referencias, restauración/serialización y compatibilidad con dashboards CKAN.
- Las pruebas de permisos, revisiones, CSRF, cálculo y caché residen en `ckanext-dashboard_view`.

Los resultados de CI, ejemplos y despliegue deben registrarse con el SHA e imagen efectivos en [[Deployment]].
