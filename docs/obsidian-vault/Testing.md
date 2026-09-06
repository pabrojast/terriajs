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

### Cobertura de sesion CKAN

- `test/Models/CkanSessionSpec.ts` cubre `CkanSession` contra HTTP stubbeado: inercia sin `configParameters.ckanSession`, conservacion de la clave en `updateParameters`, anonimo sin cambios en el catalogo, alta de un unico grupo `ckan-private-catalog` con referencia `ckan-private-catalog-reference` y carga ansiosa, nonce estable para el mismo usuario, logout que elimina grupo, descendientes, huerfanos `__ckan_private_catalog__/*` y capas del workbench (y notifica en cada logout), cambio de usuario A -> B, dedupe contra un id pre-creado por share, convivencia con un miembro inyectado por `#start=`, whoami 500 (conserva el grupo y no llama a `raiseErrorToUser`) y 401 (anonimo), `handleUnauthorized`, respuestas obsoletas, payloads malformados, URLs no seguras de servidor y de config, `isSafeRelativePath`, `buildLoginHref`, `openLogin`/`openLogout`, throttle por foco, notificacion `shareRequiresLogin` y `dispose`.
- `test/Models/Catalog/CatalogReferences/CkanPrivateCatalogReferenceSpec.ts` cubre el registro en `CatalogMemberFactory`, la carga como `terria-reference` sin proxy, el mapeo de 401/403 a `TerriaError` con severidad `Error` y claves `ckanSession.errors.*` (mas la llamada a `handleUnauthorized`), el relanzado de un 500 sin cambios y el funcionamiento sin `terria.ckanSession`.
- `test/ReactViews/Map/Panels/CkanSessionPanel/CkanSessionPanelSpec.tsx` renderiza el panel con `createWithContexts` (`test/ReactViews/withContext.tsx`) y un `CkanSession` con `refresh` espiado: nada sin sesion, boton "checking" clicable, enlace de login con `came_from` y `target="_blank"` que marca `pendingLogin`, estado pendiente, `MobileMenuItem` como enlace o boton en movil, nombre y acciones autenticado, enlace de perfil y aviso de administrador, "Open my private datasets" (explorador visible y `activeTabIdInCategory`), reintento en error y limpieza de pestana y preview al desaparecer el grupo.
- `test/Models/TerriaSpec.ts` (`describe("terria start")`, bloque `ckanSession`) comprueba que `start()` no crea `terria.ckanSession` sin config y que con `parameters.ckanSession` lo crea, conserva la config y hace exactamente un whoami fuera del proxy.

### Patron `jasmine.Ajax` para HTTP

Los specs de sesion CKAN siguen el patron de `describe("terria start")` en `test/Models/TerriaSpec.ts`:

```ts
beforeEach(function () {
  terria = new Terria({ appBaseHref: "/", baseUrl: "./" });
  jasmine.Ajax.install();
  jasmine.Ajax.stubRequest(/.*/).andError({}); // todo falla por defecto
  jasmine.Ajax.stubRequest(/\/api\/terria\/user\/session/).andReturn({
    status: 200,
    contentType: "application/json",
    responseText: JSON.stringify({ authenticated: false })
  });
});

afterEach(function () {
  session.dispose();
  jasmine.Ajax.uninstall();
});
```

- `jasmine.Ajax.requests.filter(regex)` permite contar peticiones y comprobar que la URL no contiene `proxy/`.
- Un stub posterior sobre la misma URL sustituye al anterior; asi un mismo caso encadena login, logout y errores 401/500 re-stubbeando el whoami.
- `TerriaReferenceSpec.ts` no stubbea HTTP; no usarlo de precedente para specs que dependan de la red.
- i18n corre en `cimode` (`test/SpecMain.ts`), asi que `t()` devuelve la clave y los asserts comparan con `ckanSession.errors.sessionExpired`, `ckanSession.btnLogin`, etc.
- MobX corre con `enforceActions: "always"`: mutar `terria.ckanSession`, `status` o traits desde un spec requiere `runInAction`.
- Para el throttle por foco se usa `jasmine.clock().install()` con `mockDate(new Date(0))` y `tick(...)`, desinstalando el reloj al final del caso.

## Ejecucion manual en navegador

1. `yarn gulp`
2. `yarn start`
3. abrir `http://localhost:3002/SpecRunner.html`

## Riesgos o huecos

- El repo no documenta una matriz oficial de browsers de desarrollo local mas alla de los launchers instalados y el uso de Firefox en CI.
- **Pendiente por confirmar:** si existe un flujo oficial para tests headless en Chrome dentro del repo actual.
