import { cn } from '@/shared/ui'
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
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-200',
        TONE[meta.tone],
      )}
      data-status={status}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full bg-current',
          status === 'analysing' && 'animate-pulse',
        )}
      />
      {meta.label}
    </span>
  )
}
