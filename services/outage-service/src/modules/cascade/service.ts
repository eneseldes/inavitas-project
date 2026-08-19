/**
 * Kaskad motoru — kesintiler arası kapsama/yükselme ilişkilerini kurar.
 *
 * Etki kümesi `network-service`'ten olayla geldiği ve `outage_impact`'e yazıldığı için
 * kapsama tespiti graf gezmeden, tek bir jsonb kapsama (`@>`) sorgusuyla yapılır.
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

/**
 * Etki hesabı yazıldıktan sonra kaskad ilişkilerini kurar.
 *
 * İki yön birden değerlendirilir:
 * - **Kapsama:** bu kesintinin elemanı, süren başka bir kesintinin etki kümesindeyse
 *   o kesinti üsttür; müşteri-dakika yalnız üstte sayılır.
 * - **Yükselme:** bu kesintinin etki kümesi, süren ve henüz bir üste bağlanmamış
 *   kesintilerin elemanlarını içeriyorsa onlar bu kesintinin altına alınır (`SUPERSEDES`).
 *
 * Her bağ öncesi `parentOutageId` zinciri taranır; döngü yaratacak bağ **kurulmaz**.
 */
export async function applyCascade(
  outage: OutageRow,
  affectedElementIds: string[],
  ctx: CascadeContext,
  log: Logger,
): Promise<CascadeResult> {
  const result: CascadeResult = { parentOutageId: null, supersededOutageIds: [] };

  const nodes = await loadCascadeNodes();

  // --- Kapsama: bu kesintiyi kapsayan en dar etkili üst kesinti ---
  if (outage.parentOutageId === null) {
    const containing = await outageRepository.findContainingOutages(outage.cbsId, outage.id);

    for (const candidate of containing) {
      const check = canLinkParent(outage.id, candidate.id, nodes);
      if (!check.allowed) {
        log.warn(
          { outageId: outage.id, parentOutageId: candidate.id, reason: check.reason },
          'kaskad bağı döngü yaratacaktı, atlandı',
        );
        continue;
      }

      const linked = await db.transaction(async (tx) => {
        const ok = await outageRepository.linkCascadeTx(tx, candidate.id, outage.id, 'CONTAINS');
        if (ok) await enqueueOutageCascadedTx(tx, candidate.id, outage.id, 'CONTAINS', ctx);
        return ok;
      });

      if (linked) {
        result.parentOutageId = candidate.id;
        nodes.set(outage.id, { id: outage.id, parentOutageId: candidate.id });
        log.info({ outageId: outage.id, parentOutageId: candidate.id }, 'kesinti üst kesintiye bağlandı');
        break; // en dar etkili aday ilk sırada — daha genişini aramaya gerek yok
      }
    }
  }

  // --- Yükselme: bu kesintinin kapsadığı, henüz bağlanmamış alt kesintiler ---
  if (affectedElementIds.length > 0) {
    const contained = await outageRepository.findContainedOutages(affectedElementIds, outage.id);

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
 * kesintinin en güncel etki kümesinde duruyor olmalıdır. Manevra sonucu etki revize
 * edilip alt eleman kümeden çıktıysa o kesinti kendi başına sürüyor demektir ve
 * otomatik kapatılmaz.
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

  const resolved: string[] = [];

  for (const child of children) {
    if (!coveredIds.has(child.cbsId)) {
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
