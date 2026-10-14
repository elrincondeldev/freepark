import { useReducer, useState } from 'react'
import type { View } from '@/entities/view'
import type { Zone } from '@/entities/zone'
import { initialDraft, validateDraft, zoneDraftReducer } from '../model/draft'
import { useZones } from '../model/useZones'
import { ZoneCanvas } from './ZoneCanvas'
import { ZoneForm } from './ZoneForm'
import { ZoneList } from './ZoneList'

/** Draw and edit a view's approximate curb parking zones on its reference image. */
export function ZoneEditor({ view, onClose }: { view: View; onClose: () => void }) {
  const { zones, loadError, save, remove } = useZones(view.id)
  const [state, dispatch] = useReducer(zoneDraftReducer, initialDraft)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const select = (zone: Zone) => {
    setError(null)
    dispatch({ type: 'select', zone })
  }

  async function onSave() {
    if (state.selected === null) return
    const problem = validateDraft(state.draft)
    if (problem) return setError(problem)
    setSaving(true)
    const result = await save(state.selected, state.draft)
    setSaving(false)
    if (typeof result === 'string') setError(result)
    else select(result)
  }

  async function onDelete() {
    if (typeof state.selected !== 'number') return
    const problem = await remove(state.selected)
    if (problem) setError(problem)
    else dispatch({ type: 'cancel' })
  }

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <ZoneCanvas
          imageUrl={view.referenceUrl}
          imageAlt={`Reference image of ${view.name}`}
          zones={zones}
          state={state}
          dispatch={(action) => {
            if (action.type === 'addPoint') setError(null)
            dispatch(action)
          }}
          onSelectZone={select}
        />
        <p className="mt-2 text-xs text-muted">
          Zones are approximate: cars partly inside or outside the band still count. Draw them on
          the nearer part of the curb, where the AI sees cars best.
        </p>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Zones · {view.name}</h3>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            Done
          </button>
        </div>
        {loadError && <p className="text-sm text-busy">{loadError}</p>}
        {state.selected === null ? (
          <ZoneList
            zones={zones}
            onSelect={select}
            onNew={() => {
              setError(null)
              dispatch({ type: 'startNew', name: `Curb ${zones.length + 1}` })
            }}
          />
        ) : (
          <ZoneForm
            state={state}
            dispatch={dispatch}
            error={error}
            saving={saving}
            onSave={onSave}
            onCancel={() => {
              setError(null)
              dispatch({ type: 'cancel' })
            }}
            onDelete={onDelete}
          />
        )}
      </aside>
    </div>
  )
}
