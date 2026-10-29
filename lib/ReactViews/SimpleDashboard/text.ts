import i18next from "i18next";
const words = {
  title: ["Simple dashboard", "Dashboard sencillo"],
  library: ["My dashboards in IHP", "Mis dashboards en IHP"],
  create: ["Create dashboard", "Crear dashboard"],
  public: ["Public dashboards", "Dashboards públicos"],
  data: ["1 · Data", "1 · Datos"],
  blocks: ["2 · Blocks", "2 · Bloques"],
  review: ["3 · Review and save", "3 · Revisar y guardar"],
  choose: ["Choose loaded layers", "Elige las capas cargadas"],
  empty: [
    "Add a table or satellite layer to the map to begin.",
    "Agrega una tabla o capa satelital al mapa para comenzar."
  ],
  next: ["Continue", "Continuar"],
  back: ["Back", "Volver"],
  add: ["Add block", "Agregar bloque"],
  save: ["Save privately", "Guardar privado"],
  update: ["Save new revision", "Guardar nueva revisión"],
  edit: ["Edit", "Editar"],
  duplicate: ["Duplicate", "Duplicar"],
  publish: ["Publish this revision", "Publicar esta revisión"],
  unpublish: ["Make private", "Volver privado"],
  remove: ["Remove", "Quitar"],
  close: ["Close", "Cerrar"],
  signIn: [
    "Sign in to IHP to create and save dashboards",
    "Inicia sesión en IHP para crear y guardar dashboards"
  ],
  name: ["Dashboard name", "Nombre del dashboard"],
  preview: ["Preview", "Vista previa"],
  source: ["Source", "Fuente"],
  blockType: ["Block type", "Tipo de bloque"],
  titleField: ["Block title", "Título del bloque"],
  measure: ["Value", "Valor"],
  group: ["Group / date", "Grupo / fecha"],
  aggregate: ["Calculation", "Cálculo"],
  unit: ["Unit", "Unidad"],
  body: ["Water body", "Cuerpo de agua"],
  period: ["Period", "Período"],
  start: ["From", "Desde"],
  end: ["To", "Hasta"],
  calculating: [
    "Preparing data and calculating…",
    "Preparando datos y calculando…"
  ],
  stale: [
    "Showing the last calculation while checking the data.",
    "Se muestra el último cálculo mientras se comprueban los datos."
  ],
  checked: ["Data checked", "Datos comprobados"],
  details: [
    "Sources and calculation details",
    "Fuentes y detalles del cálculo"
  ],
  private: ["Private", "Privado"],
  published: ["Published", "Publicado"],
  revision: ["Revision", "Revisión"],
  pin: [
    "Stories keep this design revision and refresh its data.",
    "Las historias conservan esta revisión del diseño y actualizan sus datos."
  ],
  noData: ["No valid observations", "Sin observaciones válidas"],
  showTable: ["View values", "Ver valores"],
  dateField: ["Date column (optional)", "Columna de fecha (opcional)"],
  category: ["Category filter (optional)", "Filtro de categoría (opcional)"],
  all: ["All", "Todos"],
  area: ["Selected area", "Área seleccionada"],
  draw: ["Draw area", "Dibujar área"],
  point: ["Use point selected on map", "Usar punto seleccionado en el mapa"],
  clear: ["Clear area", "Quitar área"],
  local: [
    "Local preview only. Register the source in IHP to save it.",
    "Solo vista previa local. Registra la fuente en IHP para guardarla."
  ],
  count: ["Count", "Cantidad"],
  sum: ["Sum", "Suma"],
  avg: ["Mean", "Promedio"],
  median: ["Median", "Mediana"],
  min: ["Minimum", "Mínimo"],
  max: ["Maximum", "Máximo"],
  kpi: ["Indicator", "Indicador"],
  line: ["Line chart", "Gráfico de líneas"],
  bar: ["Bar chart", "Gráfico de barras"],
  table: ["Table", "Tabla"],
  daily: ["Daily", "Diario"],
  monthly: ["Monthly", "Mensual"],
  annual: ["Annual", "Anual"],
  loading: ["Loading…", "Cargando…"],
  more: [
    "Some results are truncated. Narrow the period or filters.",
    "Algunos resultados están limitados. Reduce el período o los filtros."
  ],
  latest: ["Open latest design", "Abrir diseño más reciente"],
  delete: ["Delete dashboard", "Eliminar dashboard"],
  confirmDelete: [
    "Delete this dashboard? Existing links will stop working.",
    "¿Eliminar este dashboard? Sus enlaces dejarán de funcionar."
  ],
  draft: [
    "New edits remain private until you publish this revision.",
    "Los cambios quedan privados hasta publicar esta revisión."
  ],
  needPoint: [
    "Click a point on the map first.",
    "Primero selecciona un punto en el mapa."
  ],
  unavailable: ["Dashboard unavailable", "Dashboard no disponible"]
} as const;
export type DashboardText = keyof typeof words;
export const tr = (key: DashboardText) =>
  words[key][i18next.language?.startsWith("es") ? 1 : 0];
