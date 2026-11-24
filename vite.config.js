import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Absolute asset paths so browser reloads on nested routes (/staff/...) still
  // load /assets/*.js correctly. Electron production loads http://127.0.0.1:5000
  // (not file://), so "/" works for both desktop and LAN browser access.
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    host: true,
    port: 5173,
    // If 5173 is busy, pick the next available port automatically
    strictPort: false,
  },
})
