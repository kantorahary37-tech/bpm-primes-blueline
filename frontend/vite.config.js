import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import http from 'http'

const apiTarget = process.env.VITE_API_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            proxyReq.setHeader('host', 'localhost:8000')
          })
        },
      }
    }
  }
})
