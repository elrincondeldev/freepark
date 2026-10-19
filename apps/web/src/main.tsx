import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import '@/app/styles/index.css'
import { restoreBrowserState } from '@/shared/api'
import { toast } from '@/shared/ui'

void restoreBrowserState()
  .catch((error) => {
    console.error(error)
    toast({ title: 'Saved data could not be loaded', body: String(error) })
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
