import type { SQL } from 'drizzle-orm';
import { PgDialect, pgTable, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, type AuthenticatedUser } from '../src/auth.ts';
import { scopeFilter, scopeFilterAnyUnit, scopeFilterUnitTree, scopeKeys, scopeSignature } from '../src/scope.ts';

/**
 * Kapsam süzgecinin **SQL'i** — Faz 9'un güvenlik testlerinden "kapsam dışı veri tile'a hiç
 * girmiyor" ve "`/outages/map` yanıtına girmiyor" maddelerinin otomatik karşılığı.
 *
 * Dört okuma yolu da (liste · tile · `/outages/map` · `/work-orders/map`) bu tek fonksiyondan
 * geçiyor; süzgecin **buradaki** doğruluğu hepsini birden ilgilendirir. Bağlanmanın
 * unutulmadığı ise ayrı bir testin konusu (`test/security-surface.test.ts`).
 */

const table = pgTable('outages', {
  unitPath: text('unit_path').notNull(),
  unitPaths: text('unit_paths'),
});

const dialect = new PgDialect();

function userWith(scopes: Record<string, string[]>): AuthenticatedUser {
  return { id: 'u1', email: 'a@b.c', roles: [], permissions: Object.keys(scopes), scopes };
}

/** Üretilen parçayı gerçek Postgres lehçesiyle metne çevirir — elle ayrıştırma yapılmaz. */
function inspect(fragment: SQL | undefined): { sql: string; params: unknown[] } {
  if (!fragment) return { sql: '', params: [] };
  const query = dialect.sqlToQuery(fragment);
  return { sql: query.sql, params: query.params };
}

describe('scopeFilter', () => {
  it('kapsamı ltree alt-ağaç operatörüyle bağlar', () => {
    const { sql, params } = inspect(scopeFilter(userWith({ 'outage:read': ['TR.06.020'] }), table.unitPath, PERMISSIONS.OUTAGE_READ));

    expect(sql).toContain('<@ ANY(');
    expect(sql).toContain('::ltree[]');
    // 🚨 Yollar TEK bir dizi parametresi olarak bağlanmalı. Drizzle şablonda gördüğü diziyi
    // virgüllü ayrı parametrelere açar ve tek elemanlı listede `::ltree[]` cast'i "malformed
    // array literal" ile patlar — bu yüzden `sql.param` kullanılıyor.
    expect(params).toEqual([['TR.06.020']]);
  });

  it('kapsamsız kullanıcıya hiçbir satır dönmez', () => {
    // ⚠️ En kritik varsayılan: kapsam bilinmiyorsa "sınırsız" değil, "hiçbir şey".
    const { sql } = inspect(scopeFilter(userWith({}), table.unitPath, PERMISSIONS.OUTAGE_READ));
    expect(sql).toBe('false');
  });

  it('başka bir iznin kapsamı bu izne sızmaz', () => {
    const user = userWith({ 'outage:read': ['TR.06'], 'outage:write': ['TR.06.020'] });

    expect(inspect(scopeFilter(user, table.unitPath, PERMISSIONS.OUTAGE_WRITE)).params).toEqual([['TR.06.020']]);
    expect(inspect(scopeFilter(user, table.unitPath, PERMISSIONS.OUTAGE_READ)).params).toEqual([['TR.06']]);
  });
});

describe('scopeFilterAnyUnit', () => {
  it('elemanın değdiği tüm birimleri de kapsar', () => {
    // Bir OG hattı üç mahalleye birden değebilir; birincil birimi kapsam dışıysa bile
    // kullanıcının bölgesine giriyorsa okunabilmeli.
    const { sql } = inspect(
      scopeFilterAnyUnit(
        userWith({ 'network:read': ['TR.06.020'] }),
        table.unitPath,
        table.unitPaths,
        PERMISSIONS.NETWORK_READ,
      ),
    );

    expect(sql).toContain('unit_path');
    expect(sql).toContain('unit_paths');
    expect(sql).toContain(' OR ');
    // NULL `unit_paths` kolonunun karşılaştırmayı sessizce NULL yapmaması için açık kontrol.
    expect(sql).toContain('IS NOT NULL');
  });

  it('kapsamsız kullanıcı burada da hiçbir satır görmez', () => {
    expect(inspect(scopeFilterAnyUnit(userWith({}), table.unitPath, table.unitPaths, PERMISSIONS.NETWORK_READ)).sql).toBe('false');
  });
});

describe('scopeFilterUnitTree', () => {
  it('kapsamın altını VE atalarını geçirir', () => {
    // Yenimahalle sorumlusu Ankara'yı görmeli, yoksa ağaç köksüz kalır ve haritada il
    // sınırı hiç çizilmez. İdari sınır kamuya açık bir bilgidir, şebeke verisi değil.
    const { sql } = inspect(
      scopeFilterUnitTree(userWith({ 'network:read': ['TR.06.020'] }), table.unitPath, PERMISSIONS.NETWORK_READ),
    );

    expect(sql).toContain('<@ ANY(');
    expect(sql).toContain('@> ANY(');
  });
});

describe('scopeSignature', () => {
  it('aynı kapsamdaki iki kullanıcı aynı imzayı üretir', () => {
    // Tile cache anahtarı bu imzadan türer: imza kullanıcı kimliğine bağlansaydı cache
    // her kullanıcı için baştan dolardı; kapsama bağlı olmasaydı kapsam sızardı.
    const a = scopeSignature(userWith({ 'network:read': ['TR.06.012', 'TR.06.020'] }), PERMISSIONS.NETWORK_READ);
    const b = scopeSignature(userWith({ 'network:read': ['TR.06.020', 'TR.06.012'] }), PERMISSIONS.NETWORK_READ);

    expect(a).toBe(b);
  });

  it('farklı kapsam farklı imza demektir', () => {
    const a = scopeSignature(userWith({ 'network:read': ['TR.06'] }), PERMISSIONS.NETWORK_READ);
    const b = scopeSignature(userWith({ 'network:read': ['TR.06.020'] }), PERMISSIONS.NETWORK_READ);

    expect(a).not.toBe(b);
  });

  it('kapsamsız kullanıcının imzası da ayrıdır', () => {
    expect(scopeSignature(userWith({}), PERMISSIONS.NETWORK_READ)).toBe('none');
  });
});

describe('scopeKeys', () => {
  it('access-service ile gateway aynı Redis anahtarlarını kullanır', () => {
    // İki servis arasındaki tek sözleşme; iki yerde ayrı yazılırsa biri değişir, diğeri
    // kalır ve gateway kapsamı hiç bulamaz (her isteği kapsamsız sanar).
    expect(scopeKeys.version('u1')).toBe('scope:ver:u1');
    expect(scopeKeys.reference('abc')).toBe('scope:ref:abc');
  });
});
