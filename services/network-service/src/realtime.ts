import type { Logger } from '@inavitas/shared';
import { redis } from './redis.ts';

/** Gateway canlı arayüz bildirim kanalı — enerjilenme değişimleri. */
const ENERGIZATION_CHANNEL = 'ui:energization';

export interface EnergizationNotification {
  version: number;
  deEnergizedCount: number;
}

/**
 * Enerjilenme durumu değiştiğinde bağlı tarayıcı sekmelerine canlı bildirim yayınlar.
 *
 * Mesaj **veri taşımaz**, yalnız "değişti" der: istemci kendi görünüm penceresi için yeniden
 * sorgular. Binlerce kimliği SSE'den geçirmek hem gereksiz (ekranda olmayanın durumu
 * yazılamaz) hem pahalıdır. `useOutageStream`'in bugünkü davranışının aynısıdır.
 *
 * Redis erişilemezse istek başarısız olmaz, yalnızca loglanır — canlı güncelleme bir
 * "nice to have"dir, hesabın kendisi buna bağımlı değildir.
 */
export async function notifyEnergizationChanged(
  notification: EnergizationNotification,
  log: Logger,
): Promise<void> {
  try {
    await redis.publish(ENERGIZATION_CHANNEL, JSON.stringify(notification));
  } catch (err) {
    log.error({ err, version: notification.version }, 'enerjilenme canlı bildirimi yayınlanamadı');
  }
}
