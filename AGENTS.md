# Repository Guidelines

## Project Structure & Module Organization
- `lib/` — Source (TypeScript/JS, React). UI in `lib/ReactViews`, map in `lib/Map`, core in `lib/Core`.
- `test/` — Unit/integration specs. Test assets under `wwwroot/test/`.
- `wwwroot/` — Static assets and generated bundles (e.g., copied Cesium assets).
- `buildprocess/` — Webpack, Karma, Gulp, and CI utilities.
- `doc/` — User/developer docs; ADRs under `architecture/`.

## Build, Test, and Development Commands
- `yarn` — Install deps and postinstall (copies Cesium assets).
- `gulp dev` — Start `terriajs-server` on `:3002` and watch/build specs.
- `yarn start` — Run `terriajs-server` only.
- `gulp build` | `gulp release` — Build specs/dev or production bundles.
- `gulp test` — Run Karma/Jasmine tests locally.
- `gulp lint` — ESLint over `lib/` and `test/`.
- `yarn prettier` | `yarn prettier-check` — Format/check formatting.
- `yarn build-for-node` — Type-check/emit for Node targets.

## Coding Style & Naming Conventions
- Indentation: 2 spaces (`.editorconfig`), Prettier enforces formatting.
- Linting: ESLint (`.eslintrc.js`) with TypeScript, React, and hooks rules; no unused vars (prefix `_` to intentionally ignore).
- TypeScript first (`.ts`/`.tsx`); prefer `lodash-es` over `lodash`. React components PascalCase; hooks/use- prefixed.
- Avoid direct `console` for analytics; prefer existing utilities in `lib/Core`.

## Testing Guidelines
- Frameworks: Karma + Jasmine; React Testing Library available.
- Naming: place specs under `test/**` matching `*Spec.ts` or `*Spec.tsx` (see `buildprocess/webpack.config.make.js`).
- Run: `gulp test`. For Firefox: `gulp test-firefox`.
- Include fixtures in `wwwroot/test/` when needed; keep tests deterministic.

## Commit & Pull Request Guidelines
- Use imperative, descriptive commits (e.g., "Fix: handle empty dates"). Group scope where helpful (Feat/Fix/Refactor).
- Requirements: green tests, `gulp lint` clean, formatted code, and update `CHANGES.md` (add entry under the next release).
- PRs: link issues, describe changes and impact; add screenshots/GIFs for UI changes. Branch from `master`; do not push to `master` directly. Sign the CLA.

## Security & Environment
- Node `>=20` (see `.nvmrc`). Use `yarn@1`. Avoid adding new runtime deps without discussion.
- Secrets: never commit credentials. Configuration lives in app configs, not in `lib/`.

