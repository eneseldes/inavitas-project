import type { z } from 'zod';
import {
  OutageCreatedEvent,
  OutageEnergizedEvent,
  OutageLinkedEvent,
} from './outage.events.ts';
import { TOPICS, type Topic } from './topics.ts';
import {
  WorkOrderCreatedEvent,
  WorkOrderDoneEvent,
  WorkOrderLinkedEvent,
} from './work-order.events.ts';

export * from './envelope.ts';
export * from './outage.events.ts';
export * from './topics.ts';
export * from './work-order.events.ts';

/**
 * Topic → şema eşlemesi. Consumer gelen mesajı bu harita üzerinden doğrular.
 */
export const EVENT_SCHEMAS = {
  [TOPICS.OUTAGE_CREATED]: OutageCreatedEvent,
  [TOPICS.OUTAGE_ENERGIZED]: OutageEnergizedEvent,
  [TOPICS.OUTAGE_LINKED]: OutageLinkedEvent,
  [TOPICS.WORK_ORDER_CREATED]: WorkOrderCreatedEvent,
  [TOPICS.WORK_ORDER_DONE]: WorkOrderDoneEvent,
  [TOPICS.WORK_ORDER_LINKED]: WorkOrderLinkedEvent,
} as const;

export type EventSchemas = typeof EVENT_SCHEMAS;

/** Belirli bir topic'e karşılık gelen event tipi. */
export type EventForTopic<T extends Topic> = z.infer<EventSchemas[T]>;

/**
 * Gelen ham mesajı topic'in Zod şemasıyla doğrular.
 * Şemaya uymayan geçersiz mesajlarda hata fırlatır.
 */
export function parseEvent<T extends Topic>(topic: T, raw: unknown): EventForTopic<T> {
  return EVENT_SCHEMAS[topic].parse(raw) as EventForTopic<T>;
}

/** Ham mesajı doğrular; hata fırlatmak yerine güvenli Zod parse sonucunu döner. */
export function safeParseEvent<T extends Topic>(topic: T, raw: unknown) {
  return EVENT_SCHEMAS[topic].safeParse(raw) as z.ZodSafeParseResult<EventForTopic<T>>;
}
