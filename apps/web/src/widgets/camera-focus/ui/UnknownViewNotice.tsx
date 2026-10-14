import { Button } from '@/shared/ui'

export function UnknownViewNotice({ onSaveView }: { onSaveView: () => void }) {
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
      <p className="font-medium text-warn">The camera is pointing somewhere new.</p>
      <p className="mt-1 text-muted">
        Save this view and draw its curb zones to see free spaces here.
      </p>
      <Button size="xs" variant="warning" className="mt-2 font-semibold" onClick={onSaveView}>
        Save this view
      </Button>
    </div>
  )
}
