import { create } from 'zustand'

export interface Toast {
  id: number
  title: string
  body?: string
  /** Called when the toast body is clicked (e.g. navigate to the related item). */
  onSelect?: () => void
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => number
  dismiss: (id: number) => void
}

export const TOAST_DURATION_MS = 8000
const MAX_VISIBLE = 4
let nextId = 1

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts.slice(-(MAX_VISIBLE - 1)), { ...toast, id }] }))
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      TOAST_DURATION_MS,
    )
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = (t: Omit<Toast, 'id'>) => useToastStore.getState().push(t)
