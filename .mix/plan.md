# Plan — Chart.js time-series para CSV (opt-in vía config)

> Tarea: para items CSV, mantener intacto el render antiguo (Visx/D3 + Expand al bottom dock)
> y agregar una **config opt-in** que, al activarse, cambia el gráfico del feature-info a
> **Chart.js** interactivo (zoom/pan/tooltips), abriéndolo **directo al click** (sin Expand) y
> con una **tabla de datos** opcional. Empezamos **solo con CSV**.

## 1. Enfoque / arquitectura

**Principio rector (consenso Codex + DeepSeek):** *cero cambios de comportamiento cuando la
config está apagada*. El camino legacy (FeatureInfoPanelChart preview → botón Expand →
ChartPanel/BottomDockChart con Visx) queda **idéntico**. El nuevo renderer vive **solo** en el
flujo de feature-info de CSV y se activa por un trait.

- **Punto de conmutación = el tag `<chart>`** que ya emite `tableFeatureInfoContext` →
  procesado por `CsvChartCustomComponent` → renderizado en `ChartCustomComponent.processChart`.
  No se reescriben templates ni se toca el camino legacy global.
- Cuando el trait está ON, `tableFeatureInfoContext` agrega el atributo `renderer="chartjs"`
  (más flags de UI) al `<chart>`. En `processChart`, si `attrs.renderer === "chartjs"`, se
  renderiza el componente nuevo `ChartJsFeatureInfoChart` en vez del preview Visx; el resto del
  pipeline (construcción del `CsvCatalogItem` derivado, `chartItems` de `TableMixin`) se reutiliza
  tal cual.
- **`ChartPanel` / `BottomDockChart` / `ChartView` NO se tocan** en esta iteración (decisión de
  Codex; reduce fuerte el riesgo de regresión y evita mezclar dos renderers en el bottom dock).
  El botón Expand sigue funcionando como escape-hatch legacy.
- **Carga diferida (lazy) de Chart.js** (énfasis de DeepSeek arquitectura+rendimiento): toda la
  librería (chart.js, react-chartjs-2, plugin de zoom, adapter) se importa con `import()` dinámico
  dentro del componente nuevo, de modo que **no entra al bundle principal** ni afecta a quien no
  active la config.

**Ubicación del chart al click — DECIDIDO: modal / panel grande.** Al hacer click en un punto del
CSV (con el trait ON), el feature-info muestra un chart Chart.js **compacto e interactivo** (ya con
zoom/pan) y un botón prominente **"Ver en grande / Datos"** que abre un **modal grande** con el
chart a tamaño completo (zoom/pan/reset/descargas) y la **tabla de datos** (pestañas o split
Chart | Datos). Esto da espacio real para zoom y tabla. Reusar la infraestructura de modal/portal
existente de TerriaJS (no inventar una capa nueva si ya hay un componente de modal/overlay).
NO auto-abrir el bottom dock legacy.

**Dónde decidí distinto de los asesores:**
- DeepSeek propuso una abstracción `ChartComponentProvider` (patrón estrategia). Lo simplifico: el
  selector de renderer es el atributo `renderer` del `<chart>` (enfoque Codex), localizado en
  `processChart`. Es el mismo efecto con mucho menos andamiaje y menor superficie de regresión.
- Adapter de fechas: **`chartjs-adapter-moment`** (Codex) en vez de `date-fns` (DeepSeek), porque
  `moment@^2.30.1` ya es dependencia → no sumamos una librería de fechas nueva.
- Virtualización de la tabla: NO hay `react-window` en el repo. Para v1 la tabla se **limita a N
  filas visibles con scroll** (CSS `max-height` + overflow) y un aviso si se truncó; se deja
  anotado react-window como mejora futura (evita sumar dep no pedida).

## 2. Dependencias (package.json)

Agregar, con versiones fijas y `npm audit` previo (DeepSeek seguridad):
- `chart.js@^4`
- `react-chartjs-2@^5` (compatible con React 18.3 del repo)
- `chartjs-plugin-zoom@^2`
- `chartjs-adapter-moment@^1`  (usa el `moment` ya presente)

## 3. Archivos a crear / modificar

**Modificar:**
- `package.json` — nuevas deps.
- `lib/Traits/TraitsClasses/CsvCatalogItemTraits.ts` — traits nuevos (sección 4).
- `lib/Table/tableFeatureInfoContext.ts` — emitir `renderer="chartjs"` + flags cuando el trait ON.
- `lib/ReactViews/Custom/ChartCustomComponent.ts` — agregar `renderer`/`show-data-table` a
  `ChartCustomComponentAttributes`, a `ChartAttributes`, parsearlos en `parseNodeAttrs`, y
  bifurcar en `processChart` (≈línea 333) para renderizar el componente nuevo.
- `lib/ReactViews/Custom/CsvChartCustomComponent.ts` — extender `attributes`/`parseNodeAttrs` con
  los atributos nuevos (si hace falta para CSV).

**Crear:**
- `lib/ReactViews/Custom/Chart/ChartJs/ChartJsFeatureInfoChart.tsx` — wrapper liviano que va en el
  feature-info: lazy-loads el renderer, chart compacto interactivo + botón "Ver en grande / Datos"
  que abre el modal; estados loading/empty/error.
- `lib/ReactViews/Custom/Chart/ChartJs/ChartJsModal.tsx` — modal grande (reusar modal/portal
  existente de TerriaJS): chart a tamaño completo + pestañas/split Chart | Datos + toolbar.
- `lib/ReactViews/Custom/Chart/ChartJs/ChartJsLineChart.tsx` — el chart real (react-chartjs-2
  `<Line>`), mapea `item.chartItems` → datasets, configura ejes/zoom/tooltip/decimation/tema.
- `lib/ReactViews/Custom/Chart/ChartJs/registerChartJs.ts` — registro central idempotente de
  controllers/elements/scales/plugins + zoomPlugin (no usar `chart.js/auto`, para no inflar).
- `lib/ReactViews/Custom/Chart/ChartJs/ChartJsToolbar.tsx` — botones: Reset zoom, Descargar CSV,
  Descargar PNG, toggle Tabla, (+/- zoom accesibles).
- `lib/ReactViews/Custom/Chart/ChartJs/ChartDataTable.tsx` — tabla colapsable, render React
  (auto-escapado, sin `dangerouslySetInnerHTML`), scroll con `max-height`.
- Tests:
  - `test/Table/tableFeatureInfoContextSpec.ts` (o extender el existente) — emite `renderer` según trait.
  - `test/ReactViews/Custom/ChartCustomComponentSpec.tsx` — parseo de `renderer` + branch.
  - `test/ReactViews/Custom/Chart/ChartJsFeatureInfoChartSpec.tsx` — render con `chartItems` mock.

## 4. Traits nuevos (CsvCatalogItemTraits)

```ts
@primitiveTrait({ type: "boolean", name: "Use Chart.js time series",
  description: "Render the feature-info time-series chart with the interactive Chart.js renderer (zoom/pan/tooltips) instead of the legacy preview chart." })
useChartJsTimeSeries: boolean = false;        // default false → comportamiento idéntico al actual

@primitiveTrait({ type: "boolean", name: "Show data table",
  description: "When using the Chart.js renderer, show a toggle to display the raw data as a table." })
chartJsShowDataTable: boolean = true;
```
(Default `false` garantiza no-regresión. Diseñado para luego subir el flag a un mixin común y
reusarlo en COG, etc., pero v1 = solo CSV.)

## 5. Pasos en orden (alineados al bucle /mix)

1. **Deps + registro**: agregar deps, crear `registerChartJs.ts`, verificar que webpack/Karma
   resuelvan el ESM de chart.js (build/typecheck).
2. **Trait**: agregar `useChartJsTimeSeries` + `chartJsShowDataTable` (default false/true).
3. **Emisión del atributo**: `tableFeatureInfoContext` agrega `renderer="chartjs"` +
   `show-data-table` cuando el item CSV tiene el trait ON. Legacy intacto cuando OFF.
4. **Parser + branch**: `ChartCustomComponent` acepta/parsa `renderer` y bifurca en `processChart`.
5. **Chart nuevo**: `ChartJsLineChart` mapeando `item.chartItems` → datasets; eje x `time`
   (Date) / `linear`; zoom+pan en x (wheel/drag/pinch); `interaction.mode="index"`,
   `intersect=false`; `animation=false`; `decimation` (LTTB); `pointRadius` bajo; colores de tema
   vía `useTheme()`; tooltips text-only (fecha + valor + unidad).
6. **Wrapper + lazy**: `ChartJsFeatureInfoChart` con `import()` dinámico, estados
   loading/empty/error (error boundary), y montaje/desmontaje limpio (destroy del chart, sin fugas
   MobX — cleanup en `useEffect`).
7. **Toolbar + tabla**: Reset zoom, Descargar CSV, Descargar PNG, toggle tabla; `ChartDataTable`
   colapsable y escapada.
8. **Accesibilidad/UX**: aria-label en la región del chart, botones +/- de zoom, estados vacíos
   con mensaje, theme consistente con TerriaJS.
9. **Tests + i18n**: specs nuevos/regresión; strings nuevas a `lib/Language/en/`.

## 6. Riesgos / decisiones clave

- **No-regresión**: con el trait OFF, los specs de CSV/chart existentes deben pasar idénticos
  (verificación primaria).
- **Bundle**: si la lazy-load no aísla bien, chart.js entra al entry principal → revisar que la
  importación estática nunca aparezca sin el flag (chequeo de bundle / import dinámico estricto).
- **Fechas**: time scale necesita adapter; probar ISO, timestamps, huecos, fechas inválidas.
- **Performance series largas**: `decimation` + `pointRadius` 0 + sin animación; tabla con scroll
  acotado (sin virtualización por ahora).
- **Seguridad** (DeepSeek): sin `dangerouslySetInnerHTML` en tabla/tooltips; valores del CSV solo
  como texto; nombres de descarga sanitizados/genéricos; versiones fijas + `npm audit`.
- **MobX**: estado de zoom/pan en estado React local (no observable global) para evitar loops y
  re-render del modelo.

## 7. Funcionalidades extra recomendadas (las "mejores" pedidas)

Zoom rueda + drag + pinch · pan · **reset zoom** · tooltips ricos (fecha+valor+unidad) ·
**toggle tabla de datos** (colapsable) · **descarga CSV** y **descarga PNG** · multi-serie con
leyenda toggleable · decimation para series grandes · estados loading/vacío/error · colores de
tema · accesibilidad (aria + botones +/- de zoom). *Stretch (no v1): crosshair sincronizado,
selección de rango temporal, virtualización de tabla con react-window.*

## 8. Cómo se verifica

- **Automático**: `npx tsc`/`build-for-node` (typecheck), `gulp lint`, specs nuevos + regresión.
- **Trait OFF**: CSV time-series sigue mostrando el preview Visx y Expand → bottom dock legacy.
- **Trait ON**: click en punto CSV → chart Chart.js interactivo inline (zoom/pan/tooltip/reset),
  toggle de tabla, descargas; sin necesidad de Expand.
- **Manual**: CSV con fechas ISO, CSV con timestamps, CSV con muchas filas (performance).
- **Bundle**: confirmar que chart.js no aparece en el entry principal cuando el trait no se usa.
