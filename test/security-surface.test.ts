import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Depo geneli yüzey denetimi: (1) sökülen özellikler geri sızmıyor mu, (2) kapsam süzgeci
 * dört okuma yoluna da bağlı mı. Birim testinin göremediği şey — kararın kod genelinde
 * uygulanmış olması. Gerekçe: `onceden-yapilanlar.md` §12.2.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Denetim dışı: göç dosyaları (`0005_drop_gis_id.sql` kolonu silen göç olduğu için `gis_id`
// içermek zorunda) ve test klasörleri (yasaklı sözcüğün geçmesi orada yokluk kanıtıdır).
const IGNORED_PATH = /(^|\/)(drizzle|dist|node_modules|test)\//;

const SOURCE_EXTENSIONS = /\.(ts|tsx|scss|json)$/;

function trackedSourceFiles(): string[] {
  const output = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' });
  return output
    .split('\n')
    .filter(Boolean)
    .filter((path) => SOURCE_EXTENSIONS.test(path))
    .filter((path) => !IGNORED_PATH.test(path));
}

// Yorum satırları elenir: denetlenen kodun kendisidir, o kodu anlatan tarihçe değil.
function codeLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*') && !line.startsWith('--'));
}

interface Occurrence {
  file: string;
  line: string;
}

function findToken(token: string): Occurrence[] {
  const hits: Occurrence[] = [];

  for (const file of trackedSourceFiles()) {
    for (const line of codeLines(readFileSync(resolve(repoRoot, file), 'utf8'))) {
      if (line.includes(token)) hits.push({ file, line });
    }
  }

  return hits;
}

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('sökülen yüzey geri gelmiyor', () => {
  it.each([
    ['outage:write-high-impact', 'Faz 9 — yüksek etkili kesinti izni kaldırıldı'],
    ['assertHighImpactAllowed', 'Faz 9 — izin kapısı kaldırıldı'],
    ['HIGH_IMPACT_TOPOLOGY_LEVEL', 'Faz 9 — eşik sabiti kaldırıldı'],
    ['HighImpactForbiddenError', 'Faz 9 — hata sınıfı kaldırıldı'],
    ['highImpact', 'Faz 9 — DTO alanı, arayüz dalı ve çeviri anahtarları kaldırıldı'],
  ])('%s kodda yok (%s)', (token) => {
    expect(findToken(token)).toEqual([]);
  });

  it.each([
    ['network:switch', 'Faz 10 — manevra izni'],
    ['switching_operations', 'Faz 10 — manevra günlüğü tablosu'],
    ['switchingOperations', 'Faz 10 — manevra günlüğü tablosu'],
    ['normally_open', 'Faz 10 — normalde açık bayrağı'],
    ['normallyOpen', 'Faz 10 — normalde açık bayrağı'],
    ['load_break', 'Faz 10 — yük kesme bayrağı'],
    ['loadBreak', 'Faz 10 — yük kesme bayrağı'],
    ['NodeFlag.NormallyOpen', 'Faz 10 — graf biti'],
    ['permission.network.switch', 'Faz 10 — çeviri anahtarı'],
  ])('%s kodda yok (%s)', (token) => {
    expect(findToken(token)).toEqual([]);
  });

  it.each([
    ['gis_id', 'Faz 6 göçünün son adımı — kolon düşürüldü'],
    ['gisId', 'Faz 6 göçünün son adımı — API alanı kaldırıldı'],
  ])('%s kodda yok (%s)', (token) => {
    // ⚠️ Kesinti/iş emri artık `cbsId` taşır ve o alan var olan bir şebeke elemanına
    // çözülür. Eski alan geri gelirse doğrulamasız kimlik de geri gelir ("asdasd" kabul).
    expect(findToken(token)).toEqual([]);
  });

  it('rol paneli jenerik "… Modülü" kutusuna düşmüyor', () => {
    // Modül grubu izin kodunun önekinden TÜRETİLMEZ, izne ait bir alandır
    // (bkz. `onceden-yapilanlar.md` §12.3).
    expect(findToken('MODULE_LABEL_FALLBACKS')).toEqual([]);
    expect(findToken('role.module.generic')).toEqual([]);
  });

  it('kesici birleştirmesinden kalan eski tipler geri gelmedi', () => {
    // Safha 0'da beş şalt tipi tek `BREAKER` tipine indi; eski tipler veri setinde yok.
    expect(findToken("'DISCONNECTOR'")).toEqual([]);
    expect(findToken("'RECLOSER'")).toEqual([]);
  });
});

describe('kapsam süzgeci dört okuma yolunun hepsine bağlı', () => {
  it('kesinti liste ve harita uçları aynı süzgeçten geçer', () => {
    const controller = read('services/outage-service/src/http/controllers/outage.controller.ts');

    // Tek `toFilters` iki ucu birden besliyor; süzgeç orada, filtrelerin yanında duruyor.
    expect(controller).toContain('scopeFilter(user, outages.unitPath, PERMISSIONS.OUTAGE_READ)');
    expect(controller).toContain('toFilters(query, req.user)');
  });

  it('iş emri liste ve harita uçları aynı süzgeçten geçer', () => {
    const controller = read('services/work-order-service/src/http/controllers/work-order.controller.ts');

    expect(controller).toContain('scopeFilter(');
    expect(controller).toContain('PERMISSIONS.WORKORDER_READ');
  });

  it('repository süzgeci gerçekten WHERE\'e ekliyor', () => {
    // Controller `scope` doldursa da repository koşullara eklemezse süzgeç sessizce yok sayılır.
    for (const path of [
      'services/outage-service/src/repository/outage.repository.ts',
      'services/work-order-service/src/repository/work-order.repository.ts',
      'services/network-service/src/repository/components.repository.ts',
    ]) {
      expect(read(path)).toContain('if (filters.scope) conditions.push(filters.scope);');
    }
  });

  it('harita uçları liste ile aynı koşul kurucusunu kullanıyor', () => {
    // Ayrı koşul kurucu olsaydı biri değişir diğeri kalırdı — liste/harita tutarsızlaşırdı.
    for (const path of [
      'services/outage-service/src/repository/outage.repository.ts',
      'services/work-order-service/src/repository/work-order.repository.ts',
    ]) {
      const repo = read(path);
      const listForMap = repo.slice(repo.indexOf('export async function listForMap'));
      expect(listForMap).toContain('buildConditions(filters)');
    }
  });

  it('tekil okuma da kapıdan geçer — liste süzgeci bir yetki kanıtı değildir', () => {
    // Kimlik doğrudan istenebilir; `/impact`, `/cascade`, `/history` hep tekil kimlikle çağrılır.
    for (const path of [
      'services/outage-service/src/http/controllers/outage.controller.ts',
      'services/work-order-service/src/http/controllers/work-order.controller.ts',
    ]) {
      expect(read(path)).toContain('assertInScope(');
    }
  });

  it('yazma yolu birincil birim üzerinden kapsam doğrular', () => {
    const controller = read('services/outage-service/src/http/controllers/outage.controller.ts');

    // ⚠️ Yazmada `unit_paths` (değdiği tüm birimler) KULLANILMAZ: bir mahalle sorumlusu
    // komşu ilçeye değen hattı kesememeli.
    expect(controller).toContain('assertInScope(req.user, PERMISSIONS.OUTAGE_WRITE, component.unitPath');
  });

  it('tile SQL\'i hem eleman hem birim katmanını süzer', () => {
    const tiles = read('services/network-service/src/modules/tiles/service.ts');

    expect(tiles).toContain('scopeFilterAnyUnit(');
    expect(tiles).toContain('scopeFilterUnitTree(');
    // Bina izi CTE'leri ayrı sorgulanır ve kapsamı kendileri taşımak zorunda.
    expect(tiles).toContain('buildingScope');
  });

  it('poligon sorgusu kapsam süzgecini sunucuda uygular', () => {
    // 🚨 Alan seçimi kesinti/iş emirlerini istemcide süzüyor; kapsam istemcide süzülmez.
    expect(read('services/network-service/src/http/controllers/query.controller.ts')).toContain('scopeFilterAnyUnit(');
  });

  it('tile önbelleği anahtarına kapsam imzası giriyor', () => {
    // Anahtar kapsamsız olsaydı bir kullanıcının tile'ı kapsam dışı başka birine servis edilirdi.
    expect(read('services/network-service/src/http/controllers/tiles.controller.ts')).toContain('scopeSignature(');
  });

  it('PII ucu ayrı izne bağlı ve erişim denetim kaydı üretiyor', () => {
    const routes = read('services/network-service/src/http/routes.ts');
    const controller = read('services/network-service/src/http/controllers/customers.controller.ts');

    expect(routes).toContain('requirePermission(PERMISSIONS.CUSTOMER_READ_PII)');
    expect(routes).toContain("'/customers/:id/pii'");
    // İzin tek başına yetmez, kayıt kullanıcının kapsamında da olmalı (PII tablosu birim taşımaz).
    expect(controller).toContain('assertInScope(req.user, PERMISSIONS.CUSTOMER_READ_PII, customer.unitPath');
    expect(controller).toContain("event: 'customer_pii_accessed'");
  });

  it('kapsam atama kapısı sunucuda ve yükseltmeye kapalı', () => {
    // Bir mahalle sorumlusu kendini il sorumlusu yapamamalı: `atanan <@ atayanın kapsamı`.
    const service = read('services/access-service/src/services/user.service.ts');

    expect(service).toContain('PERMISSIONS.SCOPE_MANAGE');
    expect(service).toContain('isPathInScope(a.unitPath, grantable)');
    expect(service).toContain('ForbiddenError');
  });
});

describe('silinen anahtar sözlükten de düşüyor', () => {
  it('yüksek etkili kesinti ve jenerik modül anahtarları göçle siliniyor', () => {
    // Çeviri anahtarını seed'den çıkarmak onu sözlükten silmez — upsert asla satır düşürmez.
    const migration = read('services/translation-service/drizzle/0002_drop_retired_keys.sql');

    expect(migration).toContain('DELETE FROM "translation_keys"');
    expect(migration).toContain('map.confirm.highImpactWarning');
    expect(migration).toContain('user-management.role.module.generic');
    // Versiyon elle artırılmazsa ETag sabit kalır ve silme yayınlanmış olmaz.
    expect(migration).toContain('UPDATE "bundle_versions" SET "version" = "version" + 1');
  });

  it('manevra izninin etiketi de göçle siliniyor', () => {
    const migration = read('services/translation-service/drizzle/0003_drop_switch_permission_key.sql');

    expect(migration).toContain("'permission.network.switch'");
    expect(migration).toContain('UPDATE "bundle_versions" SET "version" = "version" + 1');
  });

  it('sözlükten düşmüş izin satırları seed\'de temizleniyor', () => {
    // İzin koddan silinince DB'den silinmez — temizlik olmadan `GET /permissions` hayalet döner.
    const seed = read('services/access-service/src/db/seed.ts');

    expect(seed).toContain('notInArray(permissions.code, [...ALL_PERMISSIONS])');
  });
});

describe('kapsam göçü kimsenin yetkisini düşürmedi', () => {
  it('user_roles göçü mevcut satırlara kök kapsamı yazıyor', () => {
    // Sıra bağlayıcı: nullable ekle → doldur → NOT NULL yap → PK'yı değiştir.
    const migration = read('services/access-service/drizzle/0003_add_scope_to_user_roles.sql');

    expect(migration).toContain('ADD COLUMN "unit_path"');
    expect(migration).toContain(`SET "unit_path" = 'TR.06'::ltree WHERE "unit_path" IS NULL`);
    expect(migration).toContain('SET NOT NULL');
    expect(migration).toContain('PRIMARY KEY("user_id","role_id","unit_path")');
  });
});
