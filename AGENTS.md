# Repository Guidelines

## Project Structure & Module Organization

Primary TypeScript modules live in `lib/`, grouped by responsibility (core models in `lib/Core`, catalog logic in `lib/Models`, UI in `lib/ReactViews`). Build tooling and webpack configs sit under `buildprocess/`. Browser specs and utilities live in `test/`, while static assets and sample datasets are stored in `wwwroot/`. Architectural notes are captured in `architecture/`, and long-form developer docs in `doc/`.

## Build, Test, and Development Commands

Install dependencies with `yarn install`. Run `yarn gulp` for the default build pipeline used in CI (lint, compile, bundle). Target lint-only feedback via `yarn gulp lint`. Execute `yarn gulp test` to run the Karma + Jasmine suite; add `--watch` while iterating. Start the local Terria server with `yarn start` (proxy and static host on port 3002) or enable hot-module reloading via `yarn hot`. Generate Node-compatible artifacts with `yarn build-for-node`, and rebuild documentation using `yarn build-docs`.

## Coding Style & Naming Conventions

Follow the Cesium-derived style: four-space indentation, single-quoted strings, and explicit semicolons. Prefer TypeScript for new work and name files after their main export (e.g., `CatalogIndex.ts` or `StoryPanel.tsx`). React components and classes use PascalCase, helpers stay camelCase, and SCSS module names mirror their component. Run `yarn prettier-check` before committing; fix issues with `yarn prettier`.

## Testing Guidelines

Tests live in `test/` with filenames ending in `.spec.ts` or `.spec.tsx`. Use Jasmine expectations and Karma utilities for async flows, keeping coverage for new code paths. Add representative data under `wwwroot/test/` when introducing integration scenarios. Always run `yarn gulp test` locally, and exercise browser-specific paths if rendering or WebGL code changes.

## Commit & Pull Request Guidelines

Write imperative commit subjects (for example, `Add catalog diff helper`), optionally prefixed with a scope like `Refactor:` to match recent history. Each pull request must update `CHANGES.md`, pass `yarn gulp`, and include tests or docs for feature work. Link related GitHub issues, attach screenshots or GIFs for UI updates, and confirm the branch merges cleanly. Ensure the CLA is signed before requesting review.

## Documentation & Support Assets

Update `doc/` or architecture notes when changing APIs or workflows. Add catalog or storytelling samples to `wwwroot/` with descriptive filenames, and regenerate published docs with `yarn build-docs` if you introduce new public APIs or significant configuration options.
