import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FiClipboard, FiLock, FiRepeat, FiX, FiZap } from 'react-icons/fi';
import { clsx } from 'clsx';
import { fetchOutage } from '../../features/outages/api.ts';
import { isLocked, USER_SELECTABLE_NEXT_STATUSES } from '../../features/outages/columns.tsx';
import { usePatchOutage } from '../../features/outages/useOutages.ts';
import { fetchWorkOrder } from '../../features/work-orders/api.ts';
import { NEXT_STATUSES } from '../../features/work-orders/columns.tsx';
import { usePatchWorkOrder } from '../../features/work-orders/useWorkOrders.ts';
import { ApiError } from '../api/errors.ts';
import { OUTAGE_STATUS_LABELS, WORK_ORDER_STATUS_LABELS } from '../labels.ts';
import type { Outage, OutageStatus } from '../../types/outage.ts';
import type { WorkOrder, WorkOrderStatus } from '../../types/work-order.ts';
import styles from './QuickStatusWidget.module.scss';
import { StatusBadge } from './StatusBadge.tsx';
import { useToast } from './Toast.tsx';

type EntityType = 'outage' | 'work-order';

/**
 * GEÇİCİ demo widget'ı — sağ altta duran chatbot tarzı hızlı durum geçişi.
 *
 * Kasıtlı olarak kendi kendine yeten TEK dosya: hangi satırın seçildiğini
 * DataGrid'e/sayfa bileşenlerine prop veya context ile bağlanmadan, "A"
 * tuşuna basıldığı anda fare imlecinin altındaki `<tr>`'yi DOM'dan okuyarak
 * bulur (ID sütunundaki `title` attribute'u — bkz. outages/work-orders
 * columns.tsx) ve o kaydı ilgili API'den taze çeker. Bu yüzden dışarıda
 * TEK bir dokunuş yeterli: AppShell.tsx'teki `<QuickStatusWidget />` satırı.
 * Kaldırılacağı zaman bu dosya + eşlik eden .module.scss silinip o satır
 * kaldırılması yeterli.
 */
export function QuickStatusWidget() {
  const [isOpen, setOpen] = useState(false);
  const [activeType, setActiveType] = useState<EntityType>('outage');
  const [selectedOutage, setSelectedOutage] = useState<Outage | null>(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  const { show } = useToast();

  // Fare pozisyonunu hafifçe takip et — "A" tuşuna basıldığında imlecin
  // o an hangi satırın üzerinde olduğunu `elementFromPoint` ile bulmak için.
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousemove', onMouseMove);
    return () => document.removeEventListener('mousemove', onMouseMove);
  }, []);

  // Global "A" kısayolu: her zaman aktif (panel kapalıyken de çalışır).
  // Bir input/select/textarea'ya odaklanmışken (ör. sütun filtresine "a"
  // yazarken) yanlışlıkla tetiklenmesin diye activeElement kontrol edilir.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'a') return;

      const active = document.activeElement;
      if (active && ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName)) return;

      const el = document.elementFromPoint(mousePos.current.x, mousePos.current.y);
      const row = el?.closest<HTMLTableRowElement>('table.table tbody tr');
      if (!row) return;

      const id = row.cells[0]?.querySelector('[title]')?.getAttribute('title');
      if (!id) return;

      const type: EntityType | null = location.pathname.startsWith('/work-orders')
        ? 'work-order'
        : location.pathname.startsWith('/outages')
          ? 'outage'
          : null;
      if (!type) return;

      if (type === 'outage') {
        fetchOutage(id)
          .then(setSelectedOutage)
          .catch(() => show('error', 'Kesinti getirilemedi'));
      } else {
        fetchWorkOrder(id)
          .then(setSelectedWorkOrder)
          .catch(() => show('error', 'İş emri getirilemedi'));
      }
      setActiveType(type);
      setOpen(true);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [show]);

  // Panel açıkken Escape ile / dışa tıklayınca kapanır.
  useEffect(() => {
    if (!isOpen) return;

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onEscape);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Hızlı durum geçişi"
        className={clsx(styles.fab, isOpen && styles.fabActive)}
      >
        <FiRepeat />
      </button>

      {isOpen && (
        <div ref={panelRef} className={styles.panel}>
          <div className={styles.header}>
            <h2 className={styles.title}>Hızlı Durum Geçişi</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className="icon-btn icon-btn--sm">
              <FiX />
            </button>
          </div>

          <div className={styles.typeToggle}>
            <button
              type="button"
              onClick={() => setActiveType('outage')}
              className={clsx(styles.typeButton, activeType === 'outage' && styles.typeButtonActive)}
            >
              <FiZap /> Kesinti
            </button>
            <button
              type="button"
              onClick={() => setActiveType('work-order')}
              className={clsx(styles.typeButton, activeType === 'work-order' && styles.typeButtonActive)}
            >
              <FiClipboard /> İş Emri
            </button>
          </div>

          {activeType === 'outage' ? (
            <OutageQuickStatus outage={selectedOutage} onClear={() => setSelectedOutage(null)} />
          ) : (
            <WorkOrderQuickStatus workOrder={selectedWorkOrder} onClear={() => setSelectedWorkOrder(null)} />
          )}
        </div>
      )}
    </>
  );
}

const HOTKEY_HINT = (
  <p className="field__hint">
    Bir satırın üzerine gelip <strong>A</strong> tuşuna basın.
  </p>
);

function OutageQuickStatus({ outage, onClear }: { outage: Outage | null; onClear: () => void }) {
  const patchOutage = usePatchOutage();
  const { show } = useToast();

  if (!outage) return HOTKEY_HINT;

  const locked = isLocked(outage.status);
  const options = USER_SELECTABLE_NEXT_STATUSES[outage.status];

  const onChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = e.target.value as OutageStatus;
    e.target.value = '';
    if (!nextStatus) return;

    try {
      await patchOutage.mutateAsync({ id: outage.id, status: nextStatus, version: outage.version });
      show('success', `Kesinti ${OUTAGE_STATUS_LABELS[nextStatus]} durumuna geçti`);
      onClear();
    } catch (err) {
      show('error', err instanceof ApiError ? err.message : 'Durum güncellenemedi');
    }
  };

  return (
    <>
      <SelectionSummary id={outage.id} gisId={outage.gisId} status={outage.status} />

      {locked ? (
        <span className="locked-cell" title="Arşivlenmiş/iptal edilmiş kesinti kilitlidir, düzenlenemez">
          <FiLock />
          Kilitli
        </span>
      ) : options.length > 0 ? (
        <select defaultValue="" onChange={onChange} className={clsx('select', 'select--compact', styles.transitionSelect)}>
          <option value="" disabled>
            Geçiş seç…
          </option>
          {options.map((status) => (
            <option key={status} value={status}>
              → {OUTAGE_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      ) : (
        <p className="field__hint">Bu durumdan başka bir duruma geçiş yok.</p>
      )}
    </>
  );
}

function WorkOrderQuickStatus({ workOrder, onClear }: { workOrder: WorkOrder | null; onClear: () => void }) {
  const patchWorkOrder = usePatchWorkOrder();
  const { show } = useToast();

  if (!workOrder) return HOTKEY_HINT;

  const options = NEXT_STATUSES[workOrder.status];

  const onChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = e.target.value as WorkOrderStatus;
    e.target.value = '';
    if (!nextStatus) return;

    try {
      await patchWorkOrder.mutateAsync({ id: workOrder.id, status: nextStatus, version: workOrder.version });
      show('success', `İş emri ${WORK_ORDER_STATUS_LABELS[nextStatus]} durumuna geçti`);
      onClear();
    } catch (err) {
      show('error', err instanceof ApiError ? err.message : 'Durum güncellenemedi');
    }
  };

  return (
    <>
      <SelectionSummary id={workOrder.id} gisId={workOrder.gisId} status={workOrder.status} />

      {options.length > 0 ? (
        <select defaultValue="" onChange={onChange} className={clsx('select', 'select--compact', styles.transitionSelect)}>
          <option value="" disabled>
            Geçiş seç…
          </option>
          {options.map((status) => (
            <option key={status} value={status}>
              → {WORK_ORDER_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      ) : (
        <p className="field__hint">Bu durumdan başka bir duruma geçiş yok.</p>
      )}
    </>
  );
}

function SelectionSummary({ id, gisId, status }: { id: string; gisId: string; status: OutageStatus | WorkOrderStatus }) {
  return (
    <div className={styles.selection}>
      <div className={styles.selectionRow}>
        <span className={styles.selectionLabel}>ID</span>
        <span className="font-mono" title={id}>
          {id.slice(0, 8)}
        </span>
      </div>
      <div className={styles.selectionRow}>
        <span className={styles.selectionLabel}>GIS ID</span>
        <span className="font-mono">{gisId}</span>
      </div>
      <div className={styles.selectionRow}>
        <span className={styles.selectionLabel}>Durum</span>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
