# Implementación del Credit Personalizado para Sentinel-2 Cloudless

## Descripción

Se ha implementado un componente React que muestra el credit/atribución del basemap Sentinel-2 cloudless en una posición especial: alineado con la barra inferior pero posicionado arriba de ella, con un fondo similar al de la barra inferior.

## Archivos Modificados

### 1. SentinelCreditOverlay.tsx

**Ubicación**: `lib/ReactViews/Map/BottomBar/Credits/SentinelCreditOverlay.tsx`

Nuevo componente que:

- Detecta automáticamente cuando el basemap activo es Sentinel-2 cloudless
- Muestra la atribución con el estilo visual especificado
- Se posiciona 30px arriba de la barra inferior
- Usa el mismo fondo y filtros que la barra inferior (`transparentDark` + `backdrop-filter`)

**Métodos de detección del basemap**:

- `uniqueId === "s2cloudless-2024"`
- `layers === "s2cloudless-2024"`
- `id === "s2cloudless-2024"`
- Nombre contiene "sentinel-2 cloudless" (insensible a mayúsculas)
- URL de EOX con layers que contienen "s2cloudless"

### 2. MapColumn.tsx

**Ubicación**: `lib/ReactViews/Map/MapColumn.tsx`

Modificaciones:

- Importación del componente `SentinelCreditOverlay`
- Integración del componente dentro del contenedor del mapa
- Posicionamiento sobre el viewer pero debajo de otros elementos de UI

## Configuración del Basemap en TerriaMap

Para que el componente funcione, el basemap debe estar configurado en el archivo de inicialización de TerriaMap con esta estructura:

```json
{
  "baseMaps": {
    "items": [
      {
        "item": {
          "name": "Sentinel-2 cloudless 2024",
          "type": "wms",
          "url": "https://tiles.maps.eox.at/wms",
          "layers": "s2cloudless-2024",
          "id": "s2cloudless-2024",
          "attribution": "Sentinel-2 cloudless - <a href=\"https://s2maps.eu\">s2maps.eu</a> by <a href=\"https://eox.at\">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2024)"
        },
        "image": "images/basemaps/Sentinel-2-cloudless-2024.PNG"
      }
    ]
  }
}
```

## Características del Componente

### Estilo Visual

- **Posición**: Absoluta, 30px arriba de la barra inferior
- **Fondo**: `transparentDark` con `backdrop-filter: blur()`
- **Tipografía**: 0.7rem, color `textLight`
- **Enlaces**: Subrayados, mismo color que el texto
- **Z-index**: 100 para asegurar visibilidad

### Comportamiento

- **Reactivo**: Observa cambios en el basemap activo usando MobX
- **Detección automática**: No requiere configuración manual
- **Invisible por defecto**: Solo se muestra cuando el basemap activo es Sentinel-2 cloudless
- **Enlaces funcionales**: Los enlaces en la atribución mantienen su funcionalidad

### Compatibilidad

- Compatible con ambos viewers (Cesium y Leaflet)
- Funciona con diferentes tipos de imagery providers
- Responsive y se adapta al ancho completo del mapa

## Uso

Una vez deployado TerriaJS con estos cambios, el componente funcionará automáticamente cuando:

1. El basemap activo sea identificado como Sentinel-2 cloudless
2. El basemap tenga una atribución definida
3. El usuario esté visualizando el mapa (no en modo "none")

No se requiere configuración adicional en el lado del cliente.

## Archivo de Prueba

Se creó un archivo de configuración de prueba en:
`wwwroot/test/init/sentinel-basemap-test.json`

Este archivo puede ser usado para probar la funcionalidad cargando la URL:
`http://localhost:3001/#start=test/init/sentinel-basemap-test.json`
