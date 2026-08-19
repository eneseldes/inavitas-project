import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { FiAlertTriangle } from 'react-icons/fi';
import { clsx } from 'clsx';
import { z } from 'zod';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { SelectField, TextField } from '../../shared/components/form';
import { ApiError } from '../../shared/api/errors.ts';
import { toDateTimeLocalInput } from '../../shared/datetime.ts';
import { useAuth } from '../auth/useAuth.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import { useCreateOutage } from '../outages/useOutages.ts';
import { WORK_ORDER_TYPES } from '../../types/work-order.ts';
import { useCreateWorkOrder } from '../work-orders/useWorkOrders.ts';
import type { NetworkComponentDetail } from '../../types/network.ts';
import { DetailRow, DetailSection } from './MapDetailRows.tsx';
import { useImpactPreview } from './useNetwork.ts';
import styles from './CreateOperationDialog.module.scss';

interface CreateOperationDialogProps {
  component: NetworkComponentDetail;
  /** Kaydın türü — başlık, alanlar ve gönderilen uç bunlara göre değişir. */
  kind: 'outage' | 'workOrder';
  onClose: () => void;
}

/** Bitiş zamanı verilmişse başlangıç zamanından önce olamaz. */
function useOutageSchema() {
  const { t } = useTranslation();
  return z
    .object({
      startedAt: z.string().min(1, t('outage.validation.startedAtRequired')),
      endedAt: z.string().optional(),
    })
    .refine((data) => !data.endedAt || new Date(data.endedAt) >= new Date(data.startedAt), {
      message: t('outage.validation.endedAtBeforeStarted'),
      path: ['endedAt'],
    });
}

const workOrderSchema = z.object({ type: z.enum(WORK_ORDER_TYPES) });

/**
 * Haritadan kesinti/iş emri açma — TEK adımda: etki önizlemesi ve kayıt formu aynı
 * modalde, onaylamak doğrudan `POST /outages` (ya da `/work-orders`) atar. Eskiden
 * önce bir "onay" modali, sonra tablodaki ile aynı ayrı bir "oluştur" modali açılırdı —
 * ikisi de aynı bilgiyi (eleman, etki) tekrar göstermeden aynı anda yapılabilecek iki
 * ayrı tıklamaya bölünmüştü.
 *
 * ⚠️ Buradaki etki sayısı bir bilgilendirmedir, bir yetki kararı değildir. Kaydın kendisi
 * sunucuda read-model'den okunan topoloji seviyesiyle yeniden doğrulanır.
 */
export function CreateOperationDialog({ component, kind, onClose }: CreateOperationDialogProps) {
  const { t } = useTranslation();
  const labels = useLabels();
  const { hasPermission } = useAuth();
  const { data: preview, isLoading: isPreviewLoading, isError: isPreviewError } = useImpactPreview(component.id);
  const { show } = useToast();
  const createOutage = useCreateOutage();
  const createWorkOrder = useCreateWorkOrder();

  const isHighImpact = preview?.highImpact ?? false;
  /**
   * Yüksek etkili kesinti ek izin ister; yoksa gönderim engellenir.
   *
   * İş emrinde burada engellenmez: ek izin yalnız **kesintiye yol açan** türlerde
   * (`PLANNED_OUTAGE_WORK_ORDER` / `UNPLANNED_OUTAGE_WORK_ORDER`) aranıyor ve tür
   * aşağıda seçiliyor — burada kesip atmak, aynı direkte aydınlatma iş emri açmayı da
   * yasaklardı. Uyarı yine gösterilir, kararı sunucu türle birlikte verir.
   */
  const isBlocked = kind === 'outage' && isHighImpact && !hasPermission('outage:write-high-impact');
  const title = kind === 'outage' ? t('map.confirm.outageTitle') : t('map.confirm.workOrderTitle');
  const outageSchema = useOutageSchema();

  const outageForm = useForm<z.infer<typeof outageSchema>>({
    resolver: zodResolver(outageSchema),
    mode: 'onSubmit',
    defaultValues: { startedAt: toDateTimeLocalInput(new Date()) },
  });
  const workOrderForm = useForm<z.infer<typeof workOrderSchema>>({
    resolver: zodResolver(workOrderSchema),
    mode: 'onSubmit',
    defaultValues: { type: 'BASIC_WORK' },
  });

  const onSubmitOutage = outageForm.handleSubmit(async (values) => {
    try {
      await createOutage.mutateAsync({
        cbsId: component.id,
        startedAt: new Date(values.startedAt).toISOString(),
        endedAt: values.endedAt ? new Date(values.endedAt).toISOString() : undefined,
      });
      show('success', t('outage.toast.createSuccess'));
      onClose();
    } catch (err) {
      outageForm.setError('root', { message: err instanceof ApiError ? t(err.message) : t('outage.toast.createError') });
    }
  });

  const onSubmitWorkOrder = workOrderForm.handleSubmit(async (values) => {
    try {
      await createWorkOrder.mutateAsync({ cbsId: component.id, type: values.type });
      show('success', t('work-order.toast.createSuccess'));
      onClose();
    } catch (err) {
      workOrderForm.setError('root', {
        message: err instanceof ApiError ? t(err.message) : t('work-order.toast.createError'),
      });
    }
  });

  const rootError = kind === 'outage' ? outageForm.formState.errors.root : workOrderForm.formState.errors.root;
  const isSubmitting = kind === 'outage' ? outageForm.formState.isSubmitting : workOrderForm.formState.isSubmitting;

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={kind === 'outage' ? onSubmitOutage : onSubmitWorkOrder} noValidate>
        {rootError && <div className="form-error-banner">{rootError.message}</div>}

        {isHighImpact && (
          <p className={styles.highImpactBanner}>
            <FiAlertTriangle /> {t('map.confirm.highImpactWarning')}
          </p>
        )}
        {isHighImpact && kind === 'workOrder' && <p className={styles.blocked}>{t('map.confirm.highImpactWorkOrderNote')}</p>}

        <div className={styles.info}>
          <DetailSection
            title={kind === 'outage' ? t('map.confirm.outageInfoTitle') : t('map.confirm.workOrderInfoTitle')}
          >
            <DetailRow label={t('map.confirm.componentLabel')}>
              <span className="font-mono">{component.id}</span>
              {component.name && ` · ${component.name}`}
            </DetailRow>
            <DetailRow label={t('map.result.column.type')}>
              {component.breakerRole
                ? t(`network.enum.breakerRole.${component.breakerRole}`)
                : t(`network.enum.componentType.${component.type}`)}
            </DetailRow>
            <DetailRow label={t('map.confirm.locationLabel')}>
              {component.unitAncestors.map((u) => u.name).join(' › ')}
            </DetailRow>
          </DetailSection>

          <DetailSection title={t('map.confirm.affectedAssetsTitle')}>
            {isPreviewLoading && <p className={styles.pending}>{t('common.loading')}</p>}
            {isPreviewError && <p className={styles.pending}>{t('map.confirm.previewFailed')}</p>}
            {preview && preview.radialityViolated && (
              // Radyallik bozukken etki kümesi güvenilmez; sayı uydurmak yerine durum söylenir.
              <p className={styles.pending}>{t('map.trace.radialityViolated')}</p>
            )}
            {preview && !preview.radialityViolated && (
              <>
                <DetailRow label={t('map.confirm.affectedElementsLabel')}>
                  {preview.affectedElementCount.toLocaleString('tr-TR')}
                </DetailRow>
                <DetailRow label={t('map.panel.detail.field.customerCount')}>
                  {preview.affectedCustomerCount.toLocaleString('tr-TR')}
                </DetailRow>
              </>
            )}
          </DetailSection>
        </div>

        {kind === 'outage' && (
          <>
            <TextField
              label={t('outage.dialog.create.startedAtLabel')}
              type="datetime-local"
              error={outageForm.formState.errors.startedAt?.message}
              {...outageForm.register('startedAt')}
            />
            <TextField
              label={t('outage.dialog.create.endedAtLabel')}
              type="datetime-local"
              hint={t('outage.dialog.create.endedAtHint', { status: labels.outageStatus('ENERGIZED') })}
              error={outageForm.formState.errors.endedAt?.message}
              {...outageForm.register('endedAt')}
            />
          </>
        )}

        {kind === 'workOrder' && (
          <SelectField label={t('work-order.dialog.create.typeLabel')} {...workOrderForm.register('type')}>
            {WORK_ORDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {labels.workOrderType(type)}
              </option>
            ))}
          </SelectField>
        )}

        {isBlocked && <p className={styles.blocked}>{t('map.confirm.highImpactForbidden')}</p>}

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isPreviewLoading || isBlocked}
            className={clsx('btn', isHighImpact ? 'btn--danger' : 'btn--primary')}
          >
            {isSubmitting
              ? t('common.action.creating')
              : kind === 'outage'
                ? t('map.action.createOutage')
                : t('map.action.createWorkOrder')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
