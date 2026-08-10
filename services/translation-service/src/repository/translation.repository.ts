import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { db, type Tx } from '../db.ts';
import {
  bundleVersions,
  locales,
  translationHistory,
  translationKeys,
  translationNamespaces,
  translations,
} from '../db/schema.ts';
import { buildBundle, type Dictionary } from '../domain/bundle.ts';

const client = (tx?: Tx) => tx ?? db;

/** Varsayılan dil kodunu döner (is_default = true). */
export async function getDefaultLocaleCode(tx?: Tx): Promise<string> {
  const result = await client(tx)
    .select({ code: locales.code })
    .from(locales)
    .where(eq(locales.isDefault, true))
    .limit(1);

  return result[0]?.code ?? 'tr-TR';
}

/** Belirtilen dil ve namespace için yayınlanmış çeviri satırlarını döner. */
export async function getPublishedBundleRows(
  localeCode: string,
  namespaceName: string,
  tx?: Tx,
): Promise<Dictionary> {
  const rows = await client(tx)
    .select({
      keyName: translationKeys.keyName,
      publishedValue: translations.publishedValue,
    })
    .from(translations)
    .innerJoin(translationKeys, eq(translations.keyId, translationKeys.id))
    .innerJoin(translationNamespaces, eq(translationKeys.namespaceId, translationNamespaces.id))
    .where(
      and(
        eq(translationNamespaces.name, namespaceName),
        eq(translations.localeCode, localeCode),
        isNotNull(translations.publishedValue),
      ),
    );

  const dict: Dictionary = {};
  for (const r of rows) {
    if (r.publishedValue !== null) {
      dict[r.keyName] = r.publishedValue;
    }
  }
  return dict;
}

/**
 * Sunucu tarafında varsayılan dil ile istenen dili birleştirerek paket oluşturur.
 */
export async function buildPublishedBundle(
  requestedLocale: string,
  namespaceName: string,
  tx?: Tx,
): Promise<Dictionary> {
  const defaultLocale = await getDefaultLocaleCode(tx);

  const defaultDict = await getPublishedBundleRows(defaultLocale, namespaceName, tx);

  if (requestedLocale === defaultLocale) {
    return defaultDict;
  }

  const requestedDict = await getPublishedBundleRows(requestedLocale, namespaceName, tx);

  return buildBundle(defaultDict, requestedDict);
}

/** Veritabanından mevcut bundle versiyonunu okur. */
export async function getBundleVersion(
  localeCode: string,
  namespaceName: string,
  tx?: Tx,
): Promise<number> {
  const rows = await client(tx)
    .select({ version: bundleVersions.version })
    .from(bundleVersions)
    .innerJoin(translationNamespaces, eq(bundleVersions.namespaceId, translationNamespaces.id))
    .where(
      and(
        eq(bundleVersions.localeCode, localeCode),
        eq(translationNamespaces.name, namespaceName),
      ),
    )
    .limit(1);

  return rows[0]?.version ?? 1;
}

/** Bundle versiyonunu 1 artırır veya 1 olarak başlatır. */
export async function incrementBundleVersionTx(
  tx: Tx,
  localeCode: string,
  namespaceId: string,
): Promise<number> {
  const result = await tx
    .insert(bundleVersions)
    .values({
      localeCode,
      namespaceId,
      version: 1,
      publishedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [bundleVersions.localeCode, bundleVersions.namespaceId],
      set: {
        version: sql`${bundleVersions.version} + 1`,
        publishedAt: new Date(),
      },
    })
    .returning({ version: bundleVersions.version });

  return result[0].version;
}

/** Tüm aktif dilleri listeler. */
export async function listActiveLocales(tx?: Tx) {
  return client(tx).select().from(locales).where(eq(locales.isActive, true));
}

/** Tüm namespace'leri listeler. */
export async function listNamespaces(tx?: Tx) {
  return client(tx).select().from(translationNamespaces);
}

/** Namespace adına göre veriyi bulur. */
export async function findNamespaceByName(name: string, tx?: Tx) {
  const rows = await client(tx)
    .select()
    .from(translationNamespaces)
    .where(eq(translationNamespaces.name, name))
    .limit(1);
  return rows[0] ?? null;
}
