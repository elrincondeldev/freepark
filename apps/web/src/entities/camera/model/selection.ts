import { create } from 'zustand'

/** What the focus panel shows for the selected camera. */
export type CameraPanel = { kind: 'live' } | { kind: 'views' } | { kind: 'zones'; viewId: number }

interface SelectionState {
  /** camera opened in the focus panel */
  focusedId: string | null
  panel: CameraPanel
  /** camera briefly highlighted in the grid (e.g. when added twice) */
  highlightedId: string | null
  focus: (cameraId: string, panel?: CameraPanel) => void
  showPanel: (panel: CameraPanel) => void
  close: () => void
  highlight: (cameraId: string) => void
}

const LIVE: CameraPanel = { kind: 'live' }
const HIGHLIGHT_MS = 1600

export const useCameraSelection = create<SelectionState>()((set) => ({
  focusedId: null,
  panel: LIVE,
  highlightedId: null,
  focus: (focusedId, panel = LIVE) => set({ focusedId, panel }),
  showPanel: (panel) => set({ panel }),
  close: () => set({ focusedId: null, panel: LIVE }),
  highlight: (cameraId) => {
    set({ highlightedId: cameraId })
    setTimeout(
      () => set((s) => (s.highlightedId === cameraId ? { highlightedId: null } : s)),
      HIGHLIGHT_MS,
    )
  },
}))
