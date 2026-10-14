import { motion } from 'framer-motion'
import { STATUS_META, type DisplayStatus } from '../model/status'

const TONE: Record<string, string> = {
  free: 'bg-free/15 text-free',
  warn: 'bg-warn/15 text-warn',
  busy: 'bg-busy/15 text-busy',
  muted: 'bg-surface-2 text-muted',
  accent: 'bg-accent/15 text-accent',
}

export function FeedStatusBadge({ status }: { status: DisplayStatus }) {
  const meta = STATUS_META[status]
  return (
    <motion.span
      key={status}
      layout="position"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[meta.tone]}`}
      data-status={status}
    >
      <span className="relative flex h-1.5 w-1.5">
        {(status === 'live' || status === 'analysing') && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
        )}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {meta.label}
    </motion.span>
  )
}
