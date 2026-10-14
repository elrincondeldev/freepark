# Parking Vision — web

React 18 + TypeScript + Tailwind v4 + Framer Motion + Zustand, built with Vite.
The code follows **[Feature-Sliced Design](https://feature-sliced.design)** (FSD).

```bash
npm run dev        # Vite on :5173 (proxies /api and /ws to :4000)
npm test           # Vitest (includes the architecture test)
npm run lint       # ESLint + Prettier check
npm run build      # type-check + production build
```

## Layers

Each layer may import **only from layers below it**. Slices on the same layer never import
each other, and other code reaches a slice **only through its `index.ts`** (public API).
`src/test/architecture.test.ts` enforces all of this.

```
app       → pages → widgets → features → entities → shared
```

| Layer | What lives here | Slices |
|---|---|---|
| `app/` | Root component, global styles, app-wide runtime (socket + alerts) | — |
| `pages/` | Route-level screens composed from widgets | `dashboard` |
| `widgets/` | Self-contained UI blocks combining features and entities | `app-header`, `camera-grid`, `camera-focus` |
| `features/` | One user interaction or app capability each | `add-camera`, `remove-camera`, `rename-camera`, `toggle-camera-alerts`, `toggle-alert-sound`, `manage-views`, `edit-zones`, `live-updates`, `availability-alerts` |
| `entities/` | Business objects: data, API, state, and how to display them | `camera`, `feed`, `view`, `zone` |
| `shared/` | Domain-free building blocks | segments `api`, `config`, `lib`, `ui` |

Inside a slice, code is grouped by **segment**: `ui/` (components), `model/` (state,
hooks, business rules), `api/` (requests), `lib/` (pure helpers).

### Entities

- **camera**: the watched-camera list persisted in `localStorage` (`useCameraStore`),
  which camera/panel is focused (`useCameraSelection`), id/URL parsing, `probeCamera`.
- **feed**: the live stream per camera. Server message types, `useFeedStore`, display
  status, `useDisplayedAnalysis` (keeps overlays tied to the frame on screen), and the UI
  to show it: `FeedViewport`, `ParkingOverlay`, `FreeSpacesChip`, `FeedStatusBadge`.
- **view**: saved camera viewpoints (`viewApi`).
- **zone**: curb zones (`zoneApi`) and band geometry (`bandPolygon`).

### Conventions

- **Imports:** use the `@/` alias across slices (`@/entities/feed`, `@/shared/ui`) and
  relative paths inside a slice.
- **Talking upward:** features and entities never call higher layers directly. Widgets
  wire them together through props and callbacks, e.g. `ViewManager`'s `onEditZones`.
- **Shared state:**
  - Zustand stores live in `entities/*/model`.
  - Feature-local state stays in hooks or reducers. For example, `edit-zones` keeps its
    draft in `zoneDraftReducer`, which is pure and unit-tested.
- **Background behaviour:** live updates and availability alerts are hooks mounted once
  in `app/AppRuntime.tsx`. Availability detection *subscribes* to the feed store rather
  than being built into it.
- **UI primitives:** `Button`, `IconButton`, `Switch`, `Slider`, `TextField` and the
  toast system live in `shared/ui`. Compose classes with `cn()`.
- **Tests:** keep them next to the code they test. Test helpers (`src/test/`) may be
  imported only by tests.

### Adding code

1. **A new user action** (e.g. "share a camera"): create
   `features/share-camera/{ui,model}/…` with an `index.ts`, then use it from a widget or page.
2. **A new business object**: create a new `entities/<name>` slice.
3. **Something two features need:** move it down to `entities` or `shared`. Never import
   one feature from another.
