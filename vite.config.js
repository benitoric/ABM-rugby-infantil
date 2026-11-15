import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Versión de prueba (DEMO=1 en el proyecto de Vercel de la demo): muestra la
  // franja "Versión de prueba · datos ficticios" (src/demo.jsx)
  define: { __DEMO__: JSON.stringify(process.env.DEMO === '1') },
  server: {
    // en desarrollo, la API corre aparte con: npm run dev:api
    proxy: { '/api': 'http://localhost:3001' },
  },
})
