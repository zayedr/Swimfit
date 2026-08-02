import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Built output is served from swimfit.online/future-forward/ (GitHub Pages
// serves the repo's main branch root as-is, no build workflow) — the base
// path only applies to `vite build`, so `npm run dev` still serves from `/`.
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  base: command === 'build' ? '/future-forward/' : '/',
}))
