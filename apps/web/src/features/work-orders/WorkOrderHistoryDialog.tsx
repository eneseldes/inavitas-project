import { FiArrowRight, FiEdit2 } from 'react-icons/fi';
import { Modal } from '../../shared/components/Modal.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import type { WorkOrder } from '../../types/work-order.ts';
import styles from './WorkOrderHistoryDialog.module.scss';
import { useWorkOrderHistory } from './useWorkOrders.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'medium' });

export function WorkOrderHistoryDialog({ workOrder, onClose, onEdit }: { workOrder: WorkOrder; onClose: () => void; onEdit: () => void }) {
  const { data, isLoading } = useWorkOrderHistory(workOrder.id);
  const { t } = useTranslation();
  const labels = useLabels();

  return (
    <Modal
      title={t('work-order.dialog.history.title', { id: workOrder.id.slice(0, 8) })}
      onClose={onClose}
      size="lg"
      headerActions={
        <button type="button" onClick={onEdit} className="icon-btn icon-btn--sm" title={t('work-order.action.edit')}>
          <FiEdit2 />
        </button>
      }
    >
      <div className={styles.tableWrap}>
        {isLoading && <p>{t('common.loading')}</p>}
        {data && (
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.history.dateTime')}</th>
                <th>{t('common.history.prevStatus')}</th>
                <th className={styles.arrowCol}></th>
                <th>{t('common.history.newStatus')}</th>
                <th>{t('common.history.actor')}</th>
                <th>{t('common.history.origin')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`text-muted ${styles.emptyCell}`}>
                    {t('common.history.empty')}
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
                        <span className="text-muted">{t('common.history.created')}</span>
                      )}
                    </td>
                    <td>
                      <FiArrowRight className={styles.arrowIcon} />
                    </td>
                    <td>
                      <StatusBadge status={entry.toStatus} />
                    </td>
                    <td>{entry.actor}</td>
                    <td>{labels.origin(entry.origin)}</td>
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
