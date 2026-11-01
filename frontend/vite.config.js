import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev only: proxy API calls to the local FastAPI server.
    // In production the FastAPI app serves this build on the same origin.
    proxy: { '/api': 'http://localhost:8000' },
  },
})
