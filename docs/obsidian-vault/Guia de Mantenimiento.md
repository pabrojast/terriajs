# Guia de Mantenimiento

Ver tambien: [[Index]], [[Backlog Documentacion]], [[README]]

## Objetivo

Mantener esta vault corta, verificable y util para onboarding rapido.

## Reglas de escritura

- Preferir actualizar una nota existente antes de crear otra nueva.
- Usar wikilinks `[[...]]` para conectar conceptos.
- No copiar grandes bloques de `doc/` o `architecture/`; resumir y enlazar.
- No inventar comportamiento.
- Marcar huecos como `Pendiente por confirmar`.
- Marcar deducciones como `Inferencia`.

## Cuando actualizar la vault

Actualizar la nota correspondiente cuando cambien:

- arquitectura o modulos
- comandos o tooling
- configuracion o `ConfigParameters`
- variables de entorno o CI/CD
- testing
- deployment

## Mapa rapido cambio -> nota

- build/scripts -> [[Comandos Utiles]]
- arquitectura/modelos/viewer -> [[Arquitectura]] y [[Modulos]]
- setup local -> [[Setup Local]]
- env vars/CI -> [[Variables de Entorno]] y [[Deployment]]
- tests -> [[Testing]]
- errores frecuentes -> [[Troubleshooting]]

## Checklist de mantenimiento

- La nota afectada refleja el comportamiento actual del repo.
- [[Index]] sigue apuntando a todo lo importante.
- Si hay una duda nueva, esta registrada en [[Backlog Documentacion]].
- `CLAUDE.md` y `AGENTS.md` siguen alineados con esta vault.
