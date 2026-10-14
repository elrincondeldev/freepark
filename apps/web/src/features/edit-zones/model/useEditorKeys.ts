import { useEffect, type Dispatch } from 'react'
import type { DraftAction, DraftState } from './draft'

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

/** Enter finishes the line; Backspace/Delete undoes the last point or removes the selected one. */
export function useEditorKeys(state: DraftState, dispatch: Dispatch<DraftAction>) {
  useEffect(() => {
    if (state.selected === null) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      if (e.key === 'Enter' && state.drawing) {
        e.preventDefault()
        dispatch({ type: 'finishLine' })
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        dispatch(state.drawing ? { type: 'undoPoint' } : { type: 'removeActivePoint' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.selected, state.drawing, dispatch])
}
