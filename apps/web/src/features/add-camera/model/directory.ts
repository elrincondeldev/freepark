import { useCallback, useEffect, useState } from 'react'
import { fetchCities, fetchCityCameras, type CatalogCamera, type CatalogCity } from '../api/catalog'
import { fold } from './finder'
import { distanceKm, type Coords } from './geo'

/** A camera from any directory, ready to search. */
export interface DirectoryCamera extends CatalogCamera {
  /** where it is, shown under the name: the city, or the road network it belongs to */
  place: string
  /** a city street camera (better for parking than a road camera) */
  street: boolean
  /** folded name + place, what search matches against */
  haystack: string
}

export interface Directory {
  cameras: DirectoryCamera[]
  sources: CatalogCity[]
  /** directories that could not be loaded */
  missing: CatalogCity[]
}

export function toDirectoryCameras(city: CatalogCity, cameras: CatalogCamera[]) {
  const street = city.scope === 'city'
  const place = street ? city.name : 'Road camera'
  return cameras.map<DirectoryCamera>((camera) => ({
    ...camera,
    place,
    street,
    haystack: fold(`${camera.name} ${street ? city.name : `${city.country} carretera road`}`),
  }))
}

export interface Ranked {
  camera: DirectoryCamera
  km: number | null
}

/**
 * Cameras matching every word of the query (accents and case ignored). With a position they
 * are ordered by distance; otherwise street cameras come before road cameras.
 */
export function search(cameras: DirectoryCamera[], query: string, position: Coords | null) {
  const terms = fold(query).split(' ').filter(Boolean)
  const matches = terms.length
    ? cameras.filter((c) => terms.every((t) => c.haystack.includes(t)))
    : cameras
  if (position) {
    return matches
      .map<Ranked>((camera) => ({ camera, km: distanceKm(position, camera) }))
      .sort((a, b) => a.km! - b.km!)
  }
  return matches
    .map<Ranked>((camera) => ({ camera, km: null }))
    .sort((a, b) => Number(b.camera.street) - Number(a.camera.street))
}

/** The closest street camera, to tell whether the user is anywhere near a covered city. */
export function nearestStreetKm(cameras: DirectoryCamera[], position: Coords): number {
  let best = Infinity
  for (const camera of cameras) {
    if (camera.street) best = Math.min(best, distanceKm(position, camera))
  }
  return best
}

let cache: Directory | null = null

/** Loads every camera directory once; a failing one is reported, not fatal. */
export function useDirectory() {
  const [directory, setDirectory] = useState<Directory | null>(cache)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    fetchCities()
      .then(async (sources) => {
        const results = await Promise.allSettled(sources.map((s) => fetchCityCameras(s.id)))
        const cameras: DirectoryCamera[] = []
        const missing: CatalogCity[] = []
        results.forEach((result, i) => {
          if (result.status === 'fulfilled') {
            cameras.push(...toDirectoryCameras(sources[i], result.value.cameras))
          } else {
            missing.push(sources[i])
          }
        })
        if (!cameras.length) throw new Error('no camera directory could be loaded')
        const next = { cameras, sources, missing }
        if (!missing.length) cache = next
        setDirectory(next)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    if (!cache) load()
  }, [load])

  return { directory, failed, retry: load }
}

/** For tests: forget loaded cameras. */
export function resetDirectoryCache() {
  cache = null
}
