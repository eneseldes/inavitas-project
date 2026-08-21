import type { Logger } from '@inavitas/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Planlı kesinti zamanlayıcısı — Faz 11.
 *
 * Kesinti kaydı `startedAt` gelecekte olsa bile `STARTED` doğar. Enerjisizlik iki parçayla
 * doğru zamana çekilir: read-model sorgusu `started_at <= now()` süzer, zamanlayıcı da
 * sıradaki başlangıçta yeniden hesabı tetikler. Süzme tek başına olsaydı planlı kesinti
 * **hiç** devreye girmezdi.
 *
 * Repository sahtelenir: bu bir birim testidir, veritabanı gerektirmez (vitest.config.ts'in
 * "altyapı gerektiren testler kapsam dışıdır" kuralı).
 */

vi.mock('../src/repository/outage-states.repository.ts', () => ({
  findPendingStarts: vi.fn(),
}));

const { findPendingStarts } = await import('../src/repository/outage-states.repository.ts');
const { nextScheduledRecomputeAt, scheduleNextRecompute, stopScheduler } = await import(
  '../src/modules/energization/scheduler.ts'
);

const pendingMock = vi.mocked(findPendingStarts);

/** Log çağrılarını yutan sahte logger. */
const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-21T10:00:00.000Z'));
  pendingMock.mockReset();
});

afterEach(() => {
  stopScheduler();
  vi.useRealTimers();
});

describe('scheduleNextRecompute', () => {
  it('bekleyen planlı kesinti yoksa zamanlayıcı kurmaz', async () => {
    pendingMock.mockResolvedValue({ nextStartAt: null, count: 0 });
    const recompute = vi.fn().mockResolvedValue(undefined);

    await scheduleNextRecompute(logger, recompute);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(nextScheduledRecomputeAt()).toBeUndefined();
    expect(recompute).not.toHaveBeenCalled();
  });

  it('başlangıç anı gelince yeniden hesabı tetikler', async () => {
    pendingMock.mockResolvedValue({ nextStartAt: new Date('2026-08-21T10:30:00.000Z'), count: 1 });
    const recompute = vi.fn().mockResolvedValue(undefined);

    await scheduleNextRecompute(logger, recompute);

    // 29 dakika sonra hâlâ sessiz — planlı kesinti erken karartma yapmamalı.
    await vi.advanceTimersByTimeAsync(29 * 60 * 1000);
    expect(recompute).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(recompute).toHaveBeenCalledTimes(1);
  });

  it('başlangıç anından biraz SONRA ateşlenir', async () => {
    // ⚠️ Tam `startedAt` anında ateşlenirse veritabanının `now()`'ı milisaniyelerle geride
    // kalabilir ve `started_at <= now()` süzgeci kesintiyi yine dışarıda bırakır — sonsuz
    // "sıradaki başlangıç hâlâ aynı" döngüsü doğar.
    const startAt = new Date('2026-08-21T10:30:00.000Z');
    pendingMock.mockResolvedValue({ nextStartAt: startAt, count: 1 });

    await scheduleNextRecompute(logger, vi.fn().mockResolvedValue(undefined));

    expect(nextScheduledRecomputeAt()!.getTime()).toBeGreaterThan(startAt.getTime());
  });

  it('başlangıcı geçmiş ama hâlâ bekleyen kayıt için hemen ateşlenir', async () => {
    // Süreç uykudayken saat ilerlemişse (restart, askıya alma) gecikme negatife düşer.
    pendingMock.mockResolvedValue({ nextStartAt: new Date('2026-08-21T09:00:00.000Z'), count: 1 });
    const recompute = vi.fn().mockResolvedValue(undefined);

    await scheduleNextRecompute(logger, recompute);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(recompute).toHaveBeenCalledTimes(1);
  });

  it('çok uzak bir başlangıç setTimeout sınırına kurulur ve kaybolmaz', async () => {
    // `setTimeout` 32-bit sınırı ~24,8 gün; aylar sonrasına planlanmış bakım kesintisi
    // sınıra kurulur, uyandığında sonuçsuz bir hesap yapılır ve kendini yeniden kurar.
    const farFuture = new Date('2027-08-21T10:00:00.000Z');
    pendingMock.mockResolvedValue({ nextStartAt: farFuture, count: 1 });

    await scheduleNextRecompute(logger, vi.fn().mockResolvedValue(undefined));

    const fireAt = nextScheduledRecomputeAt()!;
    expect(fireAt.getTime()).toBeLessThan(farFuture.getTime());
    expect(fireAt.getTime() - Date.now()).toBeLessThanOrEqual(2_147_483_647);
  });

  it('yeniden kurulum önceki zamanlayıcıyı iptal eder', async () => {
    // Planlı kesinti iptal edilirse ya da tarihi değişirse eski zamanlayıcı ateşlenmemeli.
    const recompute = vi.fn().mockResolvedValue(undefined);

    pendingMock.mockResolvedValue({ nextStartAt: new Date('2026-08-21T10:10:00.000Z'), count: 1 });
    await scheduleNextRecompute(logger, recompute);

    pendingMock.mockResolvedValue({ nextStartAt: null, count: 0 });
    await scheduleNextRecompute(logger, recompute);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(recompute).not.toHaveBeenCalled();
  });

  it('sorgu patlarsa yükseltmez — tamamlanmış hesap geri alınmaz', async () => {
    pendingMock.mockRejectedValue(new Error('bağlantı yok'));

    await expect(scheduleNextRecompute(logger, vi.fn())).resolves.toBeUndefined();
    expect(nextScheduledRecomputeAt()).toBeUndefined();
  });

  it('yeniden hesap patlarsa loglanır, süreç düşmez', async () => {
    pendingMock.mockResolvedValue({ nextStartAt: new Date('2026-08-21T10:01:00.000Z'), count: 1 });
    const recompute = vi.fn().mockRejectedValue(new Error('graf yüklenmedi'));

    await scheduleNextRecompute(logger, recompute);
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

    expect(recompute).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('stopScheduler', () => {
  it('kurulu zamanlayıcıyı iptal eder', async () => {
    pendingMock.mockResolvedValue({ nextStartAt: new Date('2026-08-21T10:05:00.000Z'), count: 1 });
    const recompute = vi.fn().mockResolvedValue(undefined);

    await scheduleNextRecompute(logger, recompute);
    stopScheduler();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(recompute).not.toHaveBeenCalled();
    expect(nextScheduledRecomputeAt()).toBeUndefined();
  });
});
