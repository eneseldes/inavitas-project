import { z } from 'zod';
import { envelopeOf } from './envelope.ts';
import { TOPICS } from './topics.ts';

export const TranslationPublishedPayload = z.object({
  locale: z.string().min(2).max(10),
  namespace: z.string().min(1).max(64),
  version: z.number().int().min(1),
  keyCount: z.number().int().min(0),
  publishedAt: z.iso.datetime(),
});
export type TranslationPublishedPayload = z.infer<typeof TranslationPublishedPayload>;

export const TranslationPublishedEvent = envelopeOf(
  TOPICS.TRANSLATION_PUBLISHED,
  TranslationPublishedPayload,
);
export type TranslationPublishedEvent = z.infer<typeof TranslationPublishedEvent>;
