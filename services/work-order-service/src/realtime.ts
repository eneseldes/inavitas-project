import type { Logger } from '@inavitas/shared';
import { redis } from './redis.ts';
import type { WorkOrderRow } from './repository/work-order.repository.ts';

/** Gateway canlı arayüz bildirim kanalı. */
const CHANNEL = 'ui:work-order';

/**
 * İş emri oluştuğunda/güncellendiğinde bağlı tarayıcı sekmelerine canlı bildirim yayınlar.
 * Redis erişilemezse istek başarısız olmaz, yalnızca loglanır — canlı güncelleme
 * bir "nice to have"dir, API'nin çalışması buna bağımlı değildir.
 */
export async function notifyWorkOrderChanged(
  row: Pick<WorkOrderRow, 'id' | 'gisId' | 'status'>,
  log: Logger,
): Promise<void> {
  try {
    await redis.publish(CHANNEL, JSON.stringify({ id: row.id, gisId: row.gisId, status: row.status }));
  } catch (err) {
    log.error({ err, workOrderId: row.id }, 'canlı bildirim yayınlanamadı');
  }
}
