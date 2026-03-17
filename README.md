# Object Builder

A desktop application for editing and managing graphical objects (things, sprites, items) for [OpenTibia](https://github.com/opentibia) game servers. Built with Electron, React, and TypeScript.

Object Builder allows you to open, inspect, edit, and compile Tibia client data files (`.dat`, `.spr`) as well as server-side item definitions (`.otb`, `items.xml`). It also supports the `.obd` (Object Builder Data) format for individual object import/export.

## Features

- **Full DAT/SPR editing** &mdash; Read and write client metadata (`.dat`) and sprite (`.spr`) files for Tibia client versions 7.10 through 13.10 (106 versions)
- **Server items support** &mdash; Load, edit, and save `items.otb` and `items.xml` for 8 TFS server versions (0.3.6 &ndash; 1.6)
- **OBD import/export** &mdash; Import and export individual objects in OBD format (v1/v2/v3) with LZMA compression
- **Sprite rendering** &mdash; Real-time Canvas 2D rendering with outfit colorization (HSI palette), multi-tile composition, zoom, and pan
- **Animation editor** &mdash; Standalone tool for creating sprite sheet animations with grid overlay, frame timeline, and playback controls
- **Object viewer** &mdash; Preview objects with direction controls, frame groups, and playback from loaded project or OBD files
- **Sprite slicer** &mdash; Import sprites from images with configurable grid, rotation, and flip operations
- **Asset store** &mdash; Browse and import objects from the [Open Assets](https://github.com/ottools/open-assets) remote repository
- **Optimization tools** &mdash; Remove duplicate/unused sprites, normalize frame durations, convert frame groups
- **Look type generator** &mdash; Generate XML snippets for outfit/item look types with live preview
- **Clipboard system** &mdash; Copy/paste objects, properties, or patterns between things with undo support
- **Undo/redo** &mdash; Full undo/redo history for all editing operations
- **Bulk editing** &mdash; Modify properties across multiple objects at once
- **Find/search** &mdash; Search things by name, properties, or patterns; find unused/empty sprites
- **Auto-save & recovery** &mdash; Crash recovery, automatic backup before compile, unsaved changes confirmation
- **Internationalization** &mdash; English, Spanish, and Portuguese (BR) translations
- **Light/Dark theme** &mdash; System-aware theme with manual override
- **Cross-platform** &mdash; Windows, macOS (Intel + Apple Silicon), and Linux

## Exportar effects por IDs

No diálogo de exportação de objetos (`Export`), você pode ativar a opção:

- `Exportar IDs específicos (effects)`
- `Lista de IDs`

A lista aceita:

- vírgula, espaço e quebra de linha como separadores
- intervalos no formato `a-b`

Exemplos válidos:

- `1,2,3`
- `1, 5, 10-15`
- `1 2 3` (com ou sem quebras de linha)

Com o filtro ativo:

- ele é aplicado somente na categoria `effects`
- lista vazia exporta todos os effects da categoria
- IDs inexistentes geram aviso no log e a exportação continua com os IDs encontrados
- arquivos exportados são reindexados de forma contínua (`1..N`) no nome do arquivo

Além dos arquivos exportados, o Object Builder gera:

- `effects-id-map.json`

Formato do mapa:

```json
{
  "oldToNew": { "123": 1, "456": 2 },
  "newToOld": { "1": 123, "2": 456 }
}
```

Quando o filtro não está ativo, o comportamento de exportação permanece o mesmo.

## Download

Pre-built installers are available for Windows, macOS, and Linux on the [latest release](https://github.com/valerioleite/electron-object-builder/releases/latest) page.

| Platform | Format | Architecture |
|---|---|---|
| Windows | `.exe` (NSIS installer) | x64 |
| Windows | `.exe` (portable) | x64 |
| macOS | `.dmg` | x64, arm64 (Apple Silicon) |
| Linux | `.AppImage` | x64 |
| Linux | `.deb` | x64 |

## Requirements

- [Node.js](https://nodejs.org/) 18 or later
- npm 9 or later

## Installation

```bash
# Clone the repository
git clone https://github.com/valerioleite/electron-object-builder.git
cd electron-object-builder

# Install dependencies
npm install
```

## Development

```bash
# Start in development mode with hot reload
npm run dev
```

The application will open with the renderer connected to Vite's dev server for hot module replacement.

## Building

```bash
# Production build (compile only)
npm run build

# Package for the current platform (installer)
npm run dist

# Platform-specific packaging
npm run dist:win     # Windows (NSIS installer + portable)
npm run dist:mac     # macOS (DMG, x64 + arm64)
npm run dist:linux   # Linux (AppImage + deb)
```

Packaged output goes to the `dist/` directory.

## Testing

```bash
# Unit and component tests (Vitest)
npm run test

# Watch mode
npm run test:watch

# End-to-end tests (Playwright, requires build)
npm run test:e2e

# Build + E2E in one step
npm run test:e2e:build

# Type checking
npm run typecheck

# Lint
npm run lint

# Format check
npm run format:check
```

The test suite includes **1925 unit/component tests** across 43 files and **28 E2E tests** across 6 files.

## Project Structure

```
electron/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # App entry point, window creation
│   │   ├── ipc-handlers.ts # IPC channel registration
│   │   └── services/      # File I/O, project lifecycle, settings, menu, logging, recovery
│   ├── preload/
│   │   ├── index.ts       # Secure contextBridge API
│   │   └── index.d.ts     # Type declarations for renderer
│   ├── renderer/
│   │   └── src/
│   │       ├── components/ # Reusable UI components (Modal, SplitPane, Toolbar, etc.)
│   │       ├── features/   # Feature modules (editor, sprites, things, dialogs, tools)
│   │       ├── services/   # Binary format readers/writers (DAT, SPR, OBD, OTB, XML, OTFI)
│   │       ├── stores/     # Zustand state management (app, editor, sprite, animation)
│   │       ├── workers/    # Web Workers for heavy operations (DAT, SPR, OBD parsing)
│   │       ├── types/      # Core TypeScript type definitions
│   │       ├── i18n/       # Internationalization (3 languages)
│   │       ├── hooks/      # Custom React hooks
│   │       ├── providers/  # React context providers (theme)
│   │       ├── utils/      # Utilities (LRU cache, debounce)
│   │       └── data/       # Static data (versions, sprite dimensions, attribute servers)
│   └── shared/             # Types and constants shared between processes
├── config/attributes/      # TFS server attribute definition XMLs (reference)
├── build/                  # App icons and file type icons
├── e2e/                    # Playwright E2E tests
└── package.json
```

## Supported File Formats

| Format | Extension | Description |
|---|---|---|
| DAT | `.dat` | Client metadata (thing types with properties and sprite references) |
| SPR | `.spr` | Client sprites (RLE-compressed pixel data, standard and extended) |
| OTB | `.otb` | Server items (binary tree format with flags and attributes) |
| XML | `.xml` | Server items (items.xml with nested attributes) |
| OBD | `.obd` | Object Builder Data (single object with sprites, LZMA-compressed) |
| OTFI | `.otfi` | OpenTibia File Interface (OTML format, feature flags and file references) |

## Supported Client Versions

106 client versions from **7.10** to **13.10**, including:

- Standard sprites (up to v9.54)
- Extended sprites with 32-bit IDs (v9.60+)
- Improved animations with per-frame durations (v10.50+)
- Frame groups for outfit idle/walking states (v10.57+)

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron 40 |
| UI | React 19 |
| Language | TypeScript 5.9 |
| Build | Vite 7 (via electron-vite 5) |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| i18n | i18next + react-i18next |
| Icons | react-icons (Material Design) |
| Unit Tests | Vitest + React Testing Library |
| E2E Tests | Playwright |
| Packaging | electron-builder |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Development Guide

See [DEVELOPMENT.md](DEVELOPMENT.md) for in-depth information about the architecture, patterns, and conventions used in this codebase.

## License

MIT License. See [LICENSE](LICENSE) for details.

## Credits

Based on the [original Object Builder](https://github.com/ottools/ObjectBuilder) created by the OpenTibia Tools community, and the [extended fork](https://github.com/punkice3407/ObjectBuilder) by punkice3407 which served as the reference for this migration.

Migrated from Adobe AIR/ActionScript 3 to Electron/React/TypeScript by [Valério Leite](https://github.com/valerioleite).
