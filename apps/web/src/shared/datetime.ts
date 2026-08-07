/** Date nesnesini `<input type="datetime-local">` ile uyumlu yerel saat formatına dönüştürür. */
export function toDateTimeLocalInput(date: Date): string {
  const localMs = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(localMs).toISOString().slice(0, 16);
}

/** Backend'den gelen UTC ISO string'i (`startedAt`/`endedAt`) input değerine çevirir. */
export function isoToDateTimeLocalInput(iso: string | null | undefined): string {
  return iso ? toDateTimeLocalInput(new Date(iso)) : '';
}
