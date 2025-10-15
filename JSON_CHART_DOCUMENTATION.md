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

## Configuración para WMTS con POST Requests

Para tu caso específico con la API de xcube que requiere POST requests, aquí está la configuración recomendada:

### Opción 1: Usando featureInfoRequest (Recomendado para visualización de datos)

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
    "name": "{{layerTitle}} - Timeseries",
    "template": "<h3>Series Temporal - {{layerTitle}}</h3><p><strong>Ubicación:</strong> Lat: {{terria.coords.latitude}}, Lon: {{terria.coords.longitude}}</p><div>Los datos se muestran a continuación. Nota: actualmente los datos JSON de POST requests se muestran en formato tabla. Para gráficos, ver Opción 2.</div>"
  }
}
```

### Opción 2: Crear un endpoint GET wrapper (Para gráficos interactivos)

Si puedes crear un endpoint GET que envuelva tu API POST, podrías usarlo así:

```json
{
  "type": "wmts",
  "url": "https://data.dev-wins.com/xcube/wmts/1.0.0/WMTSCapabilities.xml",
  "layer": "ukraine_lwq300_pyramid/tsm_mean",
  "featureInfoTemplate": {
    "name": "{{layerTitle}} - Timeseries",
    "template": "<h3>Series Temporal</h3><json-chart title='{{layerTitle}}' src='https://tu-api-wrapper.com/timeseries?lat={{terria.coords.latitude}}&lon={{terria.coords.longitude}}&layer={{layerPath}}' x-column='time' y-columns='mean'></json-chart>"
  }
}
```

## Próximos Pasos / Limitaciones Actuales

### Limitación: POST Requests en json-chart

Actualmente, el componente `json-chart` hereda de `CsvChartCustomComponent`, que usa `CsvCatalogItem` para cargar datos. Este item solo soporta peticiones GET a través del atributo `url`.

### Soluciones Posibles:

1. **Crear un API Gateway/Proxy** que convierta tus POST requests a GET requests

   - Ventaja: Funciona inmediatamente con la implementación actual
   - Desventaja: Requiere infraestructura adicional

2. **Extender JsonChartCustomComponent para soportar POST** (trabajo futuro)

   - Añadir atributos: `method`, `body-template`, `headers`
   - Modificar la lógica de carga para hacer peticiones POST
   - Ejemplo de uso futuro:
     ```html
     <json-chart
       title="Time Series"
       src="https://api.com/timeseries"
       method="POST"
       body-template='{"type": "Point", "coordinates": [{{terria.coords.longitude}}, {{terria.coords.latitude}}]}'
       headers='{"Content-Type": "application/json"}'
       x-column="time"
       y-columns="mean"
     ></json-chart>
     ```

3. **Usar featureInfoContext** (trabajo futuro)
   - Implementar una función `featureInfoContext` en WebMapTileServiceCatalogItem
   - Proporcionar los datos JSON directamente al contexto del template
   - Pasar los datos al componente json-chart como inline data

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

Puedes probar la implementación usando el archivo de ejemplo:

```bash
npm start
# Luego abre en el navegador:
# http://localhost:3001/#start=test/init/wmts-timeseries-example.json
```

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
