import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Configuration de Vite pour React + Tailwind CSS
export default defineConfig({
  plugins: [
    react(), // Plugin React pour Vite
    tailwindcss(), // Plugin Tailwind CSS v4 (plus besoin de config tailwind.config.js)
  ],
  server: {
    port: 3000, // Port du frontend (différent du backend 8000)
    proxy: {
      // Proxy API pour éviter les problèmes CORS en dev
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
