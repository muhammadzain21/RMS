import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use relative paths in production so Electron can load assets via file://
  // Without this, dist/index.html will point to "/assets/..." which breaks in packaged apps
  base: './',
  server: {
    host: true,
    port: 5173,
    // If 5173 is busy, pick the next available port automatically
    strictPort: false,
  },
})
