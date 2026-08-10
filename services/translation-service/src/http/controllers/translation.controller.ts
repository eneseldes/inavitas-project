import {
  ConflictError,
  NotFoundError,
  ValidationError,
  toPageResult,
  type AuthedRequest,
} from '@inavitas/shared';
import { and, count, eq, ilike, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { db } from '../../db.ts';
import {
  locales,
  translationHistory,
  translationKeys,
  translationNamespaces,
  translations,
} from '../../db/schema.ts';
import { buildEtag } from '../../domain/cache-key.ts';
import * as repo from '../../repository/translation.repository.ts';
import * as cache from '../../services/cache.service.ts';
import { publishTranslations } from '../../services/publish.service.ts';
import {
  CreateKeyBody,
  GetBundleQuery,
  ListKeysQuery,
  PublishBody,
  UpdateTranslationBody,
} from '../schemas.ts';

/** Public bundle endpoint — tarayıcı ve login ekranı auth'suz kullanır. */
export async function getBundle(req: AuthedRequest, res: Response): Promise<void> {
  const { locale, namespace } = GetBundleQuery.parse(req.query);

  const version = await cache.getBundleVersion(locale, namespace);
  const etag = buildEtag(locale, namespace, version);

  if (req.header('if-none-match') === etag) {
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.status(304).end();
    return;
  }

  let bundle = await cache.getBundle(locale, namespace, version);
  let cacheStatus = 'HIT';

  if (!bundle) {
    bundle = await repo.buildPublishedBundle(locale, namespace);
    await cache.setBundle(locale, namespace, version, bundle);
    cacheStatus = 'MISS';
  }

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Cache', cacheStatus);
  res.json(bundle);
}

/** Sistemde tanımlı tüm aktif dilleri listeler (Public - login dil seçimi için). */
export async function getLocales(_req: AuthedRequest, res: Response): Promise<void> {
  const activeLocales = await repo.listActiveLocales();
  res.json(activeLocales);
}

/** Yeni dil ekler (translation:publish izni gerektirir). */
export async function createLocale(req: AuthedRequest, res: Response): Promise<void> {
  const { code, name, isDefault } = req.body as { code: string; name: string; isDefault?: boolean };

  if (!code || !name) {
    throw new ValidationError('code ve name zorunludur');
  }

  const newLocale = await db
    .insert(locales)
    .values({ code, name, isDefault: isDefault ?? false, isActive: true })
    .returning();

  res.status(201).json(newLocale[0]);
}

/** Çeviri alan adlarını (namespaces) listeler. */
export async function getNamespaces(_req: AuthedRequest, res: Response): Promise<void> {
  const nsList = await repo.listNamespaces();
  res.json(nsList);
}

/** Çeviri anahtarlarını ve değerlerini sayfalanmış olarak listeler. */
export async function listKeys(req: AuthedRequest, res: Response): Promise<void> {
  const query = ListKeysQuery.parse(req.query);

  const page = query.page;
  const pageSize = query.pageSize;
  const offset = (page - 1) * pageSize;

  let whereConditions = [];

  if (query.namespace) {
    const ns = await repo.findNamespaceByName(query.namespace);
    if (ns) {
      whereConditions.push(eq(translationKeys.namespaceId, ns.id));
    }
  }

  if (query.q) {
    whereConditions.push(ilike(translationKeys.keyName, `%${query.q}%`));
  }

  const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  const totalRes = await db
    .select({ count: count() })
    .from(translationKeys)
    .where(whereClause);

  const total = totalRes[0]?.count ?? 0;

  const keys = await db
    .select()
    .from(translationKeys)
    .where(whereClause)
    .limit(pageSize)
    .offset(offset);

  const keyIds = keys.map((k) => k.id);

  let allTranslations: (typeof translations.$inferSelect)[] = [];
  if (keyIds.length > 0) {
    allTranslations = await db
      .select()
      .from(translations)
      .where(inArray(translations.keyId, keyIds));
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

  const [newKey] = await db
    .insert(translationKeys)
    .values({
      namespaceId: ns.id,
      keyName: body.keyName,
      description: body.description,
    })
    .returning();

  const activeLocales = await repo.listActiveLocales();
  const initialTrans: (typeof translations.$inferSelect)[] = [];

  for (const loc of activeLocales) {
    const initialVal = body.initialTranslations?.[loc.code] ?? '';
    const [t] = await db
      .insert(translations)
      .values({
        keyId: newKey.id,
        localeCode: loc.code,
        draftValue: initialVal,
        updatedBy: actor,
      })
      .returning();
    initialTrans.push(t);
  }

  res.status(201).json({ ...newKey, translations: initialTrans });
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

  const [updated] = await db
    .update(translations)
    .set({
      draftValue: body.draftValue,
      updatedBy: actor,
      updatedAt: new Date(),
      version: sql`${translations.version} + 1`,
    })
    .where(and(eq(translations.id, id), eq(translations.version, body.version)))
    .returning();

  if (!updated) {
    throw new ConflictError('İyimser kilitleme çakışması');
  }

  await db.insert(translationHistory).values({
    translationId: existing.id,
    oldValue: existing.draftValue,
    newValue: body.draftValue,
    actor,
  });

  res.json(updated);
}

/** Çevirileri yayınlar (draft_value -> published_value). */
export async function publish(req: AuthedRequest, res: Response): Promise<void> {
  const body = PublishBody.parse(req.body);
  const actor = req.user?.email ?? 'system';

  const result = await publishTranslations(body.namespace, body.locales, actor);
  res.json(result);
}
