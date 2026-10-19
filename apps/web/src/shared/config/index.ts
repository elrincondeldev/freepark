/** Vigo camera frames are 384×216; geometry that needs isotropic pixels uses this space. */
export const FRAME_WIDTH = 384
export const FRAME_HEIGHT = 216

/** Typical update cadence of the Vigo camera source. */
export const SOURCE_INTERVAL_MS = 70_000

/** The dashboard lives under /app; every other path shows the landing page. */
export const APP_PATH = '/app'
export const isAppPath = (pathname: string) =>
  pathname === APP_PATH || pathname.startsWith(`${APP_PATH}/`)

export const GITHUB_REPO = 'elrincondeldev/parking-vision'
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`
