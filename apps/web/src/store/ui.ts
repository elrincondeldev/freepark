import { create } from 'zustand'

export type EditorState =
  { cameraId: string; mode: 'views' } | { cameraId: string; mode: 'zones'; viewId: number }

interface UiState {
  highlightId: string | null
  focusId: string | null
  editor: EditorState | null
  highlight: (id: string) => void
  focus: (id: string | null) => void
  openEditor: (editor: EditorState | null) => void
}

export const useUiStore = create<UiState>()((set) => ({
  highlightId: null,
  focusId: null,
  editor: null,
  highlight: (id) => {
    set({ highlightId: id })
    setTimeout(() => set((s) => (s.highlightId === id ? { highlightId: null } : s)), 1600)
  },
  focus: (focusId) => set({ focusId, editor: null }),
  openEditor: (editor) => set({ editor }),
}))
