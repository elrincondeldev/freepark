import type { Zone } from '@/entities/zone'
import { Button } from '@/shared/ui'

export function ZoneList({
  zones,
  onSelect,
  onNew,
}: {
  zones: Zone[]
  onSelect: (zone: Zone) => void
  onNew: () => void
}) {
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {zones.map((z) => (
          <li key={z.id}>
            <button
              type="button"
              onClick={() => onSelect(z)}
              className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-surface-2"
            >
              {z.name}
            </button>
          </li>
        ))}
        {zones.length === 0 && <li className="text-sm text-muted">No zones yet.</li>}
      </ul>
      <Button onClick={onNew}>New zone</Button>
    </>
  )
}
