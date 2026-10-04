import '@fontsource-variable/geist'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import Root from './Root.tsx'
import './index.css'
import { requestPersistentStorage } from './lib/db'
import { startSync } from './lib/sync'
import { ConfirmProvider } from './ui/Confirm'

registerSW({ immediate: true })
void requestPersistentStorage()
startSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Respect the OS "Reduce Motion" setting for every animation. */}
    <MotionConfig reducedMotion="user">
      <ConfirmProvider>
        <Root />
      </ConfirmProvider>
    </MotionConfig>
  </StrictMode>,
)
