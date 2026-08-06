/**
 * Kesinti alan kuralları — SRS FR-2.6, FR-2.7.
 *
 * Saf fonksiyonlar; DB'ye veya HTTP'ye dokunmaz.
 */

/** `endedAt - startedAt`i dakikaya çevirir. DB'de tutulmaz, response'a eklenir. */
export function computeDurationMinutes(startedAt: Date, endedAt: Date | null): number | null {
  if (!endedAt) return null;
  return Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000);
}
