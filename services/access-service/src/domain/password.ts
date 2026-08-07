import bcrypt from 'bcrypt';

/** Bcrypt hash maliyet parametresi (cost factor). */
export const BCRYPT_COST = 12;

/**
 * Zamanlamaya dayalı yan kanal saldırılarını (timing attacks) önlemek için kullanılan sahte hash değeri.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO.aO1J8yZ2xVGxKzLzKzLzKzLzKzLzKz';

/** Parolayı bcrypt algoritması ile hash'ler. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/** Düz metin parolayı hash ile karşılaştırır. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Kullanıcı bulunamasa bile zamanlama eşitliğini sağlamak için sahte hash karşılaştırması yapar.
 */
export async function wastePasswordCompareTime(plain: string): Promise<false> {
  await bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
  return false;
}
