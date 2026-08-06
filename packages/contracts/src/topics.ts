/**
 * Kafka topic adları. Tek kaynak burasıdır — hiçbir serviste 'outage.created'
 * diye string yazma, buradan import et. Yazım hatası yaptığında Kafka sessizce
 * yeni bir topic açmaz; TypeScript derleme anında yakalar.
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

/** Tüm topic'lerin listesi — create-topics script'i ve testler kullanır. */
export const ALL_TOPICS: readonly Topic[] = Object.values(TOPICS);

/**
 * Bir topic'in ölü mektup kutusu (dead letter queue) adı.
 * 3 denemeden sonra işlenemeyen mesajlar buraya gider.
 */
export function dlqOf(topic: Topic): `${Topic}.DLQ` {
  return `${topic}.DLQ`;
}

/** Consumer group adları — her servis kendi group'unda olmalı. */
export const CONSUMER_GROUPS = {
  OUTAGE_SERVICE: 'outage-service-group',
  WORK_ORDER_SERVICE: 'work-order-service-group',
} as const;
