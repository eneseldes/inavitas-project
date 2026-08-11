import { PaginationQuery } from '@inavitas/shared';
import { z } from 'zod';

export const GetBundleQuery = z.object({
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  // Opsiyonel — verilmezse tüm namespace'ler tek düz sözlükte döner (bkz. E3).
  namespace: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).optional(),
});
export type GetBundleQuery = z.infer<typeof GetBundleQuery>;

export const ListKeysQuery = PaginationQuery.extend({
  namespace: z.string().optional(),
  q: z.string().optional(),
  onlyMissing: z.enum(['true', 'false']).optional(),
  sort: z.string().optional(),
});
export type ListKeysQuery = z.infer<typeof ListKeysQuery>;

export const CreateKeyBody = z.object({
  namespace: z.string().min(1).max(64),
  keyName: z.string().min(1).max(256),
  description: z.string().optional(),
  initialTranslations: z.record(z.string(), z.string()).optional(),
});
export type CreateKeyBody = z.infer<typeof CreateKeyBody>;

export const UpdateTranslationBody = z.object({
  draftValue: z.string(),
  version: z.number().int().min(1),
});
export type UpdateTranslationBody = z.infer<typeof UpdateTranslationBody>;

export const CreateLocaleBody = z.object({
  code: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
  name: z.string().min(1).max(64),
  isDefault: z.boolean().optional(),
});
export type CreateLocaleBody = z.infer<typeof CreateLocaleBody>;

export const UpdateLocaleBody = z.object({
  isActive: z.boolean(),
});
export type UpdateLocaleBody = z.infer<typeof UpdateLocaleBody>;

export const PublishBody = z.object({
  namespace: z.string().optional(),
  locales: z.array(z.string()).optional(),
});
export type PublishBody = z.infer<typeof PublishBody>;

export const AutoTranslateBody = z
  .object({
    targetLocale: z.string().min(2).max(10),
    sourceLocale: z.string().optional(),
    namespace: z.string().optional(),
    keyIds: z.array(z.string().uuid()).optional(),
    onlyMissing: z.boolean().optional().default(true),
  })
  // İkisi de yoksa yanlışlıkla tüm veritabanını çevirme riski oluşur.
  .refine((body) => !!body.namespace || (body.keyIds && body.keyIds.length > 0), {
    message: 'namespace veya keyIds alanlarından en az biri zorunludur',
  });
export type AutoTranslateBody = z.infer<typeof AutoTranslateBody>;
