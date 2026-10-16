import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useReducer, useRef, useState } from 'react'
import { useFeedStore } from '@/entities/feed'
import type { View } from '@/entities/view'
import type { Zone, ZoneInput } from '@/entities/zone'
import { fade, toast } from '@/shared/ui'
import { initialDraft, validateDraft, zoneDraftReducer } from '../model/draft'
import { useEditorKeys } from '../model/useEditorKeys'
import { useZones } from '../model/useZones'
import { ZoneCanvas } from './ZoneCanvas'
import { ZoneForm } from './ZoneForm'
import { ZoneList } from './ZoneList'

const same = (a: ZoneInput, b: ZoneInput) => JSON.stringify(a) === JSON.stringify(b)

/** Draw and edit a view's approximate curb parking zones on its reference image. */
export function ZoneEditor({
  view,
  onDirtyChange,
}: {
  view: View
  /** true while a zone has unsaved changes, so the host can confirm before leaving */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const { zones, loaded, loadError, save, remove } = useZones(view.id)
  const [state, dispatch] = useReducer(zoneDraftReducer, initialDraft)
  const [pristine, setPristine] = useState<ZoneInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const markReanalysing = useFeedStore((s) => s.markReanalysing)
  const autoStarted = useRef(false)
  useEditorKeys(state, dispatch)

  const startNew = () => {
    setError(null)
    dispatch({ type: 'startNew', name: `Curb ${zones.length + 1}` })
    setPristine(null)
  }

  // A view without zones goes straight into drawing the first one.
  useEffect(() => {
    if (loaded && zones.length === 0 && !autoStarted.current) {
      autoStarted.current = true
      startNew()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, zones.length])

  const dirty =
    state.selected !== null &&
    (pristine ? !same(pristine, state.draft) : state.draft.points.length > 0)
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  const select = (zone: Zone) => {
    setError(null)
    dispatch({ type: 'select', zone })
    const { name, points, bandNear, bandFar, minGapCars } = zone
    setPristine({ name, points, bandNear, bandFar, minGapCars })
  }

  const close = () => {
    setError(null)
    setPristine(null)
    dispatch({ type: 'cancel' })
  }

  const applied = (title: string) => {
    markReanalysing(view.cameraId)
    toast({ title, body: 'Updating free spaces with the new zones…' })
  }

  async function onSave() {
    if (state.selected === null) return
    const problem = validateDraft(state.draft)
    if (problem) return setError(problem)
    setSaving(true)
    const result = await save(state.selected, state.draft)
    setSaving(false)
    if (typeof result === 'string') return setError(result)
    close()
    applied(`Zone “${result.name}” saved`)
  }

  async function onDelete() {
    if (typeof state.selected !== 'number') return
    const problem = await remove(state.selected)
    if (problem) return setError(problem)
    close()
    applied('Zone deleted')
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
          onSelectZone={(zone) => state.selected === null && select(zone)}
        />
        <p className="mt-2 text-xs text-muted">
          A car counts as parked when it touches the band or sits right beside it, so drawing the
          line along the kerb works. Prefer the nearer part of the street, where the AI sees cars
          best.
        </p>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
        <h3 className="font-semibold">Zones · {view.name}</h3>
        {loadError && <p className="text-sm text-busy">{loadError}</p>}
        <AnimatePresence mode="wait" initial={false}>
          {state.selected === null ? (
            <motion.div key="list" {...fade} className="flex flex-col gap-3">
              <ZoneList zones={zones} onSelect={select} onNew={startNew} />
            </motion.div>
          ) : (
            <motion.div key="form" {...fade} className="flex flex-col gap-3">
              <EditorHint drawing={state.drawing} points={state.draft.points.length} />
              <ZoneForm
                state={state}
                dispatch={dispatch}
                error={error}
                saving={saving}
                onSave={onSave}
                onCancel={close}
                onDelete={onDelete}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  )
}

function EditorHint({ drawing, points }: { drawing: boolean; points: number }) {
  return (
    <ol className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
      {drawing ? (
        <>
          <li className={points >= 2 ? 'line-through opacity-60' : 'text-ink'}>
            1. Click along the curb where cars park
          </li>
          <li className={points >= 2 ? 'text-ink' : ''}>
            2. Double-click or press <kbd className="font-sans font-semibold">Enter</kbd> to finish
          </li>
          <li>3. Adjust the band so it touches the parked cars, then save</li>
        </>
      ) : (
        <>
          <li>Drag points to move them · click a + to add one</li>
          <li>Adjust the band so it touches the parked cars</li>
          <li>
            <kbd className="font-sans font-semibold">Backspace</kbd> removes the selected point
          </li>
        </>
      )}
    </ol>
  )
}
