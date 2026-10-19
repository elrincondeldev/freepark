import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCameraSelection, useCameraStore, type WatchedCamera } from '@/entities/camera'
import {
  ArrowLeftIcon,
  Button,
  CloseIcon,
  LocateIcon,
  SearchIcon,
  StarIcon,
  cn,
  motionPresets,
  useModal,
} from '@/shared/ui'
import { addCameraFromSource } from '../model/addCamera'
import {
  nearestStreetKm,
  search,
  useDirectory,
  type Directory,
  type DirectoryCamera,
} from '../model/directory'
import { fold, useCameraFinder } from '../model/finder'
import { NEAR_CITY_KM, currentPosition, formatDistance, type Coords } from '../model/geo'
import { AddCameraForm } from './AddCameraForm'
import { CameraTile, type TileState } from './CameraTile'

const PAGE_SIZE = 24
const EXAMPLES = ['Vigo', 'Gran Vía', 'Málaga centro', 'A-6']

/** The camera directory: search every camera (or "near me"), see live previews, tap to add. */
export function CameraFinderDialog() {
  const open = useCameraFinder((s) => s.open)
  return createPortal(
    <AnimatePresence>{open && <FinderPanel key="finder" />}</AnimatePresence>,
    document.body,
  )
}

function FinderPanel() {
  const query = useCameraFinder((s) => s.query)
  const favorites = useCameraFinder((s) => s.favorites)
  const position = useCameraFinder((s) => s.position)
  const locate = useCameraFinder((s) => s.locate)
  const { close, setQuery, toggleFavorite, removeFavorite, setPosition, setLocate } =
    useCameraFinder.getState()
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const finePointer = useMemo(() => window.matchMedia?.('(pointer: fine)').matches ?? true, [])
  useModal(dialogRef, close, finePointer ? searchRef : undefined)

  const { directory, failed, retry } = useDirectory()
  const [view, setView] = useState<'browse' | 'manual'>('browse')
  const [added, setAdded] = useState(0)

  const trimmed = query.trim()
  const saved = !!trimmed && favorites.some((f) => fold(f) === fold(trimmed))

  const locateMe = useCallback(async () => {
    setLocate('locating')
    try {
      setPosition(await currentPosition())
      setLocate('idle')
      setView('browse')
    } catch (err) {
      setLocate((err as GeolocationPositionError)?.code === 1 ? 'denied' : 'unavailable')
    }
  }, [setLocate, setPosition])

  useEffect(() => {
    if (useCameraFinder.getState().locateOnOpen) void locateMe()
  }, [locateMe])

  function applySearch(text: string) {
    setQuery(text)
    setView('browse')
    if (finePointer) requestAnimationFrame(() => searchRef.current?.focus())
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={motionPresets.base}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close camera finder"
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        onClick={close}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finder-title"
        tabIndex={-1}
        className="relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-bg shadow-2xl outline-none sm:h-[min(860px,90dvh)] sm:max-w-5xl sm:rounded-3xl"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={motionPresets.slow}
      >
        <header className="border-b border-line bg-surface px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="finder-title" className="text-xl font-semibold tracking-tight sm:text-2xl">
                {view === 'manual' ? 'Add a camera by link' : 'Add a camera'}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {view === 'manual'
                  ? 'Use any public camera image, from any city.'
                  : 'Tap a live camera that covers the street where you want to park.'}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>

          {view === 'browse' && (
            <>
              <div className="relative mt-4">
                <label htmlFor="finder-search" className="sr-only">
                  Search cameras
                </label>
                <SearchIcon
                  width={17}
                  height={17}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  id="finder-search"
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a city, street, road or province"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  className="h-12 w-full rounded-full border border-line bg-bg pl-11 pr-14 text-[15px] outline-none transition placeholder:text-muted focus:border-accent [&::-webkit-search-cancel-button]:hidden"
                />
                {trimmed && (
                  <button
                    type="button"
                    onClick={() => toggleFavorite(trimmed)}
                    aria-pressed={saved}
                    aria-label={
                      saved
                        ? `Remove “${trimmed}” from saved searches`
                        : `Save “${trimmed}” as a favourite search`
                    }
                    title={saved ? 'Saved search' : 'Save this search'}
                    className={cn(
                      'absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full transition hover:bg-surface-2',
                      saved ? 'text-warn' : 'text-muted hover:text-ink',
                    )}
                  >
                    <StarIcon width={18} height={18} fill={saved ? 'currentColor' : 'none'} />
                  </button>
                )}
              </div>

              <div
                role="group"
                aria-label="Quick searches"
                className="-mx-5 mt-3 flex items-center gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-7 sm:px-7 [&::-webkit-scrollbar]:hidden"
              >
                <Pill
                  active={!!position}
                  onClick={() => (position ? setPosition(null) : void locateMe())}
                  disabled={locate === 'locating'}
                  aria-label={position ? 'Near me (on) — tap to turn off' : 'Near me'}
                >
                  {locate === 'locating' ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <LocateIcon width={15} height={15} />
                  )}
                  {locate === 'locating' ? 'Locating…' : 'Near me'}
                </Pill>
                {favorites.map((fav) => (
                  <FavoritePill
                    key={fav}
                    label={fav}
                    active={fold(fav) === fold(query)}
                    onApply={() => applySearch(fav)}
                    onRemove={() => removeFavorite(fav)}
                  />
                ))}
                {favorites.length === 0 && (
                  <span className="shrink-0 pl-1 text-xs text-muted">
                    Tap <StarIcon width={12} height={12} className="inline align-[-1px]" /> in the
                    search box to pin a search here
                  </span>
                )}
              </div>
            </>
          )}
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          {view === 'manual' ? (
            <ManualAdd onAdded={() => setAdded((n) => n + 1)} />
          ) : failed ? (
            <Problem
              title="Can't reach the camera directory"
              body="Check that the Parking Vision API is running, then try again."
              onRetry={retry}
            />
          ) : (
            <>
              <LocateNotice
                locate={locate}
                showingRoads={
                  !!directory &&
                  !!position &&
                  !trimmed &&
                  nearestStreetKm(directory.cameras, position) > NEAR_CITY_KM
                }
                onManual={() => setView('manual')}
              />
              {!directory ? (
                <TileSkeletons />
              ) : !trimmed && !position ? (
                <StartHere
                  locating={locate === 'locating'}
                  denied={locate === 'denied'}
                  onLocate={() => void locateMe()}
                  onExample={applySearch}
                />
              ) : (
                <Results
                  directory={directory}
                  query={trimmed}
                  position={position}
                  onAdded={() => setAdded((n) => n + 1)}
                  onShowWatched={close}
                  onClearQuery={() => applySearch('')}
                />
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 sm:px-7">
          {view === 'manual' ? (
            <button
              type="button"
              onClick={() => setView('browse')}
              className="inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-sm font-medium text-muted hover:text-ink"
            >
              <ArrowLeftIcon width={15} height={15} /> Back to camera list
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setView('manual')}
              className="rounded-full px-1 py-1 text-left text-sm text-muted hover:text-ink"
            >
              <span className="hidden sm:inline">Can't find your camera? </span>
              <span className="font-medium text-accent">Add a camera by link</span>
            </button>
          )}
          <Button size="lg" onClick={close} variant={added ? 'success' : 'primary'}>
            {added ? `Done · ${added} added` : 'Done'}
          </Button>
        </footer>
      </motion.div>
    </motion.div>
  )
}

function Pill({
  active,
  className,
  ...props
}: { active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition disabled:opacity-70',
        active
          ? 'border-ink bg-ink text-bg'
          : 'border-line bg-bg text-ink hover:border-ink/40 hover:bg-surface-2',
        className,
      )}
      {...props}
    />
  )
}

function FavoritePill({
  label,
  active,
  onApply,
  onRemove,
}: {
  label: string
  active: boolean
  onApply: () => void
  onRemove: () => void
}) {
  return (
    <span
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-full border text-sm font-medium transition',
        active ? 'border-ink bg-ink text-bg' : 'border-line bg-bg text-ink hover:border-ink/40',
      )}
    >
      <button
        type="button"
        onClick={onApply}
        aria-pressed={active}
        className="inline-flex h-full items-center gap-1.5 rounded-l-full pl-3.5 pr-1.5"
      >
        <StarIcon
          width={13}
          height={13}
          fill="currentColor"
          className={active ? '' : 'text-warn'}
        />
        {label}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove saved search “${label}”`}
        className={cn(
          'mr-1 grid h-7 w-7 place-items-center rounded-full transition',
          active ? 'hover:bg-bg/20' : 'text-muted hover:bg-surface-2 hover:text-ink',
        )}
      >
        <CloseIcon width={12} height={12} />
      </button>
    </span>
  )
}

function LocateNotice({
  locate,
  showingRoads,
  onManual,
}: {
  locate: string
  showingRoads: boolean
  onManual: () => void
}) {
  let message: React.ReactNode = null
  if (locate === 'denied') {
    message = 'Location access is turned off for this site. Search for a place instead.'
  } else if (locate === 'unavailable') {
    message = "We couldn't get your location. Search for a place instead."
  } else if (showingRoads) {
    message = (
      <>
        There are no city street cameras near you yet, so these are the{' '}
        <strong className="font-semibold text-ink">DGT road cameras closest to you</strong>. They
        mostly show roads and city approaches; for parking a street camera works best. Know one near
        you?{' '}
        <button
          type="button"
          onClick={onManual}
          className="font-medium text-accent underline-offset-2 hover:underline"
        >
          Add it by link
        </button>
        .
      </>
    )
  }
  if (!message) return null
  return (
    <p
      role="status"
      className="mb-5 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm leading-6 text-muted"
    >
      {message}
    </p>
  )
}

function StartHere({
  locating,
  denied,
  onLocate,
  onExample,
}: {
  locating: boolean
  denied: boolean
  onLocate: () => void
  onExample: (text: string) => void
}) {
  return (
    <div className="mx-auto max-w-xl py-2 sm:py-8">
      <h3 className="text-center text-lg font-semibold tracking-tight">Where are you parking?</h3>
      <p className="mt-1 text-center text-sm text-muted">
        Search above, or let us find the cameras closest to you.
      </p>
      <button
        type="button"
        onClick={onLocate}
        disabled={locating}
        className="mt-6 flex w-full items-center gap-4 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-left transition hover:border-accent hover:bg-accent/15"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-white">
          {locating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <LocateIcon width={20} height={20} />
          )}
        </span>
        <span>
          <span className="block font-semibold">
            {locating ? 'Finding you…' : 'Use my location'}
          </span>
          <span className="block text-sm text-muted">
            {denied
              ? 'Allow location for this site in your browser, then tap to try again'
              : 'Show the cameras closest to you first'}
          </span>
        </span>
      </button>
      <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
        Try
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onExample(example)}
            className="rounded-full border border-line bg-surface px-3 py-1 font-medium text-ink transition hover:border-ink/40"
          >
            {example}
          </button>
        ))}
      </p>
    </div>
  )
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record }
  delete next[key]
  return next
}

function findWatched(cameras: WatchedCamera[], camera: DirectoryCamera) {
  return cameras.find((c) => c.id === camera.input || c.sourceUrl === camera.input)
}

function Results({
  directory,
  query,
  position,
  onAdded,
  onShowWatched,
  onClearQuery,
}: {
  directory: Directory
  query: string
  position: Coords | null
  onAdded: () => void
  onShowWatched: () => void
  onClearQuery: () => void
}) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [adding, setAdding] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const watched = useCameraStore((s) => s.cameras)
  useEffect(() => setLimit(PAGE_SIZE), [query, position])

  const results = useMemo(
    () => search(directory.cameras, query, position),
    [directory.cameras, query, position],
  )

  async function select(camera: DirectoryCamera) {
    const existing = findWatched(watched, camera)
    if (existing) {
      useCameraSelection.getState().highlight(existing.id)
      onShowWatched()
      return
    }
    setAdding((s) => ({ ...s, [camera.id]: true }))
    setErrors((s) => without(s, camera.id))
    try {
      const outcome = await addCameraFromSource(camera.input, camera.name)
      if (outcome.kind === 'added') onAdded()
    } catch {
      setErrors((s) => ({
        ...s,
        [camera.id]: "This camera isn't sending images right now. Try a nearby one.",
      }))
    } finally {
      setAdding((s) => without(s, camera.id))
    }
  }

  const shown = results.slice(0, limit)
  return (
    <div>
      <p className="mb-4 text-sm text-muted" aria-live="polite">
        {query ? (
          <>
            <strong className="font-semibold text-ink">{results.length.toLocaleString()}</strong>{' '}
            {results.length === 1 ? 'camera matches' : 'cameras match'} “{query}”
            {position ? ', closest first' : ''}
          </>
        ) : (
          'Cameras closest to you'
        )}
      </p>
      {directory.missing.length > 0 && (
        <p className="mb-4 text-xs text-muted">
          Some cameras are missing right now: {directory.missing.map((s) => s.name).join(', ')}{' '}
          didn't respond.
        </p>
      )}

      {results.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-medium">No cameras match “{query}”</p>
          <p className="mt-1 text-sm text-muted">
            Try a city, a street, a road like A-6 or a province.
          </p>
          <Button variant="secondary" className="mt-4" onClick={onClearQuery}>
            Clear search
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {shown.map(({ camera, km }) => {
            const state: TileState = findWatched(watched, camera)
              ? 'watching'
              : adding[camera.id]
                ? 'adding'
                : 'idle'
            return (
              <CameraTile
                key={camera.id}
                camera={camera}
                place={camera.place}
                distance={km === null ? undefined : formatDistance(km)}
                state={state}
                error={errors[camera.id]}
                onSelect={() => void select(camera)}
              />
            )
          })}
        </ul>
      )}

      {results.length > limit && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            Show more ({(results.length - limit).toLocaleString()} left)
          </Button>
        </div>
      )}
      <p className="mt-8 text-center text-xs text-muted">
        Cameras from {directory.sources.map((s) => s.provider).join(', ')}.
      </p>
    </div>
  )
}

function TileSkeletons() {
  return (
    <ul
      aria-label="Loading cameras"
      className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="relative aspect-video overflow-hidden bg-surface-2">
            <span className="absolute inset-0 animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-ink/5 to-transparent" />
          </div>
          <div className="space-y-2 px-3 py-3">
            <div className="h-3 w-3/4 rounded bg-surface-2" />
            <div className="h-3 w-1/3 rounded bg-surface-2" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Problem({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <div role="alert" className="py-14 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <Button variant="secondary" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function ManualAdd({ onAdded }: { onAdded: () => void }) {
  const [city, setCity] = useState('')
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${city.trim()} traffic cameras live image`,
  )}`
  return (
    <div className="mx-auto max-w-xl py-2 sm:py-6">
      <AddCameraForm large autoFocus onAdded={onAdded} />

      <ol className="mt-8 space-y-4 text-sm">
        {[
          [
            'Find a camera page',
            'Most cities publish their traffic cameras on a traffic or open-data website.',
          ],
          [
            'Copy the image address',
            'Right-click (or long-press) the camera picture and choose “Copy image address”.',
          ],
          [
            'Paste it above',
            'It should point to a picture, usually ending in .jpg. Web pages and video streams can’t be analysed.',
          ],
        ].map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold">
              {i + 1}
            </span>
            <span>
              <span className="block font-medium">{title}</span>
              <span className="block text-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-sm font-medium">Not sure where your city publishes cameras?</p>
      <form
        className="mt-2 flex gap-2 rounded-2xl border border-line bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (city.trim()) window.open(searchUrl, '_blank', 'noopener,noreferrer')
        }}
      >
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Your city"
          aria-label="Your city"
          maxLength={80}
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-sm outline-none focus:border-accent"
        />
        <Button type="submit" variant="secondary" disabled={!city.trim()} className="h-10">
          Search the web ↗
        </Button>
      </form>
    </div>
  )
}
