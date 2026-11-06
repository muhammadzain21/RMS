import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Absolute asset paths so browser reloads on nested routes (/staff/...) still
  // load /assets/*.js correctly. Electron production loads http://127.0.0.1:5000
  // (not file://), so "/" works for both desktop and LAN browser access.
  base: '/',
  server: {
    host: true,
    port: 5173,
    // If 5173 is busy, pick the next available port automatically
    strictPort: false,
  },
})
