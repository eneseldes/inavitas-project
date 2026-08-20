/**
 * Kafka topic sabitleri. Tip güvenliği sağlamak amacıyla tüm servislerde ortak kullanılır.
 */
export const TOPICS = {
  OUTAGE_CREATED: 'outage.created',
  OUTAGE_ENERGIZED: 'outage.energized',
  OUTAGE_LINKED: 'outage.linked',
  /** Kesinti iptal edildi — bağlı iş emri de iptal edilir, şebeke yeniden enerjilendirilir. */
  OUTAGE_CANCELLED: 'outage.cancelled',
  /** Etki hesaplandı — network-service grafı gezdi, etkilenen eleman ve abone kümesini yayınlıyor. */
  OUTAGE_IMPACT_CALCULATED: 'outage.impact.calculated',
  /** İki kesinti arasında kapsama/yükselme ilişkisi kuruldu. */
  OUTAGE_CASCADED: 'outage.cascaded',
  WORK_ORDER_CREATED: 'work-order.created',
  WORK_ORDER_DONE: 'work-order.done',
  WORK_ORDER_LINKED: 'work-order.linked',
  /** İş emri iptal edildi — bağlı kesinti de iptal edilir (iptal simetrisi). */
  WORK_ORDER_CANCELLED: 'work-order.cancelled',
  TRANSLATION_PUBLISHED: 'translation.published',
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
  NETWORK_SERVICE: 'network-service-group',
} as const;
