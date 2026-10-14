import { AnimatePresence, motion } from 'framer-motion'
import { BellIcon, CloseIcon } from '../icons'
import { useToastStore } from './model'

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="assertive"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-free/40 bg-surface/95 p-3 shadow-xl backdrop-blur-md"
          >
            <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-free text-white">
              <BellIcon />
              <motion.span
                className="absolute inset-0 rounded-xl bg-free"
                initial={{ opacity: 0.6, scale: 1 }}
                animate={{ opacity: 0, scale: 1.6 }}
                transition={{ duration: 1.2, repeat: 2 }}
              />
            </span>
            <button
              type="button"
              onClick={() => {
                t.onSelect?.()
                dismiss(t.id)
              }}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-sm font-semibold">{t.title}</p>
              {t.body && <p className="truncate text-xs text-muted">{t.body}</p>}
            </button>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2"
            >
              <CloseIcon />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
