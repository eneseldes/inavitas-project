import { FiArrowRight, FiEdit2, FiLock } from 'react-icons/fi';
import { Modal } from '../../shared/components/Modal.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import type { Outage } from '../../types/outage.ts';
import { isLocked } from './columns.tsx';
import styles from './OutageHistoryDialog.module.scss';
import { useOutageHistory } from './useOutages.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'medium' });

export function OutageHistoryDialog({ outage, onClose, onEdit }: { outage: Outage; onClose: () => void; onEdit: () => void }) {
  const { data, isLoading } = useOutageHistory(outage.id);
  const { t } = useTranslation();
  const labels = useLabels();
  const locked = isLocked(outage.status);

  return (
    <Modal
      title={t('outage.dialog.history.title', { id: outage.id.slice(0, 8) })}
      onClose={onClose}
      size="lg"
      headerActions={
        locked ? (
          <span className="locked-cell" title={t('outage.tooltip.locked')}>
            <FiLock />
            {t('outage.action.locked')}
          </span>
        ) : (
          <button type="button" onClick={onEdit} className="icon-btn icon-btn--sm" title={t('outage.action.edit')}>
            <FiEdit2 />
          </button>
        )
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
