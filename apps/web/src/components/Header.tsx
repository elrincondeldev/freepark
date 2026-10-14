import { AnimatePresence, motion } from 'framer-motion'
import { useCameraStore } from '../store/cameras'
import { useLiveStore } from '../store/live'
import { AddCamera } from './AddCamera'
import { MuteIcon, VolumeIcon } from './icons'

export function Header() {
  const connection = useLiveStore((s) => s.connection)
  const hasCameras = useCameraStore((s) => s.cameras.length > 0)
  const sound = useCameraStore((s) => s.settings.sound)
  const setSound = useCameraStore((s) => s.setSound)
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
          {hasCameras && <AddCamera />}
        </div>
        <button
          type="button"
          onClick={() => setSound(!sound)}
          aria-pressed={sound}
          aria-label={sound ? 'Mute alert sound' : 'Play a sound with alerts'}
          title={sound ? 'Alert sound on' : 'Alert sound off'}
          className="ml-auto grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink sm:ml-0"
        >
          {sound ? <VolumeIcon /> : <MuteIcon />}
        </button>
      </div>
      {!storageAvailable && (
        <p className="bg-warn/15 px-4 py-1.5 text-center text-xs text-warn" role="status">
          Your browser blocks storage — cameras you add won't be remembered after this visit.
        </p>
      )}
    </header>
  )
}

function ConnectionPill({ state }: { state: 'connecting' | 'open' | 'reconnecting' }) {
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
