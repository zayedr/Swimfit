import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// HashRouter (not BrowserRouter) — this app is deployed as static files
// rsynced into swimfit.online/future-forward/ on GitHub Pages, with no
// server-side rewrite rule for deep links. A BrowserRouter URL like
// /future-forward/workouts 404s on a hard refresh or a shared link; hash
// routing (/future-forward/#/workouts) always resolves to index.html first,
// so every route works from a cold load on this static host.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
