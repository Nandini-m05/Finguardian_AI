import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// API base URL comes from VITE_API_BASE_URL (.env.local locally,
// Cloudflare Pages environment variable in production).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
})
