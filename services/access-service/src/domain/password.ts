import bcrypt from 'bcrypt';

/**
 * Parola hash'leme (FR-1.2).
 *
 * bcryptjs DEĞİL bcrypt: bcryptjs saf JS ve belirgin şekilde yavaş, bu da
 * login'i yavaşlatmanın yanı sıra DoS yüzeyi açar.
 */

/** SRS: cost ≥ 10. 12, 2026 donanımında ~250ms — kullanıcıyı yormaz, saldırganı yorar. */
export const BCRYPT_COST = 12;

/**
 * Kullanıcı bulunamadığında karşılaştırılacak sahte hash.
 *
 * Timing attack koruması: e-posta yoksa bcrypt.compare'i atlarsak cevap
 * belirgin şekilde daha hızlı döner ve saldırgan hangi e-postaların kayıtlı
 * olduğunu ölçerek çıkarabilir. Bu hash ile karşılaştırma yapıp aynı
 * hesaplama maliyetini ödüyoruz.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO.aO1J8yZ2xVGxKzLzKzLzKzLzKzLzKz';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Kullanıcı bulunamasa bile çalıştırılacak sahte doğrulama.
 * Her zaman false döner; tek amacı zamanı eşitlemek.
 */
export async function wastePasswordCompareTime(plain: string): Promise<false> {
  await bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
  return false;
}
