import { z } from 'zod';
import { envelopeOf } from './envelope.ts';
import { CbsId } from './outage.events.ts';
import { TOPICS } from './topics.ts';

/**
 * **Olayda** taşınabilecek en fazla kimlik sayısı — bir taşıma sınırıdır, iş kuralı değil:
 * Kafka broker'ının varsayılan `message.max.bytes` değeri 1 MB'tır ve 600 bin elemanlı bir
 * etki kümesi tek mesaja sığmaz.
 *
 * ⚠️ Etki **hesabı** bu sınırı tanımaz: `network-service`'in `modules/impact/service.ts`
 * dosyası tam listeyi üretir, harita vurgusu ve kaskad önizlemesi tam liste üzerinde çalışır.
 * Kırpma yalnız `kafka/consumers.ts` içinde, olay kurulurken uygulanır; `overflowed` bayrağı
 * "sayılar tam, LİSTE kırpıldı" demektir.
 */
export const IMPACT_ID_LIMIT = 10_000;

/**
 * Olayda taşınabilecek en fazla **kaskad adayı** kesinti sayısı.
 *
 * `IMPACT_ID_LIMIT`'ten üç kat küçük olması bir kısıt değil, ölçek farkı: bu liste eleman
 * değil **aktif kesinti** sayar. Bir dağıtım bölgesinde aynı anda süren kesinti sayısı
 * yüzler mertebesindedir; kimlik listesinin aksine Kafka mesaj sınırına hiçbir zaman
 * yaklaşmaz. Kaskadın kırpılmış `affectedElementIds`'e bağımlılığı tam olarak bu yüzden
 * buraya taşındı.
 */
export const CASCADE_OUTAGE_LIMIT = 1_000;

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
  /**
   * Aynı kesinti için kaçıncı hesap. Bugün **tek revizyon** vardır (`FIRST_REVISION`): etki
   * kesinti açılırken bir kez hesaplanır ve bir daha revize edilmez. Alan, ekle-only
   * snapshot'ın anahtarı olarak durur — ileride kaskad revizyon yazmak isterse yeri hazırdır.
   */
  revision: z.number().int().min(1),
  affectedElementIds: z.array(z.string().max(64)).max(IMPACT_ID_LIMIT),
  affectedElementCount: z.number().int().min(0),
  affectedCustomerCount: z.number().int().min(0),
  customers: z.array(AffectedCustomer).max(IMPACT_ID_LIMIT),
  /** Kimlik listeleri sınırı aştı — sayılar doğru, listeler kırpılmış. */
  overflowed: z.boolean(),
  /**
   * Bu kesintinin aşağı akışında **süren** kesintiler — kapsanacak adaylar.
   *
   * ⚠️ Kaskadın girdisi budur, `affectedElementIds` DEĞİL. Eski yolda `outage-service`
   * kapsamayı kırpılmış kimlik listesi üzerinden hesaplıyordu ve 10.000'inci elemandan
   * sonrasında duran hiçbir kesinti üst kesintiye bağlanmıyordu (müşteri-dakikası iki kez
   * sayılıyordu). Kesişimi hesaplayacak taraf zaten grafın sahibi olan `network-service`;
   * karar orada verilip **sonucu** taşınıyor.
   *
   * Eski olaylar bu alanı taşımaz — `default` ile geriye dönük uyumlu.
   */
  containedOutageIds: z.array(z.uuid()).max(CASCADE_OUTAGE_LIMIT).default([]),
  /**
   * Bu kesintiyi kapsayan, kendisine EN YAKIN süren kesinti; yoksa `null`.
   * Besleme zincirinde (upstream) yukarı doğru bulunan ilk aktif kesintidir.
   */
  containingOutageId: z.uuid().nullable().default(null),
  /** Radyallik varsayımı bozuldu (kapalı ring üzerinden alternatif besleme) — etki geçersiz. */
  radialityViolated: z.boolean(),
});
export type OutageImpactCalculatedPayload = z.infer<typeof OutageImpactCalculatedPayload>;

export const OutageImpactCalculatedEvent = envelopeOf(TOPICS.OUTAGE_IMPACT_CALCULATED, OutageImpactCalculatedPayload);
export type OutageImpactCalculatedEvent = z.infer<typeof OutageImpactCalculatedEvent>;
