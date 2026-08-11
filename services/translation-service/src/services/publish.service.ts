import { TOPICS } from '@inavitas/contracts';
import type { Logger } from '@inavitas/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db.ts';
import {
  bundleVersions,
  locales,
  translationKeys,
  translationNamespaces,
  translations,
} from '../db/schema.ts';
import { ALL_NAMESPACES } from '../domain/cache-key.ts';
import { enqueueTx } from '../repository/outbox.repository.ts';
import { notifyTranslationPublished, type TranslationPublishedEvent } from '../realtime.ts';
import { invalidateBundleVersion } from './cache.service.ts';

export interface PublishResult {
  publishedCount: number;
  namespaces: string[];
  locales: string[];
}

export async function publishTranslations(
  namespaceFilter: string | undefined,
  localesFilter: string[] | undefined,
  actor: string,
  log: Logger,
): Promise<PublishResult> {
  const publishedEvents: TranslationPublishedEvent[] = [];

  const result = await db.transaction(async (tx) => {
    // 1. Hedef namespace'leri bul
    const targetNsList = namespaceFilter
      ? await tx.select().from(translationNamespaces).where(eq(translationNamespaces.name, namespaceFilter))
      : await tx.select().from(translationNamespaces);

    if (targetNsList.length === 0) {
      return { publishedCount: 0, namespaces: [], locales: [] };
    }

    // 2. Hedef dilleri bul — filtre isActive koşulunu EZMEZ, üstüne eklenir.
    const localeWhere =
      localesFilter && localesFilter.length > 0
        ? and(eq(locales.isActive, true), inArray(locales.code, localesFilter))
        : eq(locales.isActive, true);
    const targetLocales = await tx.select().from(locales).where(localeWhere);

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
        // Denetim izi: yalnız gerçekten değişecek satırlar için (yüzlerce anahtarda
        // tek sorgu — satır satır insert DEĞİL). Update'ten ÖNCE çalışmalı, aksi
        // halde published_value zaten draft_value'ya eşitlenmiş olur ve
        // "IS DISTINCT FROM" hiçbir satır bulamaz.
        await tx.execute(sql`
          INSERT INTO translation_history (translation_id, old_value, new_value, actor)
          SELECT id, published_value, draft_value, ${actor}
          FROM translations
          WHERE ${inArray(translations.keyId, keyIds)} AND locale_code = ${loc.code}
            AND draft_value IS DISTINCT FROM published_value
        `);

        // published_value = draft_value kopyala — niyeti açık SQL, ham Column
        // referansının .set()'te ne üreteceği belirsiz kalmasın.
        const updated = await tx
          .update(translations)
          .set({ publishedValue: sql`${translations.draftValue}` })
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

  // Transaction commit olduktan sonra: önce versiyon cache'ini düşür (aksi halde
  // SSE sinyali gelse bile sunucu 60 sn eski versiyonu döner), sonra Pub/Sub sinyali at.
  // Toplu paketin (E3) versiyon toplamı da düşürülür — aksi halde `__all__` ETag'i
  // 60 sn boyunca eski toplamı taşımaya devam eder.
  const affectedLocales = new Set(publishedEvents.map((ev) => ev.locale));
  for (const ev of publishedEvents) {
    await invalidateBundleVersion(ev.locale, ev.namespace, log);
  }
  for (const locale of affectedLocales) {
    await invalidateBundleVersion(locale, ALL_NAMESPACES, log);
  }
  await notifyTranslationPublished(publishedEvents, log);

  return result;
}
