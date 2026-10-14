/**
 * Feature-Sliced Design guardrails. Fails when code:
 *  1. imports from a higher layer (app > pages > widgets > features > entities > shared);
 *  2. imports another slice of the same layer;
 *  3. reaches into another slice instead of using its public API (`index.ts`);
 *  4. uses a relative path that escapes its own slice / shared segment.
 * Every slice must expose an `index.ts`.
 */

const LAYERS = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'] as const
type Layer = (typeof LAYERS)[number]
const SLICED: Layer[] = ['entities', 'features', 'widgets', 'pages']
const SHARED_SEGMENTS = ['api', 'config', 'lib', 'ui']

const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

interface Location {
  layer: Layer
  /** slice for sliced layers, segment for shared, '' for app */
  unit: string
  root: string
}

function locate(path: string): Location | null {
  const [, src, layer, unit] = path.split('/')
  if (src !== 'src' || !LAYERS.includes(layer as Layer)) return null
  if (layer === 'app') return { layer: 'app', unit: '', root: '/src/app' }
  return { layer: layer as Layer, unit, root: `/src/${layer}/${unit}` }
}

const rank = (layer: Layer) => LAYERS.indexOf(layer)

function resolveRelative(from: string, spec: string): string {
  const parts = from.split('/').slice(0, -1)
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

function importsOf(code: string): string[] {
  return [...code.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2])
}

function violations(path: string, code: string): string[] {
  const from = locate(path)
  if (!from) return []
  const isTest = /\.test\.tsx?$/.test(path)
  const problems: string[] = []

  for (const spec of importsOf(code)) {
    if (spec.startsWith('.')) {
      const target = resolveRelative(path, spec)
      if (!(target === from.root || target.startsWith(from.root + '/'))) {
        problems.push(`${spec}: relative import escapes ${from.root} — use the public API`)
      }
      continue
    }
    if (!spec.startsWith('@/')) continue // packages

    const [, layer, unit, ...rest] = spec.split('/')
    if (layer === 'test') {
      if (!isTest) problems.push(`${spec}: test utilities are only for tests`)
      continue
    }
    if (!LAYERS.includes(layer as Layer)) {
      problems.push(`${spec}: unknown layer`)
      continue
    }
    const to = layer as Layer

    if (rank(to) > rank(from.layer)) {
      problems.push(`${spec}: ${from.layer} must not import from higher layer ${to}`)
    } else if (to === from.layer && to !== 'shared' && to !== 'app') {
      problems.push(
        `${spec}: ${from.layer} slices must not import each other (or use relative paths inside a slice)`,
      )
    } else if (to === 'shared' && from.layer === 'shared') {
      problems.push(`${spec}: inside shared use relative imports`)
    }

    if (SLICED.includes(to) && rest.length > 0) {
      problems.push(`${spec}: deep import — use '@/${to}/${unit}' (the slice's index.ts)`)
    }
    if (to === 'shared' && (!SHARED_SEGMENTS.includes(unit) || rest.length > 0)) {
      problems.push(
        `${spec}: import shared through its segments: ${SHARED_SEGMENTS.map((s) => `@/shared/${s}`).join(', ')}`,
      )
    }
  }
  return problems.map((p) => `${path}: ${p}`)
}

test('layers only import downwards, through public APIs', () => {
  expect(Object.keys(sources).filter((p) => locate(p)).length).toBeGreaterThan(60)
  const all = Object.entries(sources).flatMap(([path, code]) => violations(path, code))
  expect(all).toEqual([])
})

test('every slice and shared segment has a public index.ts', () => {
  const units = new Set(
    Object.keys(sources)
      .map(locate)
      .filter((l): l is Location => !!l && (SLICED.includes(l.layer) || l.layer === 'shared'))
      .map((l) => l.root),
  )
  const missing = [...units].filter(
    (root) => !(`${root}/index.ts` in sources) && !(`${root}/index.tsx` in sources),
  )
  expect(missing).toEqual([])
})

test('the guard catches violations', () => {
  const bad = [
    "import { CameraGrid } from '@/widgets/camera-grid'", // feature → widget (higher)
    "import { toggleAlerts } from '@/features/toggle-camera-alerts'", // feature → feature
    "import { useFeedStore } from '@/entities/feed/model/store'", // deep import
    "import { cn } from '@/shared/ui/cn'", // deep shared import
    "import { x } from '../../edit-zones/model/draft'", // escapes slice
  ].join('\n')
  expect(violations('/src/features/add-camera/ui/AddCameraForm.tsx', bad)).toHaveLength(5)
})
