import type { Dispatch } from 'react'
import type { ZoneInput } from '@/entities/zone'
import { Button, Slider, TextField } from '@/shared/ui'
import { MIN_POINTS, type DraftAction, type DraftState } from '../model/draft'

const percent = (v: number) => `${Math.round(v * 1000) / 10}%`

export function ZoneForm({
  state,
  dispatch,
  error,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  state: DraftState
  dispatch: Dispatch<DraftAction>
  error: string | null
  saving: boolean
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const { draft, drawing, activePoint, selected } = state
  const update = (patch: Partial<Omit<ZoneInput, 'points'>>) => dispatch({ type: 'update', patch })

  return (
    <div className="flex flex-col gap-3 text-sm">
      <TextField
        label="Name"
        value={draft.name}
        maxLength={80}
        onChange={(e) => update({ name: e.target.value })}
      />
      <Slider
        label="Band width (near end)"
        value={draft.bandNear}
        min={0.004}
        max={0.12}
        step={0.002}
        format={percent}
        onChange={(bandNear) => update({ bandNear })}
      />
      <Slider
        label="Band width (far end)"
        value={draft.bandFar}
        min={0.004}
        max={0.12}
        step={0.002}
        format={percent}
        onChange={(bandFar) => update({ bandFar })}
      />
      <TextField
        label="Car lengths per space (optional)"
        type="number"
        min={0.8}
        max={5}
        step={0.05}
        placeholder="1.15"
        value={draft.minGapCars ?? ''}
        onChange={(e) => update({ minGapCars: e.target.value ? Number(e.target.value) : null })}
      />
      <div className="flex flex-wrap gap-2">
        {drawing ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={draft.points.length < MIN_POINTS}
            onClick={() => dispatch({ type: 'finishLine' })}
          >
            Finish line
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={activePoint === null || draft.points.length <= MIN_POINTS}
            onClick={() => dispatch({ type: 'removeActivePoint' })}
          >
            Remove point
          </Button>
        )}
        {drawing && draft.points.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => dispatch({ type: 'undoPoint' })}>
            Undo point
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-busy">
          {error}
        </p>
      )}
      <div className="mt-1 flex gap-2">
        <Button variant="success" className="flex-1" disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save zone'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {typeof selected === 'number' && (
        <button
          type="button"
          onClick={onDelete}
          className="self-start text-xs text-busy hover:underline"
        >
          Delete zone
        </button>
      )}
    </div>
  )
}
