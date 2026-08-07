import { FiArrowRight, FiEdit2, FiLock } from 'react-icons/fi';
import { Modal } from '../../shared/components/Modal.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { ORIGIN_LABELS } from '../../shared/labels.ts';
import type { Outage } from '../../types/outage.ts';
import { isLocked } from './columns.tsx';
import styles from './OutageHistoryDialog.module.scss';
import { useOutageHistory } from './useOutages.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'medium' });

export function OutageHistoryDialog({ outage, onClose, onEdit }: { outage: Outage; onClose: () => void; onEdit: () => void }) {
  const { data, isLoading } = useOutageHistory(outage.id);
  const locked = isLocked(outage.status);

  return (
    <Modal
      title={`Durum Geçmişi — ${outage.id.slice(0, 8)}`}
      onClose={onClose}
      size="lg"
      headerActions={
        locked ? (
          <span className="locked-cell" title="Arşivlenmiş/iptal edilmiş kesinti kilitlidir, düzenlenemez">
            <FiLock />
            Kilitli
          </span>
        ) : (
          <button type="button" onClick={onEdit} className="icon-btn icon-btn--sm" title="Kesintiyi güncelle">
            <FiEdit2 />
          </button>
        )
      }
    >
      <div className={styles.tableWrap}>
        {isLoading && <p>Yükleniyor…</p>}
        {data && (
          <table className="table">
            <thead>
              <tr>
                <th>Tarih / Saat</th>
                <th>Önceki Durum</th>
                <th className={styles.arrowCol}></th>
                <th>Yeni Durum</th>
                <th>İşlem Sahibi</th>
                <th>Kaynak</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`text-muted ${styles.emptyCell}`}>
                    Geçmiş kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                data.items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-mono">{dateFormatter.format(new Date(entry.changedAt))}</td>
                    <td>
                      {entry.fromStatus ? (
                        <StatusBadge status={entry.fromStatus} />
                      ) : (
                        <span className="text-muted">Oluşturuldu</span>
                      )}
                    </td>
                    <td>
                      <FiArrowRight className={styles.arrowIcon} />
                    </td>
                    <td>
                      <StatusBadge status={entry.toStatus} />
                    </td>
                    <td>{entry.actor === 'SYSTEM' ? 'Sistem' : entry.actor}</td>
                    <td>{ORIGIN_LABELS[entry.origin]}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
