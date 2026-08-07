export type CheckStatus = 'up' | 'down';

export interface ReadinessResult {
  ready: boolean;
  checks: Record<string, CheckStatus>;
}

/**
 * Bağımlılık kontrollerini eşzamanlı çalıştırarak sistemin hazır olma (readiness) durumunu kontrol eder.
 * Her bir servis (veritabanı, mesaj kuyruğu, önbellek) için canlı bağlantı testi yapılır.
 */
export async function runReadinessChecks(checks: Record<string, () => Promise<unknown>>): Promise<ReadinessResult> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      try {
        await check();
        return [name, 'up'] as const;
      } catch {
        return [name, 'down'] as const;
      }
    }),
  );

  return {
    ready: entries.every(([, status]) => status === 'up'),
    checks: Object.fromEntries(entries),
  };
}
