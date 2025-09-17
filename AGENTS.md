# Repository Guidelines

This guide helps contributors work efficiently in this TerriaJS codebase. Prefer existing patterns and keep changes focused and well‑tested.

## Project Structure & Module Organization
- `lib/` TypeScript/JS source. Key areas: `Core/`, `Models/`, `ModelMixins/`, `Traits/`, `Map/`, `Table/`, `ReactViews/` (UI), `ViewModels/`, `Styled/`, `Sass/`, `ThirdParty/`.
- `test/` unit/ui specs (e.g., `Models/.../*Spec.ts`, `ReactViews/.../*Spec.tsx`).
- `wwwroot/` static assets and generated docs.
- `buildprocess/` webpack/karma/gulp configs and doc generators.
- `dist/` Node build output; `ts-out/` TS incremental output.

## Build, Test, and Development Commands
- Install: `yarn install` (Node >= 20).
- Lint + build (default): `gulp`.
- Dev server + watch: `gulp dev` (starts `terriajs-server` on `http://localhost:3002` and rebuilds on change).
- Watch rebuilds only: `gulp watch`.
- Build bundles: `gulp build` (debug) / `gulp release` (optimized).
- Run tests (Karma + Jasmine): `gulp test` (or `gulp test-firefox`).
- Format: `yarn prettier` (pre-commit runs `pretty-quick`).
- Node‑only model build: `yarn build-for-node` (outputs to `dist/`).
- Docs: `gulp docs` (requires Python `mkdocs` from `requirements.txt`).

## Coding Style & Naming Conventions
- Format with Prettier (2-space indent, no trailing commas). Do not hand‑tune style; run `yarn prettier`.
- Lint with ESLint (`gulp lint`). Fix all warnings/errors before submitting.
- Naming: React components PascalCase; functions/variables camelCase; Types/Interfaces PascalCase. Follow existing folder naming (e.g., `ReactViews/...`).
- Prefer TypeScript; colocate small component styles with components when consistent with neighbors.

## Testing Guidelines
- Frameworks: Karma + Jasmine + Testing Library.
- Place specs under `test/` using `*Spec.ts`/`*Spec.tsx` (`SpecHelpers.ts` available). Keep tests deterministic; avoid real network calls.
- Run `gulp test`; coverage reports are emitted (see `coverage/`).

## Commit & Pull Request Guidelines
- Use a feature branch; keep diffs minimal. Write imperative subjects (e.g., `fix(Map): resolve zoom glitch`).
- Update `CHANGES.md` for user‑visible changes. Link related issues.
- For UI changes, include before/after screenshots or a short video.
- Ensure `gulp` and `gulp test` pass locally; fix lint errors.
- Sign the CLA and provide a clear PR description (motivation, approach, risks, test notes).

## Agent‑Specific Notes
- Do not reformat unrelated lines/files. Touch only what you change.
- When adding APIs, update docs (`doc/`) and tests in the same PR.
- Large assets/secrets must not be committed; use configuration and environment variables where needed.
