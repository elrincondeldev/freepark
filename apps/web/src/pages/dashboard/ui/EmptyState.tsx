import { motion } from 'framer-motion'
import { AddCameraForm, FinderLauncher } from '@/features/add-camera'
import { LogoMark, motionPresets } from '@/shared/ui'

export function EmptyState() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionPresets.slow}
      className="mx-auto flex max-w-xl flex-col items-center px-4 pb-16 pt-[12vh] text-center"
    >
      <span className="mb-8 rounded-2xl shadow-lg shadow-free/25 ring-8 ring-free/15">
        <LogoMark size={64} className="block" />
      </span>
      <h1 className="text-3xl font-semibold tracking-tight">
        Find a free spot before you get there
      </h1>
      <p className="mt-3 max-w-md text-muted">
        Pick a live street camera where you want to park. We watch it and mark free curb space in
        green.
      </p>
      <div className="mt-8 w-full">
        <FinderLauncher />
      </div>

      <div className="mt-12 flex w-full max-w-lg items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or paste a camera image link
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="mt-4 flex w-full justify-center">
        <AddCameraForm />
      </div>
      <p className="mt-6 text-xs text-muted">Your cameras are saved in this browser.</p>
    </motion.section>
  )
}
