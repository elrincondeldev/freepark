import { AnimatePresence, motion } from 'framer-motion'
import { BellIcon, CloseIcon } from '../icons'
import { motionPresets } from '../motion'
import { useToastStore } from './model'

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="assertive"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout="position"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={motionPresets.base}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-xl backdrop-blur-md"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-free/15 text-free">
              <BellIcon />
            </span>
            <button
              type="button"
              onClick={() => {
                t.onSelect?.()
                dismiss(t.id)
              }}
              disabled={!t.onSelect}
              className="min-w-0 flex-1 text-left disabled:cursor-default"
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
