import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,               // listen on all interfaces so a phone on the same WiFi can reach it
    proxy: {
      '/api': 'http://localhost:8002',
    },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/api': 'http://localhost:8002',
    },
  },
})
