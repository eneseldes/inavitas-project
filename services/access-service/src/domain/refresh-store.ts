/**
 * Aktif refresh token (jti) kaydı arayüzü ve bellek içi (in-memory) uygulaması.
 */

export interface RefreshRecord {
  userId: string;
  expiresAt: Date;
}

export interface RefreshTokenStore {
  save(jti: string, record: RefreshRecord): Promise<void>;
  get(jti: string): Promise<RefreshRecord | undefined>;
  revoke(jti: string): Promise<void>;
  /** Kullanıcının tüm aktif oturumlarını (refresh token'larını) iptal eder. */
  revokeAllForUser(userId: string): Promise<void>;
}

/** Bellek içi refresh token deposu. */
export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private readonly records = new Map<string, RefreshRecord>();

  async save(jti: string, record: RefreshRecord): Promise<void> {
    this.records.set(jti, record);
  }

  async get(jti: string): Promise<RefreshRecord | undefined> {
    const record = this.records.get(jti);
    if (!record) return undefined;

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
