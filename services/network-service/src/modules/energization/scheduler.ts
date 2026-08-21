/**
 * Planlı kesinti zamanlayıcısı.
 *
 * **Sorun:** kesinti kaydı `startedAt` gelecekte olsa bile `STARTED` doğar. Enerjilenme
 * hesabı eskiden tüm `STARTED` satırları okuduğu için "yarın 09:00'da başlayacak" bir bakım
 * kesintisi, kaydedildiği anda şebekeyi karartıyordu (Faz 8.5'te bilinçli sadeleştirme,
 * bkz. `onceden-yapilanlar.md` §10.6/1; bu fazın kaydı §13.4).
 *
 * **Çözüm iki parçalıdır ve ikisi de zorunludur:**
 * 1. Aktif küme `started_at <= now()` ile süzülür (`outage-states.repository.ts`).
 * 2. Sıradaki başlangıç anına bir zamanlayıcı kurulur; o an gelince yeniden hesap tetiklenir.
 *    Yalnız süzme yapılsaydı planlı kesinti **hiç** devreye girmezdi — bir sonraki olay
 *    gelene kadar kimse yeniden hesaplamıyor.
 *
 * Zamanlayıcı **durum tutmaz**: her yeniden hesaptan sonra sıradaki başlangıcı veritabanına
 * yeniden sorar. Böylece iptal edilen, tarihi değiştirilen ya da başka bir örnek tarafından
 * işlenen kesinti kendiliğinden dikkate alınır ve restart sonrası da doğru kurulur.
 */

import type { Logger } from '@inavitas/shared';
import { scheduledOutages } from '../../metrics.ts';
import * as outageStatesRepository from '../../repository/outage-states.repository.ts';

/**
 * `setTimeout`'un 32-bit sınırı (~24,8 gün). Daha uzak bir başlangıç için zamanlayıcı bu
 * sınıra kurulur; uyandığında hiçbir şey başlamamış olur, yeniden hesap sonuçsuz kalır ve
 * kalan süre için kendini yeniden kurar. Aylar sonrasına planlanmış bakım kesintisi bu
 * yüzden kaybolmaz.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Uyanma payı. Zamanlayıcı tam `startedAt` anında ateşlenirse veritabanının `now()`'ı
 * milisaniyelerle geride kalabilir ve `started_at <= now()` süzgeci kesintiyi *yine*
 * dışarıda bırakır — sonsuz bir "bir sonraki başlangıç hâlâ aynı" döngüsü doğardı.
 */
const FIRE_MARGIN_MS = 1_000;

let timer: NodeJS.Timeout | undefined;
let nextFireAt: Date | undefined;

/** Yeniden hesabı tetikleyen geri çağırım — `service.refresh` geçilir (döngüsel içe aktarım olmasın). */
export type RecomputeFn = (logger: Logger) => Promise<unknown>;

/** Sıradaki uyanma anı; `/ready` ve testler için. Bekleyen planlı kesinti yoksa `undefined`. */
export function nextScheduledRecomputeAt(): Date | undefined {
  return nextFireAt;
}

/** Kurulu zamanlayıcıyı iptal eder (kapanış ve yeniden kurulum). */
export function stopScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  nextFireAt = undefined;
}

/**
 * Sıradaki planlı başlangıç için zamanlayıcıyı (yeniden) kurar.
 *
 * Her yeniden hesabın sonunda çağrılır. Hata yutulmaz ama **yükseltilmez de**: zamanlayıcı
 * kurulamadı diye tamamlanmış bir yeniden hesabın geri alınması hiçbir şeyi düzeltmez.
 */
export async function scheduleNextRecompute(logger: Logger, recompute: RecomputeFn): Promise<void> {
  stopScheduler();

  let pending: outageStatesRepository.PendingStarts;
  try {
    pending = await outageStatesRepository.findPendingStarts();
  } catch (err) {
    logger.error({ err }, 'planlı kesinti zamanlayıcısı kurulamadı — sıradaki başlangıç sorgulanamadı');
    return;
  }

  scheduledOutages.set({}, pending.count);

  if (!pending.nextStartAt) return;

  const delayMs = Math.min(Math.max(pending.nextStartAt.getTime() - Date.now(), 0) + FIRE_MARGIN_MS, MAX_TIMEOUT_MS);
  nextFireAt = new Date(Date.now() + delayMs);

  timer = setTimeout(() => {
    logger.info({ startedAt: pending.nextStartAt }, 'planlı kesintinin başlangıcı geldi, enerjilenme yeniden hesaplanıyor');
    // Yeniden hesap kendi sonunda zamanlayıcıyı tekrar kurar; burada zincirlemek gerekmez.
    void recompute(logger).catch((err: unknown) => {
      logger.error({ err }, 'planlı kesinti yeniden hesabı başarısız');
    });
  }, delayMs);

  // Zamanlayıcı süreci ayakta TUTMAZ: kapanışta bekleyen bir planlı kesinti varsa çıkış
  // 24 gün gecikmemeli. Sunucu dinlerken olay döngüsü zaten açıktır.
  timer.unref();

  logger.info(
    { pendingCount: pending.count, nextStartAt: pending.nextStartAt, fireAt: nextFireAt },
    'planlı kesinti zamanlayıcısı kuruldu',
  );
}
