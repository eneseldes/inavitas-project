/**
 * Kaskad motoru — kesintiler arası kapsama/yükselme ilişkilerini kurar.
 *
 * ⚠️ **Kapsama tespiti burada YAPILMAZ.** Kimin kimi kapsadığını `network-service` söyler:
 * `outage.impact.calculated` olayı iki hazır alan taşır — `containingOutageId` (beni kapsayan
 * en dar kesinti) ve `containedOutageIds` (benim kapsadığım süren kesintiler). Bu motorun işi
 * o kararı **uygulamaktır**: döngü koruması, sürüm kilidi, olay yayını.
 *
 * Neden böyle: kapsama tespiti eskiden `outage_impact.affected_element_ids` üzerinde bir jsonb
 * kapsama (`@>`) sorgusuydu ve o kolon Kafka mesaj boyutu yüzünden 10.000 elemanda kırpılıyor.
 * Bir TM kesintisi 37.879 eleman etkiliyor; 10.000'inci elemandan sonrasında duran hiçbir
 * kesinti üst kesintiye bağlanmıyor, müşteri-dakikası iki kez sayılıyordu. Kararı grafın
 * sahibine bırakmak bu sınırı tamamen ortadan kaldırdı — taşınan liste artık eleman değil
 * **aktif kesinti** sayıyor (bkz. `onceden-yapilanlar.md` §11.4).
 */

import { SYSTEM_ACTOR, type RawEventEnvelope } from '@inavitas/contracts';
import type { Logger } from '@inavitas/shared';
import { db } from '../../db.ts';
import { canLinkParent, type CascadeNode } from '../../domain/cascade.ts';
import { enqueueOutageCascadedTx, enqueueOutageEnergizedIfNeededTx } from '../../kafka/producer.ts';
import * as outageRepository from '../../repository/outage.repository.ts';
import type { OutageRow } from '../../repository/outage.repository.ts';

export interface CascadeContext {
  correlationId: string;
  causedBy: Pick<RawEventEnvelope, 'eventId' | 'depth'>;
}

export interface CascadeResult {
  /** Bu kesintinin bağlandığı üst kesinti (kapsama). */
  parentOutageId: string | null;
  /** Bu kesintinin altına alınan kesintiler (yükselme). */
  supersededOutageIds: string[];
}

/** Zincir taraması için mevcut ebeveyn bağlarını haritaya çevirir. */
async function loadCascadeNodes(): Promise<Map<string, CascadeNode>> {
  const rows = await outageRepository.findAllCascadeNodes();
  return new Map(rows.map((row) => [row.id, row]));
}

/** `network-service`'in verdiği kaskad kararı — olay yükünden birebir gelir. */
export interface CascadeCandidates {
  containedOutageIds: string[];
  containingOutageId: string | null;
}

/**
 * Etki hesabı yazıldıktan sonra kaskad ilişkilerini **uygular**.
 *
 * İki yön birden değerlendirilir:
 * - **Kapsama:** `containingOutageId` doluysa o kesinti üsttür; müşteri-dakika yalnız üstte
 *   sayılır.
 * - **Yükselme:** `containedOutageIds` içindeki, süren ve henüz bir üste bağlanmamış
 *   kesintiler bu kesintinin altına alınır (`SUPERSEDES`).
 *
 * Her bağ öncesi `parentOutageId` zinciri taranır; döngü yaratacak bağ **kurulmaz**.
 */
export async function applyCascade(
  outage: OutageRow,
  candidates: CascadeCandidates,
  ctx: CascadeContext,
  log: Logger,
): Promise<CascadeResult> {
  const result: CascadeResult = { parentOutageId: null, supersededOutageIds: [] };

  const nodes = await loadCascadeNodes();

  // --- Kapsama: bu kesintiyi kapsayan en dar etkili üst kesinti ---
  if (outage.parentOutageId === null && candidates.containingOutageId !== null) {
    const parentId = candidates.containingOutageId;
    const check = canLinkParent(outage.id, parentId, nodes);

    if (!check.allowed) {
      log.warn(
        { outageId: outage.id, parentOutageId: parentId, reason: check.reason },
        'kaskad bağı döngü yaratacaktı, atlandı',
      );
    } else {
      const linked = await db.transaction(async (tx) => {
        const ok = await outageRepository.linkCascadeTx(tx, parentId, outage.id, 'CONTAINS');
        if (ok) await enqueueOutageCascadedTx(tx, parentId, outage.id, 'CONTAINS', ctx);
        return ok;
      });

      if (linked) {
        result.parentOutageId = parentId;
        nodes.set(outage.id, { id: outage.id, parentOutageId: parentId });
        log.info({ outageId: outage.id, parentOutageId: parentId }, 'kesinti üst kesintiye bağlandı');
      }
    }
  }

  // --- Yükselme: bu kesintinin kapsadığı, henüz bağlanmamış alt kesintiler ---
  if (candidates.containedOutageIds.length > 0) {
    // Aday listesi olay üretildiği anın fotoğrafıdır; bu arada kapanmış ya da başka bir üste
    // bağlanmış olabilirler — bağlanabilir olanlar burada yeniden süzülür.
    const contained = await outageRepository.findLinkableByIds(candidates.containedOutageIds, outage.id);

    for (const child of contained) {
      const check = canLinkParent(child.id, outage.id, nodes);
      if (!check.allowed) {
        log.warn(
          { outageId: child.id, parentOutageId: outage.id, reason: check.reason },
          'kaskad bağı döngü yaratacaktı, atlandı',
        );
        continue;
      }

      const linked = await db.transaction(async (tx) => {
        const ok = await outageRepository.linkCascadeTx(tx, outage.id, child.id, 'SUPERSEDES');
        if (ok) await enqueueOutageCascadedTx(tx, outage.id, child.id, 'SUPERSEDES', ctx);
        return ok;
      });

      if (linked) {
        result.supersededOutageIds.push(child.id);
        nodes.set(child.id, { id: child.id, parentOutageId: outage.id });
      }
    }

    if (result.supersededOutageIds.length > 0) {
      log.info(
        { outageId: outage.id, supersededCount: result.supersededOutageIds.length },
        'kapsanan kesintiler üst kesintiye taşındı',
      );
    }
  }

  return result;
}

/**
 * Otomatik çözülme: üst kesinti enerjilenince, kapsanan alt kesintiler **doğrulanarak**
 * kapatılır.
 *
 * Doğrulama, kapsamanın hâlâ geçerli olması demektir: alt kesintinin elemanı üst
 * kesintinin en güncel etki kümesinde duruyor olmalıdır. Etki revize edilip alt eleman
 * kümeden çıktıysa o kesinti kendi başına sürüyor demektir ve otomatik kapatılmaz.
 *
 * ⚠️ Kayıtlı etki kümesi **kırpılmışsa** (`overflowed`) doğrulama yapılamaz: alt elemanın
 * listede olmaması "kapsam dışı" değil "listeye sığmadı" demek olabilir ve kesinti sonsuza
 * kadar açık kalırdı. O durumda bağın kendisine güvenilir — bağ zaten kırpılmamış küme
 * üzerinden kurulmuştu (bkz. `applyCascade`).
 */
export async function resolveChildOutages(
  parent: OutageRow,
  endedAt: Date,
  ctx: CascadeContext,
  log: Logger,
): Promise<string[]> {
  const children = await outageRepository.findActiveChildren(parent.id);
  if (children.length === 0) return [];

  const impact = await outageRepository.findLatestImpact(parent.id);
  const coveredIds = new Set(impact?.affectedElementIds ?? []);
  const canVerify = impact !== null && impact !== undefined && !impact.overflowed;

  const resolved: string[] = [];

  for (const child of children) {
    if (canVerify && !coveredIds.has(child.cbsId)) {
      log.info(
        { outageId: child.id, parentOutageId: parent.id },
        'alt kesintinin elemanı üst etki kümesinde değil, otomatik kapatılmadı',
      );
      continue;
    }

    const updated = await db.transaction(async (tx) => {
      const row = await outageRepository.updateWithVersionTx(
        tx,
        child.id,
        child.version,
        { status: 'ENERGIZED', endedAt: child.endedAt ?? endedAt },
        {
          fromStatus: child.status,
          actor: SYSTEM_ACTOR,
          origin: 'SYSTEM',
          correlationId: ctx.correlationId,
        },
      );
      if (!row) return null;

      await enqueueOutageEnergizedIfNeededTx(tx, child.status, row, {
        origin: 'SYSTEM',
        actor: SYSTEM_ACTOR,
        correlationId: ctx.correlationId,
        causedBy: ctx.causedBy,
      });
      return row;
    });

    if (updated) resolved.push(updated.id);
  }

  if (resolved.length > 0) {
    log.info({ parentOutageId: parent.id, resolvedCount: resolved.length }, 'kapsanan kesintiler otomatik çözüldü');
  }

  return resolved;
}
