# AGENTS.md

## Alcance

- Este repositorio es `terriajs`.
- La documentacion para humanos vive en `docs/obsidian-vault/`. Empezar por `docs/obsidian-vault/Index.md`.
- `CLAUDE.md` y `AGENTS.md` fijan comportamiento operativo; no deben duplicar la vault.

## Forma de trabajo

- Orden recomendado: explorar -> planificar -> implementar -> verificar -> documentar.
- Hacer cambios minimos y focalizados. Evitar refactors laterales no pedidos.
- No inventar comportamiento, comandos ni flujos. Si falta evidencia, documentarlo segun `CLAUDE.md` y `docs/obsidian-vault/Guia de Mantenimiento.md`.
- Cuando cambien arquitectura, comandos, configuracion, variables de entorno, testing o deployment, actualizar la nota correspondiente en `docs/obsidian-vault/`.
- Mantener consistencia con `CLAUDE.md`.

## Dudas y supuestos

- Registrar dudas nuevas en `docs/obsidian-vault/Backlog Documentacion.md`.
- Para supuestos, vacios e inferencias, seguir las convenciones de `CLAUDE.md` y `docs/obsidian-vault/Guia de Mantenimiento.md`.

## Checklist antes de cerrar una tarea

- Cambio acotado al objetivo.
- Verificacion ejecutada o limitacion explicitada.
- Vault actualizada si el cambio afecta comportamiento relevante.
- `CLAUDE.md` y `AGENTS.md` siguen coherentes con la vault.
