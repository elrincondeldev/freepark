import { useState } from 'react'
import { CameraIcon, CheckIcon, PlusIcon, cn } from '@/shared/ui'
import type { CatalogCamera } from '../api/catalog'

export type TileState = 'idle' | 'adding' | 'watching'

/** One camera in the directory: live preview, name, distance and a one-tap add. */
export function CameraTile({
  camera,
  place,
  distance,
  state,
  error,
  onSelect,
}: {
  camera: CatalogCamera
  place?: string
  distance?: string
  state: TileState
  error?: string
  onSelect: () => void
}) {
  const [image, setImage] = useState<'loading' | 'ready' | 'failed'>('loading')
  const watching = state === 'watching'
  const adding = state === 'adding'

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onSelect}
        disabled={adding}
        aria-label={watching ? `${camera.name}, already watching — show it` : `Add ${camera.name}`}
        aria-describedby={error ? `tile-error-${camera.id}` : undefined}
        className={cn(
          'group block w-full overflow-hidden rounded-2xl border bg-surface text-left transition',
          'hover:-translate-y-0.5 hover:shadow-lg focus-visible:-translate-y-0.5',
          watching ? 'border-free/60' : 'border-line hover:border-accent/60',
          error && 'border-busy/60',
        )}
      >
        <div className="relative aspect-video overflow-hidden bg-surface-2">
          {image !== 'failed' && (
            <img
              src={camera.previewUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => setImage('ready')}
              onError={() => setImage('failed')}
              className={cn(
                'h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]',
                image === 'ready' ? 'opacity-100' : 'opacity-0',
              )}
            />
          )}
          {image === 'loading' && (
            <span className="absolute inset-0 overflow-hidden" aria-hidden>
              <span className="absolute inset-0 animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-ink/5 to-transparent" />
            </span>
          )}
          {image === 'failed' && (
            <span className="absolute inset-0 grid place-items-center text-center text-xs text-muted">
              <span className="flex flex-col items-center gap-1.5">
                <CameraIcon width={20} height={20} />
                No preview right now
              </span>
            </span>
          )}

          <span
            className={cn(
              'absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm transition',
              watching
                ? 'bg-free text-white'
                : adding
                  ? 'bg-ink text-bg'
                  : 'bg-surface/90 text-ink backdrop-blur group-hover:bg-ink group-hover:text-bg',
            )}
            aria-hidden
          >
            {watching ? (
              <>
                <CheckIcon width={12} height={12} strokeWidth={3} /> Watching
              </>
            ) : adding ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Adding…
              </>
            ) : (
              <>
                <PlusIcon width={12} height={12} strokeWidth={3} /> Add
              </>
            )}
          </span>
        </div>
        <div className="flex items-start justify-between gap-2 px-3 py-2.5">
          <span className="min-w-0">
            <span className="line-clamp-2 text-sm font-medium leading-snug">{camera.name}</span>
            {place && <span className="mt-0.5 block truncate text-xs text-muted">{place}</span>}
          </span>
          {distance && (
            <span className="mt-0.5 shrink-0 text-xs tabular-nums text-muted">{distance}</span>
          )}
        </div>
      </button>
      {error && (
        <p id={`tile-error-${camera.id}`} role="alert" className="mt-1.5 px-1 text-xs text-busy">
          {error}
        </p>
      )}
    </li>
  )
}
