import type { Logger } from '@inavitas/shared';
import { redis } from './redis.ts';

/** Gateway canlı arayüz bildirim kanalı. */
const CHANNEL = 'ui:translation';

export interface TranslationPublishedEvent {
  locale: string;
  namespace: string;
  version: number;
}

/**
 * Çeviri yayınlandığında bağlı tarayıcı sekmelerine canlı bildirim yayınlar.
 * Redis erişilemezse istek başarısız olmaz, yalnızca loglanır — canlı güncelleme
 * bir "nice to have"dir, API'nin çalışması buna bağımlı değildir.
 */
export async function notifyTranslationPublished(
  events: TranslationPublishedEvent[],
  log: Logger,
): Promise<void> {
  for (const ev of events) {
    try {
      await redis.publish(CHANNEL, JSON.stringify(ev));
    } catch (err) {
      log.error({ err, locale: ev.locale, namespace: ev.namespace }, 'canlı bildirim yayınlanamadı');
    }
  }
}
