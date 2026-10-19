import { AnimatePresence, motion } from 'framer-motion'
import { useCameraStore } from '@/entities/camera'
import { useFeedStore } from '@/entities/feed'
import { AddCameraButton } from '@/features/add-camera'
import { ReplicateKeyControl } from '@/features/manage-replicate-key'
import { SoundToggle } from '@/features/toggle-alert-sound'
import type { ConnectionState } from '@/shared/lib'
import { DataControl } from './DataControl'

export function AppHeader() {
  const connection = useFeedStore((s) => s.connection)
  const hasCameras = useCameraStore((s) => s.cameras.length > 0)
  const storageAvailable = useCameraStore((s) => s.storageAvailable)

  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-free text-sm font-bold text-white">
            P
          </span>
          <span className="font-semibold tracking-tight">Parking Vision</span>
          <ConnectionPill state={connection} />
        </div>
        <div className="order-3 flex w-full justify-end sm:order-none sm:ml-auto sm:w-auto">
          {hasCameras && <AddCameraButton />}
        </div>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <DataControl />
          <ReplicateKeyControl />
          <SoundToggle />
        </div>
      </div>
      {!storageAvailable && (
        <p className="bg-warn/15 px-4 py-1.5 text-center text-xs text-warn" role="status">
          Your browser blocks storage — cameras you add won't be remembered after this visit.
        </p>
      )}
    </header>
  )
}

function ConnectionPill({ state }: { state: ConnectionState }) {
  return (
    <AnimatePresence mode="wait">
      {state !== 'open' && (
        <motion.span
          key={state}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-1.5 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-medium text-warn"
          role="status"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          {state === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </motion.span>
      )}
    </AnimatePresence>
  )
}
