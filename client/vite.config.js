import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mkcert from 'vite-plugin-mkcert'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves the app under /<repo>/, so production assets and
  // routes must be prefixed with it. Dev stays at root.
  base: command === 'build' ? '/Glimpse/' : '/',
  // mkcert only provides the dev-server HTTPS cert; it drags in undici which
  // breaks the CI build, so load it only when serving, not when building
  plugins: [react(), tailwindcss(), ...(command === 'serve' ? [mkcert()] : [])],
  server: {
    host: true, // listen on LAN, not just localhost, so phones can reach the dev server
    https: true, // screen capture requires a secure context on non-localhost origins
  },
}))
