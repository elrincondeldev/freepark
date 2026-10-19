import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import '@/app/styles/index.css'
import { registerCameraSources, useCameraStore } from '@/entities/camera'
import { restoreBrowserState } from '@/shared/api'
import { isAppPath } from '@/shared/config'
import { toast } from '@/shared/ui'

const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

if (isAppPath(window.location.pathname)) {
  void restoreBrowserState()
    .catch((error) => {
      console.error(error)
      toast({ title: 'Saved data could not be loaded', body: String(error) })
    })
    .then(() => registerCameraSources(useCameraStore.getState().cameras))
    .catch((error) => console.error('Camera sources could not be registered', error))
    .finally(render)
} else {
  render()
}
