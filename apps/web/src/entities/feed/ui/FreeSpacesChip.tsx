import { AnimatedCount, cn } from '@/shared/ui'

/** "3 free" pill over a camera image; "—" when availability is unknown. */
export function FreeSpacesChip({
  total,
  large = false,
}: {
  total: number | null
  large?: boolean
}) {
  const free = (total ?? 0) > 0
  return (
    <div
      data-testid="free-chip"
      className={cn(
        'flex items-baseline gap-1 rounded-full font-semibold shadow-sm backdrop-blur-md transition-colors duration-300',
        large ? 'px-4 py-1.5 text-lg' : 'px-2.5 py-1 text-sm',
        total === null
          ? 'bg-black/45 text-white/70'
          : free
            ? 'bg-free text-white'
            : 'bg-black/55 text-white',
      )}
    >
      {total === null ? (
        <span>—</span>
      ) : (
        <>
          <AnimatedCount value={total} />
          <span className="text-xs font-medium opacity-90">free</span>
        </>
      )}
    </div>
  )
}
