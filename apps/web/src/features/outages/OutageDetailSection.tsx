import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiArrowRight, FiLink, FiLock } from 'react-icons/fi';
import { z } from 'zod';
import { ApiError } from '../../shared/api/errors.ts';
import { DetailSectionLayout, type TabConfig } from '../../shared/components/DetailSectionLayout.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { isoToDateTimeLocalInput } from '../../shared/datetime.ts';
import { useAuth } from '../auth/useAuth.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import type { Outage, OutageStatus } from '../../types/outage.ts';
import { USER_SELECTABLE_NEXT_STATUSES, isLocked } from './columns.tsx';
import styles from '../../shared/components/DetailSectionLayout.module.scss';
import { useOutageHistory, usePatchOutage } from './useOutages.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'medium' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

function makeSchema(startedAt: string, invalidMessage: string) {
  return z
    .object({
      endedAt: z.string().optional(),
    })
    .refine((data) => !data.endedAt || new Date(data.endedAt) >= new Date(startedAt), {
      message: invalidMessage,
      path: ['endedAt'],
    });
}

interface OutageDetailSectionProps {
  outage: Outage;
  outages: Outage[];
  onSelectOutage: (outage: Outage) => void;
  onBack: () => void;
  onOpenWorkOrder: (workOrderId: string) => void;
}

export function OutageDetailSection({
  outage,
  outages,
  onSelectOutage,
  onBack,
  onOpenWorkOrder,
}: OutageDetailSectionProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'detail' | 'history'>('detail');

  const tabs: TabConfig<'detail' | 'history'>[] = [
    { id: 'detail', label: t('outage.tab.detail', undefined, 'Detay') },
    { id: 'history', label: t('outage.tab.history', undefined, 'Durum Geçmişi') },
  ];

  return (
    <DetailSectionLayout<Outage, 'detail' | 'history'>
      title={`${outage.id.slice(0, 8)} ${t('outage.detail.headerTitle', undefined, 'Kesinti Ayrıntıları')}`}
      onBack={onBack}
      items={outages}
      selectedItemId={outage.id}
      getItemKey={(item) => item.id}
      onSelectItem={onSelectOutage}
      renderListItem={(item) => (
        <>
          <div className={styles.listItemMain}>
            <span className="font-mono">{item.id.slice(0, 8)}</span>
            <StatusBadge status={item.status} />
          </div>
          <div className={styles.listItemMeta}>
            <span>{t('outage.list.startedAtLabel', undefined, 'Başlama')}: {shortDateFormatter.format(new Date(item.startedAt))}</span>
            <span>{t('outage.list.endedAtLabel', undefined, 'Bitiş')}: {item.endedAt ? shortDateFormatter.format(new Date(item.endedAt)) : '—'}</span>
          </div>
        </>
      )}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'detail' ? (
        <OutageDetailTab key={outage.id} outage={outage} onOpenWorkOrder={onOpenWorkOrder} />
      ) : (
        <OutageHistoryTab outageId={outage.id} />
      )}
    </DetailSectionLayout>
  );
}

/** Kesinti bilgileri ve durum atama sekmesi. */
function OutageDetailTab({
  outage,
  onOpenWorkOrder,
}: {
  outage: Outage;
  onOpenWorkOrder: (workOrderId: string) => void;
}) {
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const labels = useLabels();
  const { show } = useToast();
  const patchOutage = usePatchOutage();

  const locked = isLocked(outage.status);
  const options = USER_SELECTABLE_NEXT_STATUSES[outage.status] || [];
  const [nextStatus, setNextStatus] = useState<OutageStatus | ''>('');

  const schema = makeSchema(outage.startedAt, t('outage.validation.endedAtBeforeStarted'));

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      endedAt: isoToDateTimeLocalInput(outage.endedAt),
    },
  });

  useEffect(() => {
    reset({
      endedAt: isoToDateTimeLocalInput(outage.endedAt),
    });
    setNextStatus('');
  }, [outage, reset]);

  const hasChanges = isDirty || nextStatus !== '';

  const onSubmit = handleSubmit(async (values) => {
    try {
      await patchOutage.mutateAsync({
        id: outage.id,
        version: outage.version,
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(values.endedAt ? { endedAt: new Date(values.endedAt).toISOString() } : {}),
      });
      show('success', t('outage.toast.updateSuccess'));
      reset({ endedAt: values.endedAt });
      setNextStatus('');
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('outage.toast.updateError') });
    }
  });

  return (
    <div>
      {/* Kesinti bilgileri (Salt okunur alanlar) */}
      <div className={styles.infoGrid}>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>ID</span>
          <span className={`${styles.infoValue} font-mono`} title={outage.id}>
            {outage.id}
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>GIS ID</span>
          <span className={`${styles.infoValue} font-mono`}>{outage.gisId}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('outage.dialog.edit.currentStatusLabel', undefined, 'Mevcut Durum')}</span>
          <div>
            <StatusBadge status={outage.status} />
          </div>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('outage.column.startedAt')}</span>
          <span className={styles.infoValue}>{shortDateFormatter.format(new Date(outage.startedAt))}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('outage.column.endedAt')}</span>
          <span className={styles.infoValue}>
            {outage.endedAt ? shortDateFormatter.format(new Date(outage.endedAt)) : '—'}
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('outage.column.durationMinutes')}</span>
          <span className={styles.infoValue}>{outage.durationMinutes ?? '—'}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('outage.column.origin')}</span>
          <span className={styles.infoValue}>{labels.origin(outage.origin)}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('outage.column.workOrderId')}</span>
          <div>
            {outage.workOrderId ? (
              <button
                type="button"
                onClick={() => onOpenWorkOrder(outage.workOrderId!)}
                className="link"
                title={t('outage.action.openWorkOrder')}
              >
                <FiLink />
                <span className="font-mono">{outage.workOrderId.slice(0, 8)}</span>
              </button>
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Durum atama ve güncelleme bölümü */}
      <div style={{ marginTop: '1rem' }}>
        <h3 className={styles.sectionTitle}>{t('outage.detail.statusAssignmentTitle', undefined, 'Durum Atama & Güncelleme')}</h3>

        {locked ? (
          <div className="locked-cell">
            <FiLock /> {t('outage.action.locked')}
          </div>
        ) : hasPermission('outage:write') ? (
          <form onSubmit={onSubmit} noValidate className={styles.form}>
            {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

            <div className="field">
              <label htmlFor="endedAt" className="field__label">
                {t('outage.dialog.create.endedAtLabel')}
                <span className="field__hint">
                  {' '}
                  {t('outage.dialog.edit.endedAtHint', { status: labels.outageStatus('ENERGIZED') })}
                </span>
              </label>
              <input id="endedAt" type="datetime-local" className="input" {...register('endedAt')} />
              {errors.endedAt && <p className="field__error">{errors.endedAt.message}</p>}
            </div>

            <div className="field">
              <label htmlFor="nextStatus" className="field__label">
                {t('outage.dialog.edit.nextStatusLabel')}
              </label>
              {options.length > 0 ? (
                <select
                  id="nextStatus"
                  className="select"
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as OutageStatus)}
                >
                  <option value="" disabled>
                    {t('outage.dialog.edit.selectTransition')}
                  </option>
                  {options.map((status) => (
                    <option key={status} value={status}>
                      {labels.outageStatus(status)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="field__hint">{t('outage.dialog.edit.noTransitions')}</p>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" disabled={!hasChanges || isSubmitting} className="btn btn--primary">
                {isSubmitting ? t('common.action.saving') : t('common.action.save')}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-muted">{t('common.readOnly', undefined, 'Salt okunur modadasınız.')}</p>
        )}
      </div>
    </div>
  );
}

/** Kesinti durum geçmişi sekmesi. */
function OutageHistoryTab({ outageId }: { outageId: string }) {
  const { data, isLoading } = useOutageHistory(outageId);
  const { t } = useTranslation();
  const labels = useLabels();

  if (isLoading) return <p className="text-muted">{t('common.loading')}</p>;

  return (
    <div className={styles.tableWrap}>
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
          {!data || data.items.length === 0 ? (
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
    </div>
  );
}
