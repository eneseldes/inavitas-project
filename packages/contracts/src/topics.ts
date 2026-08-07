/**
 * Kafka topic sabitleri. Tip güvenliği sağlamak amacıyla tüm servislerde ortak kullanılır.
 */
export const TOPICS = {
  OUTAGE_CREATED: 'outage.created',
  OUTAGE_ENERGIZED: 'outage.energized',
  OUTAGE_LINKED: 'outage.linked',
  WORK_ORDER_CREATED: 'work-order.created',
  WORK_ORDER_DONE: 'work-order.done',
  WORK_ORDER_LINKED: 'work-order.linked',
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

/** Tüm topic'lerin listesi (betikler ve ilklendirme süreçleri için). */
export const ALL_TOPICS: readonly Topic[] = Object.values(TOPICS);

/**
 * Belirtilen topic için Dead Letter Queue (DLQ) topic adını oluşturur.
 * İşlenemeyen mesajlar bu kuyruğa aktarılır.
 */
export function dlqOf(topic: Topic): `${Topic}.DLQ` {
  return `${topic}.DLQ`;
}

/** Servislere özel Kafka consumer group tanımları. */
export const CONSUMER_GROUPS = {
  OUTAGE_SERVICE: 'outage-service-group',
  WORK_ORDER_SERVICE: 'work-order-service-group',
} as const;
