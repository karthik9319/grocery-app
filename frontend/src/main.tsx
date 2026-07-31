import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { applyTheme, getStoredTheme, applyColorTheme, getStoredColorTheme } from '@/lib/theme'
import { flushOfflineQueue } from '@/lib/offlineQueue'

// Register the service worker only in production where /sw.js exists.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err =>
      console.error('SW registration failed:', err)
    );
  });
}

// In development (launch.sh / `npm run dev`) proactively remove any leftover service
// worker + caches. The dev SW used to be enabled and could keep serving a stale copy of
// the app, so edits appeared to "do nothing". This self-heals that on the next load.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

applyTheme(getStoredTheme())
applyColorTheme(getStoredColorTheme())

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5000, refetchOnWindowFocus: false },
  },
})

// Replay any writes that were queued while offline: once when the app loads, and again
// whenever connectivity is restored. On a successful sync, refresh all cached data.
const onSync = () => queryClient.invalidateQueries()
flushOfflineQueue(onSync)
window.addEventListener('online', () => flushOfflineQueue(onSync))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  </StrictMode>,
)
