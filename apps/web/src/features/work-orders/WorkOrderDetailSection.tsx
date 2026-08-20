import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiMap } from 'react-icons/fi';
import { z } from 'zod';
import { ApiError } from '../../shared/api/errors.ts';
import { DetailSectionLayout, type TabConfig } from '../../shared/components/DetailSectionLayout.tsx';
import { RecordLink } from '../../shared/components/RecordLink.tsx';
import { StatusBadge } from '../../shared/components/StatusBadge.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { SelectField } from '../../shared/components/form';
import { useAuth } from '../auth/useAuth.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import type { WorkOrder, WorkOrderStatus } from '../../types/work-order.ts';
import { NEXT_STATUSES } from './columns.tsx';
import styles from '../../shared/components/DetailSectionLayout.module.scss';
import { usePatchWorkOrder, useWorkOrderHistory } from './useWorkOrders.ts';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'medium' });
const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

interface WorkOrderDetailSectionProps {
  workOrder: WorkOrder;
  workOrders: WorkOrder[];
  onSelectWorkOrder: (workOrder: WorkOrder) => void;
  onBack: () => void;
  onOpenOutage: (outageId: string) => void;
}

export function WorkOrderDetailSection({
  workOrder,
  workOrders,
  onSelectWorkOrder,
  onBack,
  onOpenOutage,
}: WorkOrderDetailSectionProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'detail' | 'history'>('detail');

  const tabs: TabConfig<'detail' | 'history'>[] = [
    { id: 'detail', label: t('work-order.tab.detail', undefined, 'Detay') },
    { id: 'history', label: t('work-order.tab.history', undefined, 'Durum Geçmişi') },
  ];

  return (
    <DetailSectionLayout<WorkOrder, 'detail' | 'history'>
      title={`${workOrder.id.slice(0, 8)} ${t('work-order.detail.headerTitle', undefined, 'İş Emri Ayrıntıları')}`}
      onBack={onBack}
      items={workOrders}
      selectedItemId={workOrder.id}
      getItemKey={(item) => item.id}
      onSelectItem={onSelectWorkOrder}
      renderListItem={(item) => (
        <>
          <div className={styles.listItemMain}>
            <span className="font-mono">{item.id.slice(0, 8)}</span>
            <StatusBadge status={item.status} />
          </div>
          <div className={styles.listItemMeta}>
            <span>{t('work-order.list.createdAtLabel', undefined, 'Oluşturma')}: {shortDateFormatter.format(new Date(item.createdAt))}</span>
          </div>
        </>
      )}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'detail' ? (
        <WorkOrderDetailTab key={workOrder.id} workOrder={workOrder} onOpenOutage={onOpenOutage} />
      ) : (
        <WorkOrderHistoryTab workOrderId={workOrder.id} />
      )}
    </DetailSectionLayout>
  );
}

function useWorkOrderStatusSchema(requiredMessage: string) {
  return z.object({
    nextStatus: z.string().min(1, requiredMessage),
  });
}

/** İş emri detay ve durum atama sekmesi. */
function WorkOrderDetailTab({
  workOrder,
  onOpenOutage,
}: {
  workOrder: WorkOrder;
  onOpenOutage: (outageId: string) => void;
}) {
  const { hasPermission } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const labels = useLabels();
  const { show } = useToast();
  const patchWorkOrder = usePatchWorkOrder();

  const options = NEXT_STATUSES[workOrder.status] || [];
  const schema = useWorkOrderStatusSchema(t('work-order.dialog.edit.selectTransition'));

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: { nextStatus: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const nextStatus = values.nextStatus as WorkOrderStatus;
      await patchWorkOrder.mutateAsync({ id: workOrder.id, status: nextStatus, version: workOrder.version });
      show('success', t('work-order.toast.statusChanged', { status: labels.workOrderStatus(nextStatus) }));
      reset({ nextStatus: '' });
    } catch (err) {
      setError('root', { message: err instanceof ApiError ? t(err.message) : t('work-order.toast.updateError') });
    }
  });

  return (
    <div>
      {/* İş emri bilgileri (Salt okunur alanlar) */}
      <div className={styles.infoGrid}>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>ID</span>
          <span className={`${styles.infoValue} font-mono`} title={workOrder.id}>
            {workOrder.id}
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>CBS ID</span>
          {/* Çift yönlü bağ: CBS ID haritayı elemanın konumunda açar. Şebekeyi göremeyen
              kullanıcıya bağlantı verilmez, düz metin kalır. */}
          {hasPermission('network:read') ? (
            <button
              type="button"
              className="link"
              onClick={() => navigate(`/map?focus=${workOrder.cbsId}`)}
              title={t('map.action.showOnMap')}
            >
              <FiMap />
              <span className="font-mono">{workOrder.cbsId}</span>
            </button>
          ) : (
            <span className={`${styles.infoValue} font-mono`}>{workOrder.cbsId}</span>
          )}
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('work-order.dialog.edit.typeLabel', undefined, 'İş Emri Türü')}</span>
          <span className={styles.infoValue}>{labels.workOrderType(workOrder.type)}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('work-order.dialog.edit.currentStatusLabel', undefined, 'Mevcut Durum')}</span>
          <div>
            <StatusBadge status={workOrder.status} />
          </div>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('work-order.column.createdAt')}</span>
          <span className={styles.infoValue}>{shortDateFormatter.format(new Date(workOrder.createdAt))}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('work-order.column.origin')}</span>
          <span className={styles.infoValue}>{labels.origin(workOrder.origin)}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('work-order.dialog.edit.createdByLabel', undefined, 'Oluşturan')}</span>
          <span className={styles.infoValue}>{labels.actor(workOrder.createdBy)}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>{t('work-order.column.outageId')}</span>
          <div>
            {workOrder.outageId ? (
              <RecordLink
                id={workOrder.outageId}
                onClick={() => onOpenOutage(workOrder.outageId!)}
                title={t('work-order.action.openOutage')}
              />
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Durum atama ve güncelleme bölümü */}
      <div style={{ marginTop: '1rem' }}>
        <h3 className={styles.sectionTitle}>{t('work-order.detail.statusAssignmentTitle', undefined, 'Durum Atama & Güncelleme')}</h3>

        {hasPermission('workorder:write') ? options.length > 0 ? (
          <form onSubmit={onSubmit} noValidate className={styles.form}>
            {errors.root && <div className="form-error-banner">{errors.root.message}</div>}

            <SelectField label={t('work-order.dialog.edit.nextStatusLabel')} error={errors.nextStatus?.message} {...register('nextStatus')}>
              <option value="">{t('work-order.dialog.edit.selectTransition')}</option>
              {options.map((status) => (
                <option key={status} value={status}>
                  {labels.workOrderStatus(status)}
                </option>
              ))}
            </SelectField>

            <div className="form-actions">
              <button type="submit" disabled={isSubmitting || !isDirty} className="btn btn--primary">
                {isSubmitting ? t('common.action.saving') : t('common.action.save')}
              </button>
            </div>
          </form>
        ) : (
          <div className="field">
            <span className="field__label">{t('work-order.dialog.edit.nextStatusLabel')}</span>
            <p className="field__hint">{t('work-order.dialog.edit.noTransitions')}</p>
          </div>
        ) : (
          <p className="text-muted">{t('common.readOnly', undefined, 'Salt okunur modadasınız.')}</p>
        )}
      </div>
    </div>
  );
}

/** İş emri durum geçmişi sekmesi. */
function WorkOrderHistoryTab({ workOrderId }: { workOrderId: string }) {
  const { data, isLoading } = useWorkOrderHistory(workOrderId);
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
                <td>{labels.actor(entry.actor)}</td>
                <td>{labels.origin(entry.origin)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
