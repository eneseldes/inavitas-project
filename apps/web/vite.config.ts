import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(import.meta.dirname, '../..'),
  server: {
    port: 5173,
  },
  css: {
    modules: {
      // OutageGrid_actionsCell__a1b2c gibi okunabilir sınıf adları — üretimde
      generateScopedName: '[name]__[local]__[hash:base64:5]',
    },
  },
})
