import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' para que funcione en GitHub Pages bajo /ABM-rugby-infantil/
export default defineConfig({
  base: './',
  plugins: [react()],
})
