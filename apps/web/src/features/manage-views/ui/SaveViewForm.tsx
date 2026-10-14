import { useState } from 'react'
import { Button, cn } from '@/shared/ui'

export function SaveViewForm({
  unknownView,
  disabled,
  onSave,
}: {
  unknownView: boolean
  disabled: boolean
  onSave: (name: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(name.trim())
        setName('')
      }}
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center',
        unknownView ? 'border-warn/50 bg-warn/10' : 'border-line',
      )}
    >
      <span className="text-sm font-medium sm:mr-auto">
        {unknownView ? 'The camera is showing a new view' : 'Save what the camera shows now'}
      </span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name, e.g. Towards the port"
        aria-label="New view name"
        maxLength={80}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
      />
      <Button type="submit" size="sm" disabled={disabled}>
        Save this view
      </Button>
    </form>
  )
}
