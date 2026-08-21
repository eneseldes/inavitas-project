import { ApiError } from '../../shared/api/errors.ts';

/**
 * Sunucudaki kapılardan dönen hata kodları → çeviri anahtarları.
 *
 * Genel `outage.toast.createError` yerine spesifik mesaj gösterilir: kullanıcı "oluşturulamadı"
 * değil, **neden** oluşturulamadığını okumalı.
 */
const BLOCK_MESSAGE_KEY: Record<string, string> = {
  COMPONENT_DE_ENERGIZED: 'error.COMPONENT_DE_ENERGIZED',
  OUTAGE_ALREADY_ACTIVE: 'error.OUTAGE_ALREADY_ACTIVE',
  WORK_ORDER_ALREADY_ACTIVE: 'error.WORK_ORDER_ALREADY_ACTIVE',
  OUT_OF_SCOPE: 'error.OUT_OF_SCOPE',
};

/** Kayıt oluşturma hatasını gösterilecek çeviri anahtarına çevirir. */
export function toCreateErrorMessage(
  err: unknown,
  kind: 'outage' | 'workOrder',
  t: (key: string) => string,
): string {
  if (err instanceof ApiError) {
    const specific = BLOCK_MESSAGE_KEY[err.code];
    if (specific) return t(specific);
    // Sunucu zaten anahtar döndürüyorsa (ör. doğrulama hataları) o kullanılır.
    return t(err.message);
  }
  return t(kind === 'outage' ? 'outage.toast.createError' : 'work-order.toast.createError');
}

/** Kapı engelinin arayüzde gösterilecek sebep metninin anahtarı. */
export function gateBlockMessageKey(
  kind: 'outage' | 'workOrder',
  guards: { outageBlockReason?: 'DE_ENERGIZED' | 'ALREADY_ACTIVE' },
): string {
  if (kind === 'workOrder') return 'map.block.workOrderActive';
  return guards.outageBlockReason === 'ALREADY_ACTIVE' ? 'map.block.outageActive' : 'map.block.deEnergized';
}
