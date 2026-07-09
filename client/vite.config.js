import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import mkcert from 'vite-plugin-mkcert'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), mkcert()],
  server: {
    host: true, // listen on LAN, not just localhost, so phones can reach the dev server
    https: true, // screen capture requires a secure context on non-localhost origins
  },
})
