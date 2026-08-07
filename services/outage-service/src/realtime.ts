import type { Logger } from '@inavitas/shared';
import { redis } from './redis.ts';
import type { OutageRow } from './repository/outage.repository.ts';

/** Gateway'in SSE'ye çevirdiği canlı arayüz kanalı (03-YOL-HARITASI Faz 5 adım 3). */
const CHANNEL = 'ui:outage';

/**
 * Kesinti oluştuğunda/güncellendiğinde bağlı tarayıcı sekmelerine canlı bildirim yayınlar.
 * Redis erişilemezse istek başarısız olmaz, yalnızca loglanır — canlı güncelleme
 * bir "nice to have"dir, API'nin çalışması buna bağımlı değildir.
 */
export async function notifyOutageChanged(row: Pick<OutageRow, 'id' | 'gisId' | 'status'>, log: Logger): Promise<void> {
  try {
    await redis.publish(CHANNEL, JSON.stringify({ id: row.id, gisId: row.gisId, status: row.status }));
  } catch (err) {
    log.error({ err, outageId: row.id }, 'canlı bildirim yayınlanamadı');
  }
}
