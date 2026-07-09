import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Serve over HTTPS when the VITE_HTTPS env var is set (needed for phone GPS).
// Use the "dev:https" npm script which sets it for you.
const useHttps = process.env.VITE_HTTPS === '1'

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    port: 5173,
    host: true,          // expose on the LAN so a phone on the same WiFi can connect
    proxy: { '/api': 'http://localhost:8002' },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: { '/api': 'http://localhost:8002' },
  },
})
