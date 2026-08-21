/**
 * Tek seferlik idari birim read-model seed'i.
 *
 * `network-service`'in kendi seed'i tamamlandıktan **sonra** çalıştırılır; kaynağı
 * `network_db`'dir. Ana seed akışına dahil edilmez: o akış `network_db` henüz
 * kurulmamışken de çalışabilmelidir.
 */

import { seedUnitsRo } from './units-ro.ts';

const targetUrl = process.env.ACCESS_DATABASE_URL;
const networkUrl = process.env.NETWORK_APP_DATABASE_URL || process.env.NETWORK_DATABASE_URL;

if (!targetUrl) {
  console.error('ACCESS_DATABASE_URL tanımlı değil — kök .env dosyanı kontrol et.');
  process.exit(1);
}
if (!networkUrl) {
  console.error('NETWORK_APP_DATABASE_URL tanımlı değil — birim ağacı kaynağı okunamaz.');
  process.exit(1);
}

async function run(): Promise<void> {
  const start = Date.now();
  try {
    const count = await seedUnitsRo(targetUrl!, networkUrl!, console.log);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`Seed tamamlandı: ${count} idari birim, ${duration} sn.`);
    process.exit(0);
  } catch (err) {
    console.error('Seed işlemi sırasında hata oluştu:', err);
    process.exit(1);
  }
}

void run();
