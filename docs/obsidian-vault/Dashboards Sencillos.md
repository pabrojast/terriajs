# Dashboards Sencillos

Ver [[Index]], [[Modulos]], [[Testing]], [[Deployment]].

Opción nativa complementaria al Dashboard Builder de CKAN. El botón abre una biblioteca y un editor de tres pasos: capas cargadas, bloques, revisión/guardado. Se admiten hasta seis fuentes y seis bloques en una columna: indicador, línea, barras y tabla. El panel se puede minimizar y pasa a la parte inferior en móvil. Chart.js representa los resultados; las fechas de los gráficos actualizan el reloj de Terria.

`parameters.simpleDashboards.enabled` activa la interfaz. El backend independiente vive en `ckanext-dashboard_view.simple`; requiere migración, cola dedicada y su propia bandera. No modifica ResourceViews existentes ni sustituye WaterQualityPanel. Al abrir el nuevo panel se oculta temporalmente el panel del piloto para evitar solapamientos.

Durante el recálculo de una vista previa se conservan las opciones de columnas y cuerpos de agua de las fuentes seleccionadas. Los valores del cálculo se actualizan por separado, sin vaciar los selectores del editor.

La ventana se mueve arrastrando el encabezado con ratón o tacto. Con el encabezado enfocado, las flechas desplazan la ventana e Inicio restablece su posición. El espacio de movimiento deja accesible el menú superior. `simpleDashboardPosition: {x, y}` guarda proporciones entre 0 y 1 del espacio disponible en el enlace compartido; al cambiar de pantalla o minimizar/expandir, la ventana sigue dentro del mapa. Los enlaces anteriores conservan la ubicación predeterminada. Los embeds de historias mantienen su diseño integrado.

La esquina inferior derecha permite agrandar o achicar el panel con ratón o tacto. Con ese control enfocado, las flechas cambian el tamaño (Mayús acelera) e Inicio recupera el tamaño predeterminado. `simpleDashboardSize: {width, height}` conserva el tamaño preferido en píxeles al compartir, incluso sin historias. El tamaño también permanece al cerrar/abrir y se guarda como preferencia local del navegador. Una pantalla pequeña limita las dimensiones visibles sin sobrescribir el tamaño preferido. Minimizar conserva las dimensiones para expandir de nuevo; los embeds no cambian.

El nombre visible es **Dashboard** en inglés y español; se conserva el identificador interno `simpleDashboard` para compatibilidad. La interfaz usa `simpleDashboard` en los recursos i18next de Terria, en inglés y español. Cambiar el idioma actualiza controles, encabezados generados de cálculos satelitales, valores booleanos, formatos numéricos y mensajes conocidos de validación. Los nombres y columnas originales de las fuentes, títulos escritos por el autor y el CSV conservan su contenido. Los dos accesos de dashboard y asistente usan los estilos comunes del menú de Terria.

## Persistencia y acceso

Las fuentes registradas usan sus identificadores CKAN. Los pilotos públicos usan espacios de URL autorizados por el administrador. Las tablas locales solo tienen vista previa: para guardar se necesita una fuente persistente. Crear requiere sesión IHP y lectura/descarga de todas las fuentes; editar requiere ser propietario o administrador. Cada lectura vuelve a comprobar permisos. Publicar una revisión requiere que todas las fuentes sean públicas.

Los diseños se guardan como revisiones inmutables, privadas inicialmente. Publicar es una acción explícita. Un borrador posterior no altera la revisión publicada. Las revisiones publicadas anteriores siguen disponibles; volver privado revoca todas. Las historias y enlaces llevan `simpleDashboard: {id, revision}`, nunca resultados calculados ni credenciales. Las historias usan `kind: "simple"` y `simple: {id, revision}`, manteniendo los campos anteriores para compatibilidad. CKAN Stories genera un embed Terria con `dashboardOnly=1`, sujeto al mismo control de acceso.

La API y los trabajos en cola consultan el estado actual de la cuenta en la base de datos. Una cookie o trabajo anterior a su desactivación no conserva acceso de autor, propietario o administrador ni puede reutilizar resultados privados.

## Cálculos

El servidor prepara CSV/DataStore/GeoJSON con el motor DuckDB existente. Los resultados se guardan en PostgreSQL y se revalidan cada 300 segundos mientras el panel está activo. Las claves incluyen versión de motor, contenido, selección temporal, geometría y parámetros de bloque. Se reutilizan los bloques y fechas que no cambiaron. Los errores transitorios pueden mostrar el último resultado con aviso; una revocación de acceso nunca permite devolverlo.

`server/simple-dashboard/` genera un pequeño bundle Node con CogPointReader, CogZonalEngine y WaterQuality. Su transporte valida DNS público y redirecciones, fija la dirección de conexión y limita cada respuesta. El worker nunca recibe código ni fórmulas. Los pilotos usan sus series analíticas originales, con cobertura, huecos y períodos parciales; los píxeles y polígonos conservan su método aparte. Una URL fechada permanece en esa edición mientras la fuente registrada no cambie.

## Comprobaciones

- `npm ci --prefix server/simple-dashboard` y `npm run build --prefix server/simple-dashboard`.
- `npm test --prefix server/simple-dashboard`: límites del transporte.
- Suite Jasmine `Simple dashboards`: referencias, restauración/serialización y compatibilidad con dashboards CKAN.
- Las pruebas de permisos, revisiones, CSRF, cálculo y caché residen en `ckanext-dashboard_view`.

Los resultados de CI, ejemplos y despliegue deben registrarse con el SHA e imagen efectivos en [[Deployment]].

## Ámbito del cálculo y seguimiento del mapa

El selector **Ámbito de cálculo** ofrece selección configurada (predeterminada para revisiones existentes), seguir el mapa y área fija. Sigue la extensión geográfica de Leaflet o Cesium, conserva las fuentes y fechas del Dashboard y no depende de la visibilidad de las capas. En 3D el rectángulo es aproximado; una cámara sin extensión válida no dispara cálculos. Los encuadres que cruzan el antimeridiano se dividen en dos ventanas sin solapamiento.

CSV/DataStore filtran coordenadas numéricas antes de agregar; el editor permite corregir las columnas detectadas. GeoJSON conserva las geometrías de la generación y selecciona entidades completas por intersección (incluye agujeros). Los bloques sin ubicación se identifican como **Sin filtro espacial**. Un promedio vacío es nulo, no cero. El resumen de cuerpos usa su bbox y mediana ponderada por superficie por fecha, preservando la selección de un cuerpo fijo; requiere elegir **Cuerpos de agua en el encuadre** para un resumen regional.

Los COG muestran el tamaño de píxel utilizado. El cálculo rápido puede usar overviews. **Fijar área y calcular a resolución nativa** fija el encuadre y usa el nivel 0; exige un COG autorizado, limita cada ventana a 500.000 píxeles y cada bloque temporal a 5.000.000 píxeles leídos. Se mantienen los límites del worker y de 366 fechas. Las fuentes de cuerpos pueden asociar un `analysis_resource_id` de CKAN: se reautoriza también esa fuente en lectura, publicación y cálculo. La resolución nativa corresponde al ráster asociado, no reconstruye las observaciones originales de una serie preagregada.

El cliente espera 750 ms de estabilidad para capturar el mapa y otros 750 ms antes de enviar la consulta. Mantiene un trabajo activo y solo el último encuadre pendiente; respuestas de un encuadre anterior no se muestran como actuales. Cerrar/contraer el panel detiene el seguimiento; los trabajos ya enviados pueden terminar en el servidor. Los resultados por encuadre caducan en Redis tras una hora; las generaciones de fuentes se reutilizan.

`DashboardState.spatial` contiene `mode`, `bounds`, `quality` y `approximate`. Las revisiones siguen siendo inmutables: navegar solo cambia el estado de consulta. El estado del Dashboard se conserva en enlaces compartidos/shortlinks, independientemente de incluir Stories, y la exportación usa el mismo estado. Sin mapa, un dashboard incrustado necesita área fija; el seguimiento no se sustituye por una consulta global.
