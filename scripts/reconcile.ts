/**
 * Veritabanları arası uzlaştırma (reconciliation) görevi.
 * Kesinti ve iş emri veritabanlarındaki çift yönlü ilişkilerin tutarlılığını kontrol eder.
 *
 * Tutarsızlık tespit edilirse çıkış kodu 1 döner.
 */
import { Client } from 'pg';

interface ReconciliationReport {
  checkedAt: string;
  outagesWithMissingWorkOrder: string[];
  workOrdersWithMissingOutage: string[];
  totalMismatches: number;
}

async function fetchLinks(databaseUrl: string, table: string, linkColumn: string): Promise<Map<string, string>> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const { rows } = await client.query<{ id: string; link_id: string }>(
      `SELECT id, ${linkColumn} AS link_id FROM ${table} WHERE ${linkColumn} IS NOT NULL`,
    );
    return new Map(rows.map((row) => [row.id, row.link_id]));
  } finally {
    await client.end();
  }
}

async function reconcile(outageDatabaseUrl: string, workOrderDatabaseUrl: string): Promise<ReconciliationReport> {
  const [outageLinks, workOrderLinks] = await Promise.all([
    fetchLinks(outageDatabaseUrl, 'outages', 'work_order_id'),
    fetchLinks(workOrderDatabaseUrl, 'work_orders', 'outage_id'),
  ]);

  const knownWorkOrderIds = new Set(workOrderLinks.keys());
  const knownOutageIds = new Set(outageLinks.keys());

  const outagesWithMissingWorkOrder = [...outageLinks.entries()]
    .filter(([, workOrderId]) => !knownWorkOrderIds.has(workOrderId))
    .map(([outageId]) => outageId);

  const workOrdersWithMissingOutage = [...workOrderLinks.entries()]
    .filter(([, outageId]) => !knownOutageIds.has(outageId))
    .map(([workOrderId]) => workOrderId);

  return {
    checkedAt: new Date().toISOString(),
    outagesWithMissingWorkOrder,
    workOrdersWithMissingOutage,
    totalMismatches: outagesWithMissingWorkOrder.length + workOrdersWithMissingOutage.length,
  };
}

async function main(): Promise<void> {
  const outageDatabaseUrl = process.env.OUTAGE_APP_DATABASE_URL;
  const workOrderDatabaseUrl = process.env.WORK_ORDER_APP_DATABASE_URL;

  if (!outageDatabaseUrl || !workOrderDatabaseUrl) {
    console.error('OUTAGE_APP_DATABASE_URL ve WORK_ORDER_APP_DATABASE_URL ortam değişkenleri gerekli.');
    process.exitCode = 1;
    return;
  }

  const report = await reconcile(outageDatabaseUrl, workOrderDatabaseUrl);
  console.log(JSON.stringify(report, null, 2));

  if (report.totalMismatches > 0) process.exitCode = 1;
}

await main();
