import { z } from 'zod';
import { envelopeOf } from './envelope.ts';
import { CbsId } from './outage.events.ts';
import { TOPICS } from './topics.ts';

/**
 * Etki kümesinde taşınabilecek en fazla kimlik sayısı. `network-service`'in etki motoru
 * (`modules/impact/service.ts` → `ID_LIST_LIMIT`) bu sabiti kullanır: TM ölçeğindeki bir
 * kesintide binlerce eleman etkilenir, sınırı aşan durumda kimlikler kırpılır ve
 * `overflowed` bayrağı ile birlikte taşınır.
 */
export const IMPACT_ID_LIMIT = 10_000;

/**
 * Etkilenen abone — `network-service`'in zaten PII'sız döndürdüğü alanların bir kopyası.
 * ⚠️ `wiringId`/`contractId` gibi PII alanları bu olayda **asla** taşınmaz.
 */
export const AffectedCustomer = z.object({
  customerId: z.string().min(1).max(64),
  unitPath: z.string().min(1),
  customerType: z.string().max(64).nullable(),
});
export type AffectedCustomer = z.infer<typeof AffectedCustomer>;

/**
 * `network-service` grafı gezip etkiyi hesapladığında yayınlanır. Yalnız sayı taşımaz;
 * `outage-service`'in `outage_affected_customers` read-model'ini doldurabilmesi için
 * etkilenen abone kümesi de aynı payload'ın içindedir — ayrıca sorulmaz.
 */
export const OutageImpactCalculatedPayload = z.object({
  outageId: z.uuid(),
  cbsId: CbsId,
  /** Aynı kesinti için kaçıncı hesap — manevra sonrası yeniden hesaplandığında artar. */
  revision: z.number().int().min(1),
  affectedElementIds: z.array(z.string().max(64)).max(IMPACT_ID_LIMIT),
  affectedElementCount: z.number().int().min(0),
  affectedCustomerCount: z.number().int().min(0),
  customers: z.array(AffectedCustomer).max(IMPACT_ID_LIMIT),
  /** Kimlik listeleri sınırı aştı — sayılar doğru, listeler kırpılmış. */
  overflowed: z.boolean(),
  /** Radyallik varsayımı bozuldu (kapalı ring üzerinden alternatif besleme) — etki geçersiz. */
  radialityViolated: z.boolean(),
});
export type OutageImpactCalculatedPayload = z.infer<typeof OutageImpactCalculatedPayload>;

export const OutageImpactCalculatedEvent = envelopeOf(TOPICS.OUTAGE_IMPACT_CALCULATED, OutageImpactCalculatedPayload);
export type OutageImpactCalculatedEvent = z.infer<typeof OutageImpactCalculatedEvent>;
