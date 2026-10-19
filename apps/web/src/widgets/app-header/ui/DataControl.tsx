import { useRef, type ChangeEvent } from 'react'
import { normalizeCameraId, useCameraStore, type WatchedCamera } from '@/entities/camera'
import { exportBrowserSnapshot, importBrowserSnapshot } from '@/shared/api'
import { toast } from '@/shared/ui'

export function DataControl() {
  const input = useRef<HTMLInputElement>(null)

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const imported = await importBrowserSnapshot(file)
      if (validWatchlist(imported.watchlist)) {
        useCameraStore.setState({
          cameras: imported.watchlist.cameras,
          settings: imported.watchlist.settings,
        })
      } else if (imported.watchlist === undefined) {
        for (const id of [...new Set(imported.cameraIds)].slice(0, 24)) {
          if (normalizeCameraId(id) === id) useCameraStore.getState().addCamera(id)
        }
      }
      window.location.reload()
    } catch (error) {
      toast({ title: 'Import failed', body: String(error) })
    } finally {
      event.target.value = ''
    }
  }

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-full border border-line px-3.5 py-1.5 text-sm hover:bg-surface-2">
        Data
      </summary>
      <div className="absolute right-0 z-30 mt-2 flex w-44 flex-col gap-1 rounded-xl border border-line bg-surface p-2 shadow-lg">
        <button
          className="rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
          type="button"
          onClick={() => input.current?.click()}
        >
          Import data…
        </button>
        <button
          className="rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
          type="button"
          onClick={() =>
            void exportBrowserSnapshot({
              cameras: useCameraStore.getState().cameras,
              settings: useCameraStore.getState().settings,
            }).catch((error) => toast({ title: 'Export failed', body: String(error) }))
          }
        >
          Export data
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Import data file"
        onChange={(event) => void importFile(event)}
      />
    </details>
  )
}

function validWatchlist(
  value: unknown,
): value is { cameras: WatchedCamera[]; settings: { sound: boolean } } {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (!Array.isArray(data.cameras) || data.cameras.length > 24) return false
  if (!data.settings || typeof data.settings !== 'object') return false
  if (typeof (data.settings as Record<string, unknown>).sound !== 'boolean') return false
  const ids = new Set<string>()
  for (const camera of data.cameras) {
    if (!camera || typeof camera !== 'object') return false
    const item = camera as Record<string, unknown>
    if (
      typeof item.id !== 'string' ||
      normalizeCameraId(item.id) !== item.id ||
      typeof item.label !== 'string' ||
      item.label.length > 80 ||
      typeof item.notify !== 'boolean' ||
      ids.has(item.id)
    )
      return false
    ids.add(item.id)
  }
  return true
}
