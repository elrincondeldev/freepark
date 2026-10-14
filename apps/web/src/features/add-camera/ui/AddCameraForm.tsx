import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  parseCameraInput,
  probeCamera,
  useCameraSelection,
  useCameraStore,
  type ProbeResult,
} from '@/entities/camera'
import { ApiError } from '@/shared/api'

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'error'; message: string }
  | { kind: 'added'; probe: ProbeResult }

const FORMAT_HINT = 'Paste a camera link (…/cam.php?id=47) or type its number, like 04.'

export function AddCameraForm({
  autoFocus = false,
  large = false,
}: {
  autoFocus?: boolean
  large?: boolean
}) {
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)
  const addCamera = useCameraStore((s) => s.addCamera)
  const cameras = useCameraStore((s) => s.cameras)
  const highlight = useCameraSelection((s) => s.highlight)

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
    const id = parseCameraInput(value)
    if (!id) {
      setStatus({ kind: 'error', message: `That doesn't look like a Vigo camera. ${FORMAT_HINT}` })
      return
    }
    if (cameras.some((c) => c.id === id)) {
      highlight(id)
      setStatus({ kind: 'error', message: `You're already watching camera ${id}.` })
      return
    }
    setStatus({ kind: 'checking' })
    try {
      const probe = await probeCamera(value.trim())
      if (addCamera(probe.cameraId) === 'duplicate') highlight(probe.cameraId)
      setStatus({ kind: 'added', probe })
      setValue('')
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 502
          ? `Camera ${id} could not be reached. Check the number and try again.`
          : err instanceof ApiError && err.status === 400
            ? `That doesn't look like a Vigo camera. ${FORMAT_HINT}`
            : 'Could not check the camera right now. Is the API running?'
      setStatus({ kind: 'error', message })
    }
  }

  const checking = status.kind === 'checking'
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
          placeholder="Camera link or number…"
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
                alt={`Preview of camera ${status.probe.cameraId}`}
                className="h-9 w-16 rounded-md object-cover"
              />
              <span>
                Camera <strong className="text-ink">{status.probe.cameraId}</strong> added
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
