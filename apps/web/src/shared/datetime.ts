/**
 * `<input type="datetime-local">` yerel saati (timezone bilgisi olmadan)
 * gösterir/kabul eder — tarayıcı bunu KULLANICININ yerel saati olarak yorumlar.
 *
 * `date.toISOString()` ise UTC döner. İkisini karıştırmak ("UTC'yi yerelmiş
 * gibi input'a bas") saat dilimi kadar (TR'de 3 saat) kayan bir hataya yol
 * açar — `getTimezoneOffset()`i çıkarıp ISO'ya çevirmek, "UTC saat"i değil
 * "yerel saat, UTC formatında yazılmış" string'i üretir; input'un beklediği
 * tam olarak budur.
 */
export function toDateTimeLocalInput(date: Date): string {
  const localMs = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(localMs).toISOString().slice(0, 16);
}

/** Backend'den gelen UTC ISO string'i (`startedAt`/`endedAt`) input değerine çevirir. */
export function isoToDateTimeLocalInput(iso: string | null | undefined): string {
  return iso ? toDateTimeLocalInput(new Date(iso)) : '';
}
