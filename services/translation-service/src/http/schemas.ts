import { PaginationQuery } from '@inavitas/shared';
import { z } from 'zod';

export const GetBundleQuery = z.object({
  locale: z.string().min(2).max(10),
  namespace: z.string().min(1).max(64),
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

export const PublishBody = z.object({
  namespace: z.string().optional(),
  locales: z.array(z.string()).optional(),
});
export type PublishBody = z.infer<typeof PublishBody>;

export const AutoTranslateBody = z.object({
  keyIds: z.array(z.string().uuid()).min(1).max(50),
  targetLocale: z.string().min(2).max(10),
  sourceLocale: z.string().optional(),
});
export type AutoTranslateBody = z.infer<typeof AutoTranslateBody>;
