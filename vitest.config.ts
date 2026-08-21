import { defineConfig } from 'vitest/config';

/**
 * Tek kök konfigürasyon; tüm workspace'lerdeki testleri toplar.
 * `npm test` kökten her şeyi çalıştırır, `npm test -- outage` ile filtrelersin.
 */
export default defineConfig({
  test: {
    // Kök `test/` klasörü depo geneli denetimler içindir (bkz. test/security-surface.test.ts):
    // tek bir workspace'e ait olmayan, "bu karar her yerde uygulandı mı" testleri.
    include: ['{packages,services,apps}/*/test/**/*.test.ts', 'test/**/*.test.ts'],
    // Altyapı gerektiren (Testcontainers) entegrasyon testleri kapsam dışıdır;
    // şu anki testlerin hepsi saf birim testi, paralel çalışabilir.
    environment: 'node',

    // Servislerin config.ts'i eksik env'de BİLEREK patlıyor (fail-fast).
    // Testler gerçek .env'e bağlı olmamalı — sahte ama şema-geçerli
    // değerleri burada veriyoruz.
    env: {
      NODE_ENV: 'test',
      // baseEnvSchema'nın izin verdiği en sessiz seviye ('silent' yok).
      LOG_LEVEL: 'fatal',
      ACCESS_APP_DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
      TRANSLATION_APP_DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
      JWT_SECRET: 'test-secret-en-az-32-karakter-olmali-tamam',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
    },
  },
});
