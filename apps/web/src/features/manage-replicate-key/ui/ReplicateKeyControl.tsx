import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReplicateKeyStore } from '@/entities/replicate-key'
import { CloseIcon, motionPresets } from '@/shared/ui'

const TOKEN_URL = 'https://replicate.com/account/api-tokens'
const TOKEN_PATTERN = /^r8_\S{37}$/

export function ReplicateKeyControl() {
  const key = useReplicateKeyStore((s) => s.key)
  const storageAvailable = useReplicateKeyStore((s) => s.storageAvailable)
  const setKey = useReplicateKeyStore((s) => s.setKey)
  const [open, setOpen] = useState(() => !useReplicateKeyStore.getState().key)
  const [value, setValue] = useState(() => useReplicateKeyStore.getState().key)
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const candidate = value.trim()
  const complete = TOKEN_PATTERN.test(candidate)
  const invalid =
    candidate !== key &&
    (candidate.length > 40 ||
      /\s/.test(candidate) ||
      (candidate.length >= 3 && !candidate.startsWith('r8_')))

  const close = useCallback(() => {
    setOpen(false)
    setValue('')
    setVisible(false)
  }, [])

  useEffect(() => {
    if (!open || !complete || candidate === key) return
    const timer = window.setTimeout(() => {
      setKey(candidate)
      close()
    }, 400)
    return () => window.clearTimeout(timer)
  }, [candidate, close, complete, key, open, setKey])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const trigger = triggerRef.current
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    inputRef.current?.select()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled)',
        ),
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    function keepFocusInDialog(event: FocusEvent) {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) {
        inputRef.current?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', keepFocusInDialog)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', keepFocusInDialog)
      trigger?.focus()
    }
  }, [open, close])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setValue(key)
          setVisible(false)
          setOpen(true)
        }}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium transition hover:bg-surface-2"
      >
        <span className={`h-2 w-2 rounded-full ${key ? 'bg-free' : 'bg-warn'}`} />
        {key ? 'AI connected' : 'Connect AI'}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4 sm:p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionPresets.base}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-label="Close setup dialog"
                className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
                onClick={close}
              />
              <motion.div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="replicate-dialog-title"
                aria-describedby="replicate-dialog-description"
                className="relative my-auto w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-2xl sm:p-8"
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={motionPresets.base}
              >
                <button
                  type="button"
                  aria-label="Close dialog"
                  onClick={close}
                  className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
                >
                  <CloseIcon />
                </button>

                <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-accent/12 text-accent">
                  <KeyIcon />
                </div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-accent">
                  {key ? 'AI settings' : 'One quick setup'}
                </p>
                <h2
                  id="replicate-dialog-title"
                  className="pr-8 text-2xl font-semibold tracking-tight"
                >
                  {key ? 'Manage your Replicate key' : 'Enable AI parking detection'}
                </h2>
                <p id="replicate-dialog-description" className="mt-2 text-sm leading-6 text-muted">
                  {key
                    ? 'Your key is connected. Edit or paste a new one below to replace it, or remove it at any time.'
                    : 'Add your own Replicate API token to analyze camera images and find available spaces.'}
                </p>

                <div className="mt-6">
                  <label htmlFor="replicate-token" className="text-sm font-medium">
                    Replicate API token
                  </label>
                  <div className="relative mt-2">
                    <input
                      ref={inputRef}
                      id="replicate-token"
                      type={visible ? 'text' : 'password'}
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? 'replicate-token-error' : undefined}
                      placeholder="Paste your token here"
                      className="h-12 w-full rounded-xl border border-line bg-bg px-4 pr-16 font-mono text-sm outline-none focus:border-accent"
                    />
                    {value && (
                      <button
                        type="button"
                        onClick={() => setVisible((shown) => !shown)}
                        className="absolute inset-y-1 right-2 rounded-lg px-2.5 text-xs font-medium text-muted hover:text-ink"
                        aria-label={visible ? 'Hide token' : 'Show token'}
                      >
                        {visible ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </div>
                  {invalid && (
                    <p id="replicate-token-error" className="mt-2 text-xs text-busy">
                      Replicate tokens start with r8_, contain no spaces, and have 40 characters.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-accent" role="status">
                    {key && candidate === key
                      ? 'Current token saved.'
                      : candidate && !complete
                        ? `Waiting for a complete token (${candidate.length}/40)`
                        : 'A complete token saves automatically.'}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-muted">
                    {storageAvailable
                      ? 'Saved only in this browser. Your token is sent to the API when you watch a camera.'
                      : 'Browser storage is blocked, so the token lasts only for this visit.'}
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-sm">
                  <a
                    href={TOKEN_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Get a token from Replicate ↗
                  </a>
                  {key ? (
                    <button
                      type="button"
                      onClick={() => {
                        setKey('')
                        close()
                      }}
                      className="text-muted hover:text-busy"
                    >
                      Remove key
                    </button>
                  ) : (
                    <button type="button" onClick={close} className="text-muted hover:text-ink">
                      Continue without AI
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

function KeyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="m11 12 9-9m-3 0h3v3m-6 0 3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
