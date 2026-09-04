# Testing

Ver tambien: [[Comandos Utiles]], [[Setup Local]], [[Troubleshooting]]

## Stack de testing

- Framework: Jasmine
- Runner: Karma
- React testing: `@testing-library/react` y `@testing-library/jasmine-dom`
- Cobertura: `coverage-istanbul`

## Bootstrap observado

Archivo clave: `test/SpecMain.ts`

- inicializa prerequisitos del navegador
- registra catalog members
- configura MobX para tests
- inicializa i18next en modo `cimode`
- agrega matchers de `jasmine-dom`

## Comandos

```bash
yarn gulp test
yarn gulp test-firefox
```

## Como corre el suite

- Webpack empaqueta specs a `wwwroot/build/TerriaJS-specs.js`
- Karma sirve archivos desde `wwwroot/`
- `karma-local.conf.js` detecta browsers locales y genera cobertura
- `karma-firefox.conf.js` fuerza Firefox

## Estructura de tests

- Los tests viven en `test/`
- La estructura replica bastante bien `lib/`
- Hay fixtures y datos en `wwwroot/test/`

### Cobertura de styling COG

- `test/Models/Catalog/CatalogItems/CogRenderStyleSpec.ts` cubre resolucion de dominio y paleta, inversion, clamps, rangos inclusivos, validacion y `nativeDomain` cuando hay un `domain` configurado.
- `test/Models/Catalog/CatalogItems/CogLegendStratumSpec.ts` cubre leyendas continuas (ticks min/max del domain), discretas, override de bins y omision multibanda.
- `CogCatalogItemSpec.ts` y `CogTimeSeriesCatalogItemSpec.ts` cubren la integracion tras la carga, incluida la leyenda automatica, un dominio de share fijo entre fechas y la precedencia de leyendas explicitas.
- `CogStylingWorkflowSpec.ts` cubre la edicion repetida de estilos, la seleccion explicita de paleta, los defaults visibles del workflow y el auto-fit de series.

## Ejecucion manual en navegador

1. `yarn gulp`
2. `yarn start`
3. abrir `http://localhost:3002/SpecRunner.html`

## Riesgos o huecos

- El repo no documenta una matriz oficial de browsers de desarrollo local mas alla de los launchers instalados y el uso de Firefox en CI.
- **Pendiente por confirmar:** si existe un flujo oficial para tests headless en Chrome dentro del repo actual.
