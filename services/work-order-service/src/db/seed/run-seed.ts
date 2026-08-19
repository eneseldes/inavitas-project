/**
 * Tek seferlik read-model seed'i. Migration'lar çalıştıktan **ve** `network-service`
 * kendi seed'ini tamamladıktan sonra çalıştırılır.
 */

import { seedNetworkComponentsRo } from './network-components-ro.ts';

const targetUrl = process.env.WORK_ORDER_DATABASE_URL || process.env.WORK_ORDER_APP_DATABASE_URL;
const networkUrl = process.env.NETWORK_APP_DATABASE_URL;

if (!targetUrl) {
  console.error('WORK_ORDER_DATABASE_URL tanımlı değil — kök .env dosyanı kontrol et.');
  process.exit(1);
}
if (!networkUrl) {
  console.error('NETWORK_APP_DATABASE_URL tanımlı değil — read-model kaynağı okunamaz.');
  process.exit(1);
}

async function run(): Promise<void> {
  const start = Date.now();
  try {
    const count = await seedNetworkComponentsRo(targetUrl!, networkUrl!, console.log);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`Seed tamamlandı: ${count} şebeke elemanı, ${duration} sn.`);
    process.exit(0);
  } catch (err) {
    console.error('Seed işlemi sırasında hata oluştu:', err);
    process.exit(1);
  }
}

void run();
