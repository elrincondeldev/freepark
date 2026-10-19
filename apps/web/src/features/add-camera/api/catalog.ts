import { request } from '@/shared/api'

export interface CatalogCity {
  id: string
  name: string
  country: string
  lat: number
  lon: number
  /** who publishes the camera listing */
  provider: string
  /** `city`: street cameras of one city; `country`: road cameras across the whole country */
  scope: 'city' | 'country'
}

export interface CatalogCamera {
  id: string
  name: string
  lat: number
  lon: number
  /** what the probe endpoint accepts to add this camera */
  input: string
  /** live image the browser can show directly */
  previewUrl: string
}

let cities: Promise<CatalogCity[]> | null = null

/** Cities with a built-in camera directory. Static per API build, so fetched once. */
export function fetchCities(): Promise<CatalogCity[]> {
  cities ??= request<CatalogCity[]>('/api/catalog/cities').catch((err: unknown) => {
    cities = null
    throw err
  })
  return cities
}

export const fetchCityCameras = (cityId: string) =>
  request<{ city: CatalogCity; cameras: CatalogCamera[] }>(
    `/api/catalog/cities/${encodeURIComponent(cityId)}/cameras`,
  )

/** For tests: forget the cached city list. */
export function resetCatalogCache() {
  cities = null
}
