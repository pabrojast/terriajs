# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## TerriaJS Overview

TerriaJS is a sophisticated geospatial data visualization platform built with TypeScript, React, and dual mapping engines (Cesium for 3D, Leaflet for 2D). It powers major applications like National Map, Digital Earth Australia, and NSW Spatial Digital Twin.

## Development Commands

### Essential Commands

```bash
# Start development server
npm start                 # Starts TerriaJS Server on port 3002
gulp dev                  # Start server + watch mode for hot reload

# Build and development
gulp build               # Production build
gulp watch               # Development build with file watching
npm run hot              # Webpack dev server with hot module replacement

# Code quality
gulp lint                # Run ESLint on lib/ and test/
npm run prettier         # Format code with Prettier
npm run prettier-check   # Check code formatting

# Testing
gulp test                # Run tests in local browsers
gulp test-firefox        # Run tests in headless Firefox
npm run build-for-node   # Compile TypeScript for Node.js

# Documentation
npm run build-docs       # Generate documentation
gulp docs                # Build complete documentation site
```

### Asset Management

```bash
gulp copy-cesium-assets  # Copy Cesium workers, assets, and third-party files
```

## Core Architecture

### State Management with MobX

TerriaJS uses MobX for reactive state management. The root application state is in `Terria.ts`:

- All model properties are observable using `@observable`
- Actions modify state using `@action`
- Computed properties derive state using `@computed`
- React components observe state changes via `observer()` wrapper

### Trait-Based Configuration System

Models use a powerful trait system for type-safe, observable configuration:

```typescript
// Define traits (configuration schema)
export class WebMapServiceCatalogItemTraits extends ModelTraits {
  @primitiveTrait({
    type: "string",
    name: "URL",
    description: "The base URL of the WMS server"
  })
  url?: string;

  @primitiveArrayTrait({
    type: "string",
    name: "Layers",
    description: "WMS layers to display"
  })
  layers?: string[];
}

// Models automatically get type-safe properties from traits
class WebMapServiceCatalogItem extends Model<WebMapServiceCatalogItemTraits> {
  // this.url and this.layers are automatically available and observable
}
```

### Mixin Composition Pattern

TerriaJS extensively uses mixins for reusable model behaviors:

```typescript
// Compose behaviors via mixins
class WebMapServiceCatalogItem extends UrlMixin(
  CatalogMemberMixin(
    GetCapabilitiesMixin(CreateModel(WebMapServiceCatalogItemTraits))
  )
) {
  // Implementation inherits all mixin functionality
}
```

Common mixins:

- `CatalogMemberMixin` - Core catalog functionality
- `MappableMixin` - Map display capabilities
- `UrlMixin` - URL handling and loading
- `GroupMixin` - Container functionality
- `AccessControlMixin` - Permission handling

### Plugin Registration System

New catalog items, groups, and functions are registered in `registerCatalogMembers.ts`:

```typescript
export default function registerCatalogMembers() {
  CatalogMemberFactory.register("wms", WebMapServiceCatalogItem);
  CatalogMemberFactory.register("geojson", GeoJsonCatalogItem);
  // ... etc
}
```

## Key Directory Structure

### `/lib/` - Core Library

- `Core/` - Low-level utilities, no UI dependencies
- `Models/` - Business logic, data models, catalog system
  - `Terria.ts` - Root application state
  - `Catalog/` - Data source plugins and catalog management
  - `Definition/` - Core model system and traits
- `ModelMixins/` - Reusable model behaviors
- `Traits/` - Type-safe configuration system
- `ReactViews/` - React UI components
- `ReactViewModels/` - UI-related state management
- `Map/` - Mapping abstractions (Cesium/Leaflet)
- `Charts/` - D3-based charting with Visx components
- `Table/` - Tabular data handling and styling

### `/buildprocess/` - Build Configuration

- Webpack configurations for different environments
- Karma test configurations for multiple browsers
- TypeScript compilation and type checking setup

### `/test/` - Testing

- Jasmine-based unit tests mirroring `/lib/` structure
- React component tests using Testing Library
- Multiple browser testing via Karma

## Testing Framework

### Running Tests

```bash
gulp test           # Auto-detect local browsers
gulp test-firefox   # Headless Firefox for CI
```

### Test Structure

- **Framework**: Jasmine with Karma test runner
- **React Testing**: `@testing-library/react` and `@testing-library/jasmine-dom`
- **Coverage**: Istanbul coverage reporting
- **Browsers**: Chrome, Firefox, Safari, Edge via Karma launchers

## Development Patterns

### Model Creation

1. Define traits extending `ModelTraits`
2. Use trait decorators: `@primitiveTrait`, `@objectTrait`, `@primitiveArrayTrait`
3. Create model class extending `CreateModel(YourTraits)` or applying mixins
4. Register in `CatalogMemberFactory` if it's a catalog member

### React Component Development

- Use `observer()` from `mobx-react` to observe state changes
- Access Terria instance via `useViewState()` hook or ViewState context
- Follow existing component patterns in `/ReactViews/`
- Use CSS Modules for styling (`.scss` files with generated `.d.ts`)

### Adding New Data Sources

1. Create traits in `/Traits/TraitsClasses/`
2. Implement catalog item in `/Models/Catalog/CatalogItems/`
3. Apply appropriate mixins (usually includes `CatalogMemberMixin`, `UrlMixin`, `MappableMixin`)
4. Register in `registerCatalogMembers.ts`
5. Add tests in `/test/Models/Catalog/CatalogItems/`

## Build System Details

- **TypeScript**: Target ES2019, compiled with Babel to ES5
- **Webpack**: Module bundling with hot reload support
- **Cesium Integration**: Automatic asset copying from `terriajs-cesium` package
- **CSS**: Sass with CSS Modules, transitioning to styled-components
- **Code Quality**: ESLint + Prettier with Husky pre-commit hooks

## Common Development Tasks

### Adding Internationalization

1. Add strings to `/lib/Language/en/` JSON files
2. Use `i18next.t("namespace:key")` in code
3. Wrap React components with `withTranslation()` or use `useTranslation()` hook

### Creating Custom UI Components

1. Place in appropriate `/ReactViews/` subdirectory
2. Use existing design system from `/Styled/`
3. Follow naming conventions and component patterns
4. Add corresponding Sass/CSS Module files if needed

### Debugging

- Use browser DevTools with source maps enabled
- MobX state can be inspected with MobX DevTools browser extension
- Cesium debugging available through `window.CESIUM_BASE_URL`
