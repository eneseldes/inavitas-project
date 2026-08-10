import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(import.meta.dirname, '../..'),
  server: {
    port: 5173,
    host: '0.0.0.0',
    // nginx'in prod'da yaptığını dev'de vite yapar: /api gateway'e proxy'lenir (tek origin).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        ws: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Connection', 'keep-alive');
          });
        },
      },
    },
  },
  css: {
    modules: {
      // OutageGrid_actionsCell__a1b2c gibi okunabilir sınıf adları — üretimde
      generateScopedName: '[name]__[local]__[hash:base64:5]',
    },
  },
})
