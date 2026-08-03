import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // en desarrollo, la API corre aparte con: npm run dev:api
    proxy: { '/api': 'http://localhost:3001' },
  },
})
