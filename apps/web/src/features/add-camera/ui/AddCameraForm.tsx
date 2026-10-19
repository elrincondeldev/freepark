import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { parseCameraInput, type ProbeResult } from '@/entities/camera'
import { FORMAT_HINT, addCameraFromSource, addErrorMessage } from '../model/addCamera'

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'error'; message: string }
  | { kind: 'added'; probe: ProbeResult; label: string }

/** Add a camera by pasting its public JPEG link (or a Vigo camera number). */
export function AddCameraForm({
  autoFocus = false,
  large = false,
  onAdded,
}: {
  autoFocus?: boolean
  large?: boolean
  onAdded?: () => void
}) {
  const [value, setValue] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (status.kind !== 'added') return
    const t = setTimeout(() => setStatus({ kind: 'idle' }), 3500)
    return () => clearTimeout(t)
  }, [status])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const input = value.trim()
    const id = parseCameraInput(input)
    if (!id && !/^https?:\/\//i.test(input)) {
      setStatus({ kind: 'error', message: FORMAT_HINT })
      return
    }
    setStatus({ kind: 'checking' })
    try {
      const outcome = await addCameraFromSource(input, name)
      if (outcome.kind === 'duplicate') {
        setStatus({
          kind: 'error',
          message: id
            ? `You're already watching camera ${id}.`
            : 'You are already watching this camera.',
        })
        return
      }
      setStatus({ kind: 'added', probe: outcome.probe, label: outcome.label })
      setValue('')
      setName('')
      onAdded?.()
    } catch (err) {
      setStatus({ kind: 'error', message: addErrorMessage(err, input) })
    }
  }

  const checking = status.kind === 'checking'
  const customUrl = !parseCameraInput(value) && /^https?:\/\//i.test(value.trim())
  return (
    <div className={large ? 'w-full max-w-lg' : 'w-full max-w-sm'}>
      <form onSubmit={submit} className="relative flex items-center" aria-label="Add camera">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (status.kind === 'error') setStatus({ kind: 'idle' })
          }}
          placeholder="Public JPEG link or Vigo number…"
          aria-label="Camera link or number"
          aria-invalid={status.kind === 'error'}
          aria-describedby="add-camera-status"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className={`w-full rounded-full border border-line bg-surface pr-24 text-ink placeholder:text-muted shadow-sm transition focus:border-accent focus:outline-none ${
            large ? 'h-14 pl-6 text-base' : 'h-10 pl-4 text-sm'
          } ${status.kind === 'error' ? 'border-busy' : ''}`}
        />
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className={`absolute right-1.5 rounded-full bg-ink font-medium text-bg transition hover:opacity-90 disabled:opacity-40 ${
            large ? 'h-11 px-5 text-sm' : 'h-7 px-3.5 text-xs'
          }`}
        >
          {checking ? 'Checking…' : 'Add'}
        </button>
      </form>
      {customUrl && (
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Camera name (optional)"
          aria-label="Camera name (optional)"
          className="mt-2 h-9 w-full rounded-full border border-line bg-surface px-4 text-sm focus:border-accent focus:outline-none"
        />
      )}
      <div id="add-camera-status" aria-live="polite" className="min-h-0">
        <AnimatePresence mode="wait">
          {status.kind === 'error' && (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
              className="mt-2 px-4 text-sm text-busy"
            >
              {status.message}
            </motion.p>
          )}
          {status.kind === 'added' && (
            <motion.div
              key="added"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 flex items-center gap-3 px-2 text-sm text-muted"
            >
              <img
                src={status.probe.url}
                alt={`Preview of ${status.label}`}
                className="h-9 w-16 rounded-md object-cover"
              />
              <span>
                <strong className="text-ink">{status.label}</strong> added
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
