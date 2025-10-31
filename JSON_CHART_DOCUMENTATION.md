# JSON Chart Component Documentation

## Resumen

Se ha implementado un nuevo componente personalizado `<json-chart>` que permite renderizar series temporales desde datos JSON en los paneles de información de features (feature info panels).

## Componentes Implementados

### 1. JsonChartCustomComponent

**Archivo:** `lib/ReactViews/Custom/JsonChartCustomComponent.ts`

Este componente extiende `CsvChartCustomComponent` y convierte automáticamente datos JSON a formato CSV para renderizarlos como gráficos.

**Formatos JSON soportados:**

```json
// Formato con array anidado en "result"
{
  "result": [
    {"time": "2024-01-01T00:00:00Z", "mean": 1.5},
    {"time": "2024-01-02T00:00:00Z", "mean": 2.3}
  ]
}

// Formato con array anidado en "data"
{
  "data": [
    {"time": "2024-01-01T00:00:00Z", "value": 1.5}
  ]
}

// Formato de array directo
[
  {"time": "2024-01-01T00:00:00Z", "mean": 1.5},
  {"time": "2024-01-02T00:00:00Z", "mean": 2.3}
]
```

### 2. Mustache Helper: jsonStringify

**Archivo:** `lib/ReactViews/FeatureInfo/mustacheExpressions.ts`

Nueva función helper para convertir objetos JavaScript a strings JSON en templates Mustache:

```mustache
{{#terria.jsonStringify}}{{someObject}}{{/terria.jsonStringify}}
```

## Uso del Componente

### Ejemplo 1: JSON Inline

```json
{
  "type": "csv",
  "url": "test/csv/lat_lon_name_value.csv",
  "featureInfoTemplate": {
    "template": "<h3>Time Series</h3><json-chart title='Sample Data' x-column='time' y-columns='mean'>{\"result\": [{\"time\": \"2024-01-01T00:00:00Z\", \"mean\": 1.5}, {\"time\": \"2024-01-02T00:00:00Z\", \"mean\": 2.3}]}</json-chart>"
  }
}
```

### Ejemplo 2: Con URL (GET request)

```json
{
  "type": "csv",
  "url": "test/csv/lat_lon_name_value.csv",
  "featureInfoTemplate": {
    "template": "<json-chart title='Time Series' src='https://api.example.com/timeseries.json' x-column='time' y-columns='value'></json-chart>"
  }
}
```

### Ejemplo 3: Para WMTS con Variables Mustache

```json
{
  "type": "wmts",
  "url": "https://data.dev-wins.com/xcube/wmts/1.0.0/WMTSCapabilities.xml",
  "layer": "ukraine_lwq300_pyramid/tsm_mean",
  "featureInfoTemplate": {
    "name": "{{layerTitle}} - Timeseries",
    "template": "<h3>Location: {{terria.coords.latitude}}, {{terria.coords.longitude}}</h3><p>Haz clic en 'Expand' para ver la serie temporal completa.</p>"
  }
}
```

## ✅ Configuración para WMTS con POST Requests (¡AHORA FUNCIONA!)

Para tu caso específico con la API de xcube que requiere POST requests, ahora puedes usar gráficos directamente con `featureInfoRequest`:

### Solución Implementada: Usando featureInfoContext automático

```json
{
  "type": "wmts",
  "url": "https://data.dev-wins.com/xcube/wmts/1.0.0/WMTSCapabilities.xml",
  "layer": "ukraine_lwq300_pyramid/tsm_mean",
  "featureInfoRequest": {
    "url": "https://data.dev-wins.com/xcube/timeseries/{{layerPath}}",
    "method": "POST",
    "body": "{ \"type\": \"Point\", \"coordinates\": [{{longitude}}, {{latitude}}] }",
    "headers": {
      "Content-Type": "application/json"
    },
    "responseType": "json"
  },
  "featureInfoTemplate": {
    "name": "{{layerTitle}} - Series Temporal",
    "template": "<h3>{{terria.timeSeries.title}}</h3><p><strong>Ubicación:</strong> {{terria.coords.latitude}}°N, {{terria.coords.longitude}}°E</p><p>Haz clic en 'Expand' para ver la serie temporal completa.</p>{{terria.timeSeries.chart}}"
  }
}
```

**¿Cómo funciona?**

1. Cuando `featureInfoRequest` tiene `responseType: "json"`, el sistema automáticamente expone los datos JSON en el contexto de Mustache
2. Los datos están disponibles en `{{terria.timeSeries.data}}` como JSON string
3. El componente pre-renderizado `{{terria.timeSeries.chart}}` incluye automáticamente el `<json-chart>` con los datos

### Opciones de Personalización

Si quieres personalizar el gráfico, puedes usar el componente `<json-chart>` directamente:

```json
{
  "featureInfoTemplate": {
    "template": "<h3>Series Temporal Personalizada</h3><json-chart title='{{layerTitle}}' identifier='{{terria.timeSeries.id}}' x-column='time' y-columns='mean,median,max' column-titles='Tiempo,Media,Mediana,Máximo'>{{terria.timeSeries.data}}</json-chart>"
  }
}
```

## ✨ Características Implementadas

### ✅ Soporte completo para POST Requests con JSON

La implementación ahora incluye soporte completo para peticiones POST con respuestas JSON:

1. **`jsonFeatureInfoContext`**: Función helper que expone datos JSON del POST request en el contexto de Mustache
2. **`featureInfoContext` en WebMapTileServiceCatalogItem**: Cuando `responseType: "json"`, los datos están disponibles automáticamente
3. **`JsonChartCustomComponent`**: Componente que renderiza gráficos desde datos JSON
4. **Variables de template automáticas**:
   - `{{terria.timeSeries.data}}` - Datos JSON como string
   - `{{terria.timeSeries.chart}}` - Elemento `<json-chart>` pre-renderizado
   - `{{terria.timeSeries.title}}` - Título del gráfico
   - `{{terria.timeSeries.id}}` - ID único del feature

### Posibles Mejoras Futuras

1. **Soporte directo para POST en `<json-chart src="...">`**
   - Actualmente `json-chart` con atributo `src` solo soporta GET
   - Para POST usa `{{terria.timeSeries.chart}}` o datos inline con `{{terria.timeSeries.data}}`
   - Mejora futura: Agregar atributos `method`, `body-template`, `headers` al componente

2. **Detección automática de columnas**
   - Detectar automáticamente columnas de tiempo y valores numéricos del JSON
   - Actualmente requiere especificar `x-column` y `y-columns`

3. **Múltiples series en un gráfico**
   - Soporte mejorado para múltiples columnas Y con colores personalizados

## Atributos Soportados

El componente `<json-chart>` soporta todos los atributos de `<chart>`:

- `title` - Título del gráfico
- `src` - URL fuente de datos (GET request)
- `x-column` - Nombre de la columna para el eje X
- `y-columns` - Columnas para el eje Y (separadas por comas)
- `column-titles` - Títulos personalizados para columnas
- `column-units` - Unidades para columnas
- `sources` - Lista de URLs separadas por comas
- `source-names` - Nombres para cada fuente
- `downloads` - URLs de descarga
- `download-names` - Nombres para descargas
- `hide-buttons` - 'true' para ocultar botones
- `can-download` - 'false' para deshabilitar descarga

## Testing

Puedes probar la implementación de las siguientes formas:

### Opción 1: Ver ejemplo de JSON chart con datos inline

```bash
npm start
# Abre: http://localhost:3001/#start=test/init/charts.json
```

Luego selecciona "JSON Chart with inline data" del catálogo.

### Opción 2: Probar el ejemplo de WMTS con timeseries

Carga el ejemplo WMTS desde la URL (el archivo está en `wwwroot/test/init/wmts-timeseries-example.json`):

```
http://localhost:3001/#clean&start={"initSources":[{"catalog":[{"type":"init","initUrl":"test/init/wmts-timeseries-example.json"}]}]}
```

### Opción 3: Agregar manualmente tu servicio WMTS

1. Abre http://localhost:3001/
2. Click en "Add data"
3. En "My Data", pega la URL: `https://data.dev-wins.com/xcube/wmts/1.0.0/WMTSCapabilities.xml`
4. Selecciona la capa que te interese
5. Click en el mapa para ver la información del feature

## Estructura de Archivos Modificados

```
lib/
  ReactViews/
    Custom/
      JsonChartCustomComponent.ts          (NUEVO)
      registerCustomComponentTypes.ts      (MODIFICADO)
    FeatureInfo/
      mustacheExpressions.ts               (MODIFICADO)
      FeatureInfoSection.tsx               (MODIFICADO)
wwwroot/
  test/
    init/
      wmts-timeseries-example.json         (NUEVO - archivo de ejemplo)
```

## Ejemplo Completo de Configuración

Aquí está un ejemplo completo basado en tu caso de uso:

```json
{
  "catalog": [
    {
      "name": "Ukraine Water Quality - LWQ300",
      "type": "wmts-group",
      "url": "https://data.dev-wins.com/xcube/wmts/1.0.0/WMTSCapabilities.xml",
      "members": [
        {
          "name": "Mean concentration of total suspended matter (with timeseries)",
          "type": "wmts",
          "layer": "ukraine_lwq300_pyramid/tsm_mean",
          "featureInfoRequest": {
            "url": "https://data.dev-wins.com/xcube/timeseries/{{layerPath}}",
            "method": "POST",
            "body": "{ \"type\": \"Point\", \"coordinates\": [{{longitude}}, {{latitude}}] }",
            "headers": {
              "Content-Type": "application/json"
            },
            "responseType": "json"
          },
          "featureInfoTemplate": {
            "name": "{{layerTitle}}",
            "template": "<h3>Time Series Data</h3><p><strong>Layer:</strong> {{layerTitle}}</p><p><strong>Location:</strong> {{terria.coords.latitude}}°N, {{terria.coords.longitude}}°E</p><p>Los datos de la serie temporal se han cargado. Puedes ver los valores detallados en la tabla a continuación.</p>{{terria.rawDataTable}}"
          }
        }
      ]
    }
  ]
}
```

## Notas Finales

- El componente está diseñado para ser flexible y manejar múltiples formatos JSON
- La conversión a CSV es automática y transparente
- Para casos de uso avanzados con POST requests, considera implementar un endpoint wrapper o contribuir con mejoras al componente

¡Espero que esto te ayude! Si necesitas más funcionalidad específica para POST requests, házmelo saber.
