import { FiArrowRight, FiEdit2 } from 'react-icons/fi';
import { Modal } from '../../shared/components/Modal.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { ORIGIN_LABELS } from '../../shared/labels.ts';
import type { WorkOrder } from '../../types/work-order.ts';
import styles from './WorkOrderHistoryDialog.module.scss';
import { useWorkOrderHistory } from './useWorkOrders.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'medium' });

export function WorkOrderHistoryDialog({ workOrder, onClose, onEdit }: { workOrder: WorkOrder; onClose: () => void; onEdit: () => void }) {
  const { data, isLoading } = useWorkOrderHistory(workOrder.id);

  return (
    <Modal
      title={`Durum Geçmişi — ${workOrder.id.slice(0, 8)}`}
      onClose={onClose}
      size="lg"
      headerActions={
        <button type="button" onClick={onEdit} className="icon-btn icon-btn--sm" title="İş emrini güncelle">
          <FiEdit2 />
        </button>
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
