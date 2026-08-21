import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import { SelectField, TextField } from '../../shared/components/form';
import { toDateTimeLocalInput } from '../../shared/datetime.ts';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { useLabels } from '../i18n/useLabels.ts';
import { useCreateOutage } from '../outages/useOutages.ts';
import { WORK_ORDER_TYPES } from '../../types/work-order.ts';
import { useCreateWorkOrder } from '../work-orders/useWorkOrders.ts';
import type { NetworkComponentDetail } from '../../types/network.ts';
import { CascadeConfirmDialog } from './CascadeConfirmDialog.tsx';
import { gateBlockMessageKey, toCreateErrorMessage } from './operationErrors.ts';
import { DetailRow, DetailSection } from './MapDetailRows.tsx';
import { useImpactPreview } from './useNetwork.ts';
import { useOperationGuards } from './useOperationGuards.ts';
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
 * Onay adımı bir izin kapısı DEĞİLDİR: uyarı artık sayının kendisidir — "1.934 eleman ·
 * 707 abone" satırı kırmızı bir şeritten daha fazlasını söyler. Yetki kararı sunucuda,
 * elemanın idari birimi üzerinden verilir.
 */
export function CreateOperationDialog({ component, kind, onClose }: CreateOperationDialogProps) {
  const { t } = useTranslation();
  const [cascadePending, setCascadePending] = useState(false);
  const cascadeConfirmedRef = useRef(false);
  const labels = useLabels();
  const { data: preview, isLoading: isPreviewLoading, isError: isPreviewError } = useImpactPreview(component.id);
  // `withCascade`: alt kesinti listesi yalnız burada, kaskad onay modalinde gösteriliyor —
  // eleman seçmenin bedeli olmasın diye önizleme yalnız bu modal açıkken bağlanır.
  const guards = useOperationGuards(component.id, { withCascade: true });
  const { show } = useToast();
  const createOutage = useCreateOutage();
  const createWorkOrder = useCreateWorkOrder();

  // Sunucudaki 409 kapıları burada erkenden gösterilir; karar yine sunucuda verilir.
  const isGateBlocked = kind === 'outage' ? guards.outageBlocked : guards.workOrderBlocked;
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

  /**
   * Alt kesinti varsa kaskad onay modalı çıkar. Onay bir API alanı olarak **gönderilmez** —
   * bağı zaten sunucu kuruyor; modal kullanıcıya ne olacağını söyler.
   *
   * Onay, form doğrulamasından **sonra** sorulur. Doğrulamadan önce sorulsaydı geçersiz
   * bir formda modal açılır, kullanıcı onaylar, gönderim sessizce doğrulamaya takılır ve
   * modal hiç kapanmazdı.
   */
  const onSubmitOutage = outageForm.handleSubmit(async (values) => {
    if (guards.childOutageCount > 0 && !cascadeConfirmedRef.current) {
      setCascadePending(true);
      return;
    }

    try {
      await createOutage.mutateAsync({
        cbsId: component.id,
        startedAt: new Date(values.startedAt).toISOString(),
        endedAt: values.endedAt ? new Date(values.endedAt).toISOString() : undefined,
      });
      show('success', t('outage.toast.createSuccess'));
      onClose();
    } catch (err) {
      outageForm.setError('root', { message: toCreateErrorMessage(err, 'outage', t) });
    } finally {
      // Yeniden denemede onay tekrar sorulur: bu arada alt kesinti kümesi değişmiş olabilir.
      cascadeConfirmedRef.current = false;
      setCascadePending(false);
    }
  });

  const confirmCascade = () => {
    cascadeConfirmedRef.current = true;
    setCascadePending(false);
    void onSubmitOutage();
  };

  const onSubmitWorkOrder = workOrderForm.handleSubmit(async (values) => {
    try {
      await createWorkOrder.mutateAsync({ cbsId: component.id, type: values.type });
      show('success', t('work-order.toast.createSuccess'));
      onClose();
    } catch (err) {
      workOrderForm.setError('root', { message: toCreateErrorMessage(err, 'workOrder', t) });
    }
  });

  const rootError = kind === 'outage' ? outageForm.formState.errors.root : workOrderForm.formState.errors.root;
  const isSubmitting = kind === 'outage' ? outageForm.formState.isSubmitting : workOrderForm.formState.isSubmitting;

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={kind === 'outage' ? onSubmitOutage : onSubmitWorkOrder} noValidate>
        {rootError && <div className="form-error-banner">{rootError.message}</div>}

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

        {isGateBlocked && <p className={styles.blocked}>{t(gateBlockMessageKey(kind, guards))}</p>}

        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            {t('common.action.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isPreviewLoading || isGateBlocked}
            className="btn btn--primary"
          >
            {isSubmitting
              ? t('common.action.creating')
              : kind === 'outage'
                ? t('map.action.createOutage')
                : t('map.action.createWorkOrder')}
          </button>
        </div>
      </form>

      {cascadePending && (
        <CascadeConfirmDialog
          childOutages={guards.childOutages}
          childOutageCount={guards.childOutageCount}
          onCancel={() => setCascadePending(false)}
          // Onay sonrası istek yine AYNI uca gider — oluşturma yolu tektir.
          onConfirm={confirmCascade}
        />
      )}
    </Modal>
  );
}
