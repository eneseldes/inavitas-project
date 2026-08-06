import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Proje tek bir kök .env dosyası kullanıyor (04-KURULUM.md) — Vite'ın
  // varsayılanı kendi paket kökünde ayrı bir .env aramaktır, onun yerine
  // kök .env'i gösteriyoruz ki VITE_API_URL tek yerden okunsun.
  envDir: path.resolve(import.meta.dirname, '../..'),
  server: {
    port: 5173,
  },
  css: {
    modules: {
      // OutageGrid_actionsCell__a1b2c gibi okunabilir sınıf adları — üretimde
      // debug etmek Tailwind'siz bir projede çok daha kolay olsun diye.
      generateScopedName: '[name]__[local]__[hash:base64:5]',
    },
  },
})
