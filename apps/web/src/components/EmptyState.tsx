import { motion } from 'framer-motion'
import { AddCamera } from './AddCamera'

export function EmptyState() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex max-w-xl flex-col items-center px-4 pt-[14vh] text-center"
    >
      <div className="relative mb-8 grid h-20 w-20 place-items-center">
        <motion.span
          className="absolute inset-0 rounded-3xl bg-free/20"
          animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-free text-3xl font-bold text-white shadow-lg">
          P
        </span>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">
        Find a free spot before you get there
      </h1>
      <p className="mt-3 max-w-md text-muted">
        Add the Vigo traffic cameras that cover your streets. We watch them live and mark free curb
        space in green.
      </p>
      <div className="mt-8 flex w-full justify-center">
        <AddCamera autoFocus large />
      </div>
      <p className="mt-6 text-xs text-muted">
        Try <code className="rounded bg-surface-2 px-1.5 py-0.5">47</code> or{' '}
        <code className="rounded bg-surface-2 px-1.5 py-0.5">04</code>. Your list is saved in this
        browser only.
      </p>
    </motion.section>
  )
}
