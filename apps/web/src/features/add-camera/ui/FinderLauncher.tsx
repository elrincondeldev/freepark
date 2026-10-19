import { Button, LocateIcon, PlusIcon, SearchIcon, StarIcon } from '@/shared/ui'
import { openCameraFinder, useCameraFinder } from '../model/finder'

/** First-run entry point: cameras near me, a search, or one of the user's saved searches. */
export function FinderLauncher() {
  const favorites = useCameraFinder((s) => s.favorites)

  return (
    <div className="flex flex-col items-center">
      <div className="flex flex-wrap justify-center gap-3">
        <Button
          size="lg"
          className="h-14 px-7 text-base shadow-lg shadow-ink/10"
          onClick={() => openCameraFinder({ nearMe: true })}
        >
          <LocateIcon width={18} height={18} />
          Find cameras near me
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-14 bg-surface px-6 text-base"
          onClick={() => openCameraFinder()}
        >
          <SearchIcon width={18} height={18} />
          Search a place
        </Button>
      </div>
      {favorites.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          <span>Your searches</span>
          {favorites.map((fav) => (
            <button
              key={fav}
              type="button"
              onClick={() => openCameraFinder({ query: fav })}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 font-medium text-ink transition hover:border-ink/40 hover:bg-surface-2"
            >
              <StarIcon width={13} height={13} fill="currentColor" className="text-warn" />
              {fav}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Header action once the user already watches cameras. */
export function AddCameraButton() {
  return (
    <Button size="md" onClick={() => openCameraFinder()} className="h-9">
      <PlusIcon width={15} height={15} strokeWidth={2.5} />
      Add camera
    </Button>
  )
}
