/** Kesinti başlangıç ve bitiş zamanına göre kesinti süresini dakika olarak hesaplar. */
export function computeDurationMinutes(startedAt: Date, endedAt: Date | null): number | null {
  if (!endedAt) return null;
  return Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000);
}
