import type { ZoneAvailability } from '@/entities/feed'
import { AnimatedCount, cn } from '@/shared/ui'

export function ZoneBreakdown({ zones }: { zones: ZoneAvailability[] }) {
  if (zones.length === 0) return null
  return (
    <ul
      className="flex flex-col divide-y divide-line rounded-xl border border-line"
      aria-label="Zones"
    >
      {zones.map((z) => (
        <li key={z.zoneId} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="truncate">{z.name}</span>
          <span
            className={cn(
              'flex items-baseline gap-1 font-semibold transition-colors',
              z.spaces > 0 ? 'text-free' : 'text-muted',
            )}
          >
            <AnimatedCount value={z.spaces} />
            <span className="text-xs font-normal">free</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
