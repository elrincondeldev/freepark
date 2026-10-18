import { useRef, useState, type FormEvent } from 'react'
import { useReplicateKeyStore } from '@/entities/replicate-key'
import { Button, TextField } from '@/shared/ui'

export function ReplicateKeyControl() {
  const key = useReplicateKeyStore((s) => s.key)
  const storageAvailable = useReplicateKeyStore((s) => s.storageAvailable)
  const setKey = useReplicateKeyStore((s) => s.setKey)
  const [value, setValue] = useState('')
  const details = useRef<HTMLDetailsElement>(null)

  function save(event: FormEvent) {
    event.preventDefault()
    const next = value.trim()
    if (!next || next.length > 512 || /\s/.test(next)) return
    setKey(next)
    setValue('')
    if (details.current) details.current.open = false
  }

  return (
    <details ref={details} className="relative">
      <summary className="cursor-pointer list-none rounded-full border border-line px-3.5 py-1.5 text-sm hover:bg-surface-2">
        {key ? 'API key set' : 'Add API key'}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 shadow-lg">
        <form onSubmit={save} className="flex flex-col gap-3">
          <TextField
            label={key ? 'New Replicate API key' : 'Replicate API key'}
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={512}
            placeholder={key ? 'Enter a replacement key' : 'Enter your key'}
          />
          <p className="text-xs text-muted">
            {storageAvailable
              ? 'Saved in this browser and sent to the API for your analyses. Keep it private.'
              : 'Available only during this visit because browser storage is blocked.'}
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!value.trim() || /\s/.test(value.trim())}>
              {key ? 'Change key' : 'Save key'}
            </Button>
            {key && (
              <Button type="button" size="sm" variant="secondary" onClick={() => setKey('')}>
                Remove
              </Button>
            )}
          </div>
        </form>
      </div>
    </details>
  )
}
