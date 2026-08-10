import { TOPICS } from '@inavitas/contracts';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db.ts';
import {
  bundleVersions,
  locales,
  translationKeys,
  translationNamespaces,
  translations,
} from '../db/schema.ts';
import { redis } from '../redis.ts';
import { enqueueTx } from '../repository/outbox.repository.ts';

export interface PublishResult {
  publishedCount: number;
  namespaces: string[];
  locales: string[];
}

export async function publishTranslations(
  namespaceFilter?: string,
  localesFilter?: string[],
  actor = 'system',
): Promise<PublishResult> {
  const publishedEvents: { locale: string; namespace: string; version: number }[] = [];

  const result = await db.transaction(async (tx) => {
    // 1. Hedef namespace'leri bul
    let nsQuery = tx.select().from(translationNamespaces);
    if (namespaceFilter) {
      nsQuery = nsQuery.where(eq(translationNamespaces.name, namespaceFilter)) as typeof nsQuery;
    }
    const targetNsList = await nsQuery;

    if (targetNsList.length === 0) {
      return { publishedCount: 0, namespaces: [], locales: [] };
    }

    // 2. Hedef dilleri bul
    let locQuery = tx.select().from(locales).where(eq(locales.isActive, true));
    if (localesFilter && localesFilter.length > 0) {
      locQuery = tx
        .select()
        .from(locales)
        .where(inArray(locales.code, localesFilter)) as typeof locQuery;
    }
    const targetLocales = await locQuery;

    if (targetLocales.length === 0) {
      return { publishedCount: 0, namespaces: [], locales: [] };
    }

    let totalUpdated = 0;

    for (const ns of targetNsList) {
      // Namespace altındaki key ID'leri
      const nsKeys = await tx
        .select({ id: translationKeys.id })
        .from(translationKeys)
        .where(eq(translationKeys.namespaceId, ns.id));

      if (nsKeys.length === 0) continue;

      const keyIds = nsKeys.map((k) => k.id);

      for (const loc of targetLocales) {
        // published_value = draft_value kopyala
        const updated = await tx
          .update(translations)
          .set({ publishedValue: translations.draftValue })
          .where(
            and(
              inArray(translations.keyId, keyIds),
              eq(translations.localeCode, loc.code),
            ),
          )
          .returning({ id: translations.id });

        totalUpdated += updated.length;

        // Versiyon artır
        const versionRes = await tx
          .insert(bundleVersions)
          .values({
            localeCode: loc.code,
            namespaceId: ns.id,
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

        const currentVersion = versionRes[0]?.version ?? 1;

        // Outbox'a event yaz
        await enqueueTx(tx, TOPICS.TRANSLATION_PUBLISHED, `${loc.code}:${ns.name}`, {
          locale: loc.code,
          namespace: ns.name,
          version: currentVersion,
          keyCount: updated.length,
          publishedAt: new Date().toISOString(),
        });

        publishedEvents.push({
          locale: loc.code,
          namespace: ns.name,
          version: currentVersion,
        });
      }
    }

    return {
      publishedCount: totalUpdated,
      namespaces: targetNsList.map((n) => n.name),
      locales: targetLocales.map((l) => l.code),
    };
  });

  // Transaction commit olduktan sonra Redis Pub/Sub sinyali at
  for (const ev of publishedEvents) {
    try {
      await redis.publish('ui:translation', JSON.stringify(ev));
    } catch (err) {
      console.error('[publish.service] Redis publish hatası:', err);
    }
  }

  return result;
}

import { and } from 'drizzle-orm';
