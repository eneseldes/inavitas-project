/**
 * Tek seferlik aktif kesinti read-model seed'i.
 *
 * **En son** çalıştırılır: migration'lar, `network-service`'in kendi seed'i **ve**
 * `outage-service`'in seed'i tamamlandıktan sonra. Kaynağı `outage_db`'dir.
 *
 * Ana seed akışına (`run-seed.ts`) dahil edilmez: o akış `outage_db` henüz kurulmamışken
 * de çalışabilmelidir.
 */

import { seedOutageStatesRo } from './05-outage-states-ro.ts';

const targetUrl = process.env.NETWORK_DATABASE_URL || process.env.NETWORK_APP_DATABASE_URL;
const outageUrl = process.env.OUTAGE_APP_DATABASE_URL || process.env.OUTAGE_DATABASE_URL;

if (!targetUrl) {
  console.error('NETWORK_DATABASE_URL tanımlı değil — kök .env dosyanı kontrol et.');
  process.exit(1);
}
if (!outageUrl) {
  console.error('OUTAGE_APP_DATABASE_URL tanımlı değil — read-model kaynağı okunamaz.');
  process.exit(1);
}

async function run(): Promise<void> {
  const start = Date.now();
  try {
    const count = await seedOutageStatesRo(targetUrl!, outageUrl!, console.log);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`Seed tamamlandı: ${count} aktif kesinti, ${duration} sn.`);
    process.exit(0);
  } catch (err) {
    console.error('Seed işlemi sırasında hata oluştu:', err);
    process.exit(1);
  }
}

void run();
