/**
 * Geçerli refresh token'ların kaydı (FR-1.3 rotation, FR-1.4 logout).
 *
 * JWT'nin kendisi durumsuzdur — "bu token iptal edildi" bilgisini token'ın
 * içine yazamayız. Bu yüzden geçerli olanların jti listesini ayrıca tutuyoruz.
 *
 * ⚠️ TODO (Faz 5): Burası Redis'e taşınacak. Bellekteki Map iki yerde yetersiz:
 *   1. Servis yeniden başlayınca tüm oturumlar düşer.
 *   2. access-service 2+ instance çalıştığında her instance kendi Map'ini
 *      tutar; rotation bir instance'ta olur, sonraki istek diğerine gider
 *      ve token "bilinmiyor" diye reddedilir.
 * Redis'te `SETEX refresh:{jti} <ttl> <userId>` ile TTL'i Redis yönetir,
 * süresi dolanı temizleyen bir job yazmaya gerek kalmaz (02-MIMARI 2.5).
 */

export interface RefreshRecord {
  userId: string;
  expiresAt: Date;
}

export interface RefreshTokenStore {
  save(jti: string, record: RefreshRecord): Promise<void>;
  get(jti: string): Promise<RefreshRecord | undefined>;
  revoke(jti: string): Promise<void>;
  /** Kullanıcının tüm oturumlarını kapatır (parola değişimi, hesap kilidi). */
  revokeAllForUser(userId: string): Promise<void>;
}

export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private readonly records = new Map<string, RefreshRecord>();

  async save(jti: string, record: RefreshRecord): Promise<void> {
    this.records.set(jti, record);
  }

  async get(jti: string): Promise<RefreshRecord | undefined> {
    const record = this.records.get(jti);
    if (!record) return undefined;

    // Süresi dolmuşsa yok say ve temizle. JWT doğrulaması zaten süreyi
    // kontrol ediyor; bu, Map'in sınırsız büyümesini engelleyen taraf.
    if (record.expiresAt.getTime() <= Date.now()) {
      this.records.delete(jti);
      return undefined;
    }

    return record;
  }

  async revoke(jti: string): Promise<void> {
    this.records.delete(jti);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [jti, record] of this.records) {
      if (record.userId === userId) this.records.delete(jti);
    }
  }
}

export const refreshTokenStore: RefreshTokenStore = new InMemoryRefreshTokenStore();
