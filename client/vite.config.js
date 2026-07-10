import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const plugins = [react(), tailwindcss()]

  // mkcert only provides the dev-server HTTPS cert, and it drags in undici
  // which crashes the CI build (webidl.util.markAsUncloneable is not a
  // function). Import it dynamically so it's never loaded during a build.
  if (command === 'serve') {
    const mkcert = (await import('vite-plugin-mkcert')).default
    plugins.push(mkcert())
  }

  return {
    // GitHub Pages serves the app under /<repo>/, so production assets and
    // routes must be prefixed with it. Dev stays at root. The Android app
    // (Capacitor) serves the same dist/ from its own local WebView root, not
    // under /Glimpse/, so it needs CAPACITOR_BUILD=1 to force root instead.
    base: command === 'build' && !process.env.CAPACITOR_BUILD ? '/Glimpse/' : '/',
    plugins,
    server: {
      host: true, // listen on LAN, not just localhost, so phones can reach the dev server
      https: true, // screen capture requires a secure context on non-localhost origins
    },
  }
})
