import {
  ConflictError,
  InternalError,
  NotFoundError,
  parseSort,
  toPageResult,
  ValidationError,
  type AuthedRequest,
  type Logger,
} from '@inavitas/shared';
import { and, asc, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { config } from '../../config.ts';
import { db } from '../../db.ts';
import {
  bundleVersions,
  locales,
  translationHistory,
  translationKeys,
  translationNamespaces,
  translations,
} from '../../db/schema.ts';
import type { Dictionary } from '../../domain/bundle.ts';
import { ALL_NAMESPACES, buildEtag } from '../../domain/cache-key.ts';
import { toProviderLocale } from '../../domain/locale-mapping.ts';
import * as repo from '../../repository/translation.repository.ts';
import { getProvider } from '../../services/auto-translate/index.ts';
import * as cache from '../../services/cache.service.ts';
import { publishTranslations } from '../../services/publish.service.ts';
import {
  AutoTranslateBody,
  CreateKeyBody,
  CreateLocaleBody,
  GetBundleQuery,
  ListKeysQuery,
  PublishBody,
  UpdateLocaleBody,
  UpdateTranslationBody,
} from '../schemas.ts';

/** Makine çevirisiyle güncellenen satırların denetim izinde göründüğü sabit aktör adı. */
const MACHINE_ACTOR = 'machine:deepl';

/** ETag/304 ve cache okuma-yazma akışını namespace'li ve toplu (E3) istekler arasında paylaşır. */
async function respondWithBundle(
  req: AuthedRequest,
  res: Response,
  locale: string,
  namespaceKey: string,
  version: number,
  log: Logger,
  loadFromDb: () => Promise<Dictionary>,
): Promise<void> {
  const etag = buildEtag(locale, namespaceKey, version);

  if (req.header('if-none-match') === etag) {
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.status(304).end();
    return;
  }

  let bundle = await cache.getBundle(locale, namespaceKey, version, log);
  let cacheStatus = 'HIT';

  if (!bundle) {
    bundle = await loadFromDb();
    await cache.setBundle(locale, namespaceKey, version, bundle, log);
    cacheStatus = 'MISS';
  }

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Cache', cacheStatus);
  res.json(bundle);
}

/** Public bundle endpoint — tarayıcı ve login ekranı auth'suz kullanır. */
export async function getBundle(req: AuthedRequest, res: Response): Promise<void> {
  const { locale, namespace } = GetBundleQuery.parse(req.query);
  const log = req.log;

  // Beyaz liste: biçim doğru olsa bile bilinmeyen locale/namespace asla cache
  // anahtarına dönüşmez — aksi halde saldırgan sınırsız benzersiz Redis anahtarı
  // ürettirip her isteği DB'ye düşürebilir (bkz. D29).
  const activeLocaleCodes = await cache.getActiveLocaleCodes(log);
  if (!activeLocaleCodes.includes(locale)) {
    throw new ValidationError('Bilinmeyen locale');
  }

  if (!namespace) {
    // namespace verilmemiş — tüm namespace'ler tek düz sözlükte (bkz. E3).
    const version = await cache.getAggregateBundleVersion(locale, log);
    await respondWithBundle(req, res, locale, ALL_NAMESPACES, version, log, () =>
      repo.buildPublishedBundleAll(locale),
    );
    return;
  }

  const namespaceNames = await cache.getNamespaceNames(log);
  if (!namespaceNames.includes(namespace)) {
    throw new ValidationError('Bilinmeyen namespace');
  }

  const version = await cache.getBundleVersion(locale, namespace, log);
  await respondWithBundle(req, res, locale, namespace, version, log, () =>
    repo.buildPublishedBundle(locale, namespace),
  );
}

/** Sistemde tanımlı tüm aktif dilleri listeler (Public - login dil seçimi için). */
export async function getLocales(_req: AuthedRequest, res: Response): Promise<void> {
  const activeLocales = await repo.listActiveLocales();
  res.json(activeLocales);
}

/** Yeni dil ekler (translation:publish izni gerektirir). */
export async function createLocale(req: AuthedRequest, res: Response): Promise<void> {
  const body = CreateLocaleBody.parse(req.body);
  const actor = req.user?.email ?? 'system';

  const newLocale = await db.transaction(async (tx) => {
    if (body.isDefault) {
      // Tek varsayılan dil kısıtı (uq_single_default_locale) ihlal edilmesin diye
      // yeni varsayılan atanmadan önce eskisi düşürülür.
      await tx.update(locales).set({ isDefault: false }).where(eq(locales.isDefault, true));
    }

    const [created] = await tx
      .insert(locales)
      .values({ code: body.code, name: body.name, isDefault: body.isDefault ?? false, isActive: true })
      .returning();

    // Yeni dil için tüm namespace'lerde v0 bundle versiyonu açılır — aksi halde
    // bu dilin bundle sorgusu hiç versiyon bulamaz ve panelde sütun boş/düzenlenemez görünür.
    const namespaces = await tx.select().from(translationNamespaces);
    if (namespaces.length > 0) {
      await tx.insert(bundleVersions).values(
        namespaces.map((ns) => ({
          localeCode: created.code,
          namespaceId: ns.id,
          version: 0,
          publishedAt: null,
        })),
      );
    }

    // Mevcut tüm anahtarlara boş draft satırı açılır — aksi halde yeni dilin
    // hücrelerinin id/version'ı olmaz ve panelde düzenlenemez.
    const existingKeys = await tx.select({ id: translationKeys.id }).from(translationKeys);
    if (existingKeys.length > 0) {
      await tx.insert(translations).values(
        existingKeys.map((k) => ({
          keyId: k.id,
          localeCode: created.code,
          draftValue: '',
          updatedBy: actor,
        })),
      );
    }

    return created;
  });

  res.status(201).json(newLocale);
}

/** Çeviri alan adlarını (namespaces) listeler. */
export async function getNamespaces(_req: AuthedRequest, res: Response): Promise<void> {
  const nsList = await repo.listNamespaces();
  res.json(nsList);
}

const KEYS_SORTABLE_FIELDS = ['keyName', 'createdAt'] as const;
const KEYS_SORT_COLUMNS = {
  keyName: translationKeys.keyName,
  createdAt: translationKeys.createdAt,
} as const;

/** Çeviri anahtarlarını ve değerlerini sayfalanmış olarak listeler. */
export async function listKeys(req: AuthedRequest, res: Response): Promise<void> {
  const query = ListKeysQuery.parse(req.query);

  const page = query.page;
  const pageSize = query.pageSize;
  const offset = (page - 1) * pageSize;

  let whereConditions = [];

  if (query.namespace) {
    const ns = await repo.findNamespaceByName(query.namespace);
    // Namespace bulunamazsa filtre yokmuş gibi TÜM anahtarları dönmek yanıltıcıdır —
    // boş sonuç, kullanıcının uyguladığı filtreye sadık kalır.
    if (!ns) {
      res.json(toPageResult([], 0, page, pageSize));
      return;
    }
    whereConditions.push(eq(translationKeys.namespaceId, ns.id));
  }

  if (query.q) {
    whereConditions.push(ilike(translationKeys.keyName, `%${query.q}%`));
  }

  if (query.onlyMissing === 'true') {
    // "Eksik" = aktif dillerden en az birinde boş/olmayan draft değeri var.
    whereConditions.push(sql`EXISTS (
      SELECT 1 FROM locales l
      WHERE l.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM translations t2
          WHERE t2.key_id = ${translationKeys.id} AND t2.locale_code = l.code AND t2.draft_value <> ''
        )
    )`);
  }

  const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;
  const sort = parseSort(query.sort, KEYS_SORTABLE_FIELDS, { field: 'keyName', dir: 'asc' });
  const sortColumn = KEYS_SORT_COLUMNS[sort.field as (typeof KEYS_SORTABLE_FIELDS)[number]];
  const orderBy = sort.dir === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const totalRes = await db
    .select({ count: count() })
    .from(translationKeys)
    .where(whereClause);

  const total = totalRes[0]?.count ?? 0;

  const keys = await db
    .select()
    .from(translationKeys)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(offset);

  const keyIds = keys.map((k) => k.id);

  let allTranslations: (typeof translations.$inferSelect)[] = [];
  if (keyIds.length > 0) {
    allTranslations = await db
      .select()
      .from(translations)
      .where(inArray(translations.keyId, keyIds));

    const activeLocales = await repo.listActiveLocales();
    const missingRows: { keyId: string; localeCode: string; draftValue: string; updatedBy: string }[] = [];

    for (const key of keys) {
      const existingCodes = new Set(allTranslations.filter((t) => t.keyId === key.id).map((t) => t.localeCode));
      for (const loc of activeLocales) {
        if (!existingCodes.has(loc.code)) {
          missingRows.push({ keyId: key.id, localeCode: loc.code, draftValue: '', updatedBy: 'system' });
        }
      }
    }

    if (missingRows.length > 0) {
      const createdRows = await db
        .insert(translations)
        .values(missingRows)
        .onConflictDoNothing()
        .returning();
      allTranslations.push(...createdRows);
    }
  }

  const items = keys.map((key) => {
    const keyTrans = allTranslations.filter((t) => t.keyId === key.id);
    const transMap: Record<string, typeof translations.$inferSelect> = {};
    for (const t of keyTrans) {
      transMap[t.localeCode] = t;
    }
    return {
      ...key,
      translations: transMap,
    };
  });

  res.json(toPageResult(items, total, page, pageSize));
}

/** Yeni çeviri anahtarı ekler. */
export async function createKey(req: AuthedRequest, res: Response): Promise<void> {
  const body = CreateKeyBody.parse(req.body);
  const actor = req.user?.email ?? 'system';

  const ns = await repo.findNamespaceByName(body.namespace);
  if (!ns) {
    throw new NotFoundError('Namespace', body.namespace);
  }

  const activeLocales = await repo.listActiveLocales();

  // Tek transaction + tek çok satırlı insert — üçüncü dilde hata olursa
  // anahtar yarım çevirilerle kalmasın.
  const { newKey, initialTrans } = await db.transaction(async (tx) => {
    const [key] = await tx
      .insert(translationKeys)
      .values({
        namespaceId: ns.id,
        keyName: body.keyName,
        description: body.description,
      })
      .returning();

    const rows = activeLocales.map((loc) => ({
      keyId: key.id,
      localeCode: loc.code,
      draftValue: body.initialTranslations?.[loc.code] ?? '',
      updatedBy: actor,
    }));

    const created = rows.length > 0 ? await tx.insert(translations).values(rows).returning() : [];

    return { newKey: key, initialTrans: created };
  });

  res.status(201).json({ ...newKey, translations: initialTrans });
}

/** Çeviri anahtarını siler (translation:publish izni gerektirir — yayınlanmış metni silmek yayın kadar kritiktir). */
export async function deleteKey(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  const [key] = await db.select({ namespaceId: translationKeys.namespaceId }).from(translationKeys).where(eq(translationKeys.id, id));
  if (!key) {
    throw new NotFoundError('Çeviri anahtarı', id);
  }

  await db.transaction(async (tx) => {
    // translations ve translation_history ON DELETE CASCADE ile temizlenir.
    await tx.delete(translationKeys).where(eq(translationKeys.id, id));

    // Bundle içeriği değişti — ilgili namespace'in tüm dillerdeki versiyonu
    // artırılır ki istemciler önbellekten değil DB'den okusun.
    const allLocales = await tx.select({ code: locales.code }).from(locales);
    if (allLocales.length > 0) {
      await tx
        .insert(bundleVersions)
        .values(allLocales.map((loc) => ({ localeCode: loc.code, namespaceId: key.namespaceId, version: 1, publishedAt: new Date() })))
        .onConflictDoUpdate({
          target: [bundleVersions.localeCode, bundleVersions.namespaceId],
          set: { version: sql`${bundleVersions.version} + 1`, publishedAt: new Date() },
        });
    }
  });

  res.status(204).end();
}

/** Bir dili etkinleştirir/pasifleştirir. Varsayılan dil pasifleştirilemez — fallback zinciri kopar. */
export async function updateLocale(req: AuthedRequest, res: Response): Promise<void> {
  const code = req.params.code as string;
  const body = UpdateLocaleBody.parse(req.body);

  const [existing] = await db.select().from(locales).where(eq(locales.code, code));
  if (!existing) {
    throw new NotFoundError('Dil', code);
  }

  if (!body.isActive && existing.isDefault) {
    throw new ConflictError('Varsayılan dil pasifleştirilemez');
  }

  const [updated] = await db.update(locales).set({ isActive: body.isActive }).where(eq(locales.code, code)).returning();
  res.json(updated);
}

/** Taslak çeviri değerini günceller (iyimser kilitleme / version zorunlu). */
export async function updateTranslation(req: AuthedRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = UpdateTranslationBody.parse(req.body);
  const actor = req.user?.email ?? 'system';

  const [existing] = await db
    .select()
    .from(translations)
    .where(eq(translations.id, id))
    .limit(1);

  if (!existing) {
    throw new NotFoundError('Çeviri kaydı', id);
  }

  if (existing.version !== body.version) {
    throw new ConflictError('Bu çeviri başka bir kullanıcı tarafından güncellenmiş. Sayfayı yenileyin.');
  }

  // Güncelleme ve geçmiş kaydı tek transaction'da — ikincisi patlarsa
  // değişiklik denetim izi olmadan kalıcı olmasın.
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(translations)
      .set({
        draftValue: body.draftValue,
        updatedBy: actor,
        updatedAt: new Date(),
        version: sql`${translations.version} + 1`,
      })
      .where(and(eq(translations.id, id), eq(translations.version, body.version)))
      .returning();

    if (!row) {
      throw new ConflictError('İyimser kilitleme çakışması');
    }

    await tx.insert(translationHistory).values({
      translationId: existing.id,
      oldValue: existing.draftValue,
      newValue: body.draftValue,
      actor,
    });

    return row;
  });

  res.json(updated);
}

/** Eksik (veya tüm) çevirileri yapay zekâ ile doldurur — sonuç daima draft_value'ya yazılır. */
export async function autoTranslate(req: AuthedRequest, res: Response): Promise<void> {
  const body = AutoTranslateBody.parse(req.body);

  const targetProviderLocale = toProviderLocale(body.targetLocale);
  if (!targetProviderLocale) {
    throw new ValidationError(`Eşlenemeyen hedef dil: ${body.targetLocale}`);
  }

  const sourceLocale = body.sourceLocale ?? (await repo.getDefaultLocaleCode());
  const sourceProviderLocale = toProviderLocale(sourceLocale);
  if (!sourceProviderLocale) {
    throw new ValidationError(`Eşlenemeyen kaynak dil: ${sourceLocale}`);
  }

  // Hedef anahtar kümesi: keyIds modu ("bunu doldur") veya namespace modu ("hepsini doldur").
  let targetKeyIds: string[];
  if (body.keyIds && body.keyIds.length > 0) {
    targetKeyIds = body.keyIds;
  } else {
    const ns = await repo.findNamespaceByName(body.namespace!);
    if (!ns) throw new NotFoundError('Namespace', body.namespace!);
    const rows = await db
      .select({ id: translationKeys.id })
      .from(translationKeys)
      .where(eq(translationKeys.namespaceId, ns.id));
    targetKeyIds = rows.map((r) => r.id);
  }

  if (targetKeyIds.length > config.MAX_AUTO_TRANSLATE_KEYS) {
    throw new ValidationError(`İstek başına en fazla ${config.MAX_AUTO_TRANSLATE_KEYS} anahtar çevrilebilir`);
  }

  if (targetKeyIds.length === 0) {
    res.json({ translatedCount: 0 });
    return;
  }

  const sourceRows = await db
    .select({ id: translations.id, keyId: translations.keyId, draftValue: translations.draftValue })
    .from(translations)
    .where(and(inArray(translations.keyId, targetKeyIds), eq(translations.localeCode, sourceLocale)));

  const targetRows = await db
    .select({ id: translations.id, keyId: translations.keyId, draftValue: translations.draftValue })
    .from(translations)
    .where(and(inArray(translations.keyId, targetKeyIds), eq(translations.localeCode, body.targetLocale)));

  const targetByKeyId = new Map(targetRows.map((r) => [r.keyId, r]));

  const toTranslate = sourceRows.filter((source) => {
    if (!source.draftValue) return false; // kaynakta metin yoksa çevrilecek bir şey yok
    const target = targetByKeyId.get(source.keyId);
    if (!target) return false; // hedef dilde satır yoksa (dil henüz eklenmemiş) atla
    if (body.onlyMissing && target.draftValue !== '') return false; // dolu hücreler EZİLMEZ
    return true;
  });

  if (toTranslate.length === 0) {
    res.json({ translatedCount: 0 });
    return;
  }

  let translatedTexts: string[];
  try {
    translatedTexts = await getProvider().translate(
      toTranslate.map((r) => r.draftValue),
      sourceProviderLocale,
      targetProviderLocale,
    );
  } catch (err) {
    req.log.error({ err }, 'otomatik çeviri sağlayıcı hatası');
    throw new InternalError('Otomatik çeviri şu anda kullanılamıyor', err);
  }

  // Güncelleme + history tek transaction'da (bkz. D8 ile aynı kural).
  await db.transaction(async (tx) => {
    for (let i = 0; i < toTranslate.length; i++) {
      const source = toTranslate[i]!;
      const target = targetByKeyId.get(source.keyId)!;
      const newValue = translatedTexts[i] ?? '';

      await tx
        .update(translations)
        .set({
          draftValue: newValue,
          updatedBy: MACHINE_ACTOR,
          updatedAt: new Date(),
          version: sql`${translations.version} + 1`,
        })
        .where(eq(translations.id, target.id));

      await tx.insert(translationHistory).values({
        translationId: target.id,
        oldValue: target.draftValue,
        newValue,
        actor: MACHINE_ACTOR,
      });
    }
  });

  res.json({ translatedCount: toTranslate.length });
}

/** Çevirileri yayınlar (draft_value -> published_value). */
export async function publish(req: AuthedRequest, res: Response): Promise<void> {
  const body = PublishBody.parse(req.body);
  const actor = req.user?.email ?? 'system';

  const result = await publishTranslations(body.namespace, body.locales, actor, req.log);
  res.json(result);
}
