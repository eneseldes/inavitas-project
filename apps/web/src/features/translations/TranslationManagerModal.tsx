import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FiCheck, FiPlus, FiSend, FiTrash2, FiX } from 'react-icons/fi';
import { SiGooglegemini } from 'react-icons/si';
import { clsx } from 'clsx';
import { useAuth } from '../auth/useAuth.tsx';
import { useTranslation } from '../i18n/I18nProvider.tsx';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import type { UpdateTranslationInput } from '../../types/translation.ts';
import {
  autoTranslateKeys,
  createLocale,
  createTranslationKey,
  deleteTranslationKey,
  fetchLocales,
  fetchNamespaces,
  fetchTranslationKeys,
  publishTranslations,
  updateLocaleActive,
  updateTranslation,
} from '../i18n/api.ts';
import { useDebounce } from '../../shared/hooks/useDebounce.ts';
import styles from './TranslationManagerModal.module.scss';

/** Ayarlar popover'ından açılan çeviri yönetim modalı. */
export function TranslationManagerModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();

  const canWrite = hasPermission('translation:write');
  const canPublish = hasPermission('translation:publish');

  const tableWrapperRef = useRef<HTMLDivElement>(null);

  const [namespace, setNamespace] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAddLocaleOpen, setIsAddLocaleOpen] = useState(false);

  const [newNs, setNewNs] = useState('common');
  const [newKeyName, setNewKeyName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const [newLocaleCode, setNewLocaleCode] = useState('');
  const [newLocaleName, setNewLocaleName] = useState('');

  // "İkinci tıkla onay" — confirm()/alert() kullanılmaz. Yalnız bekleyen tek
  // silme/pasifleştirme işlemi olabilir, id ile takip edilir.
  const [confirmingKeyId, setConfirmingKeyId] = useState<string | null>(null);
  const [confirmingLocaleCode, setConfirmingLocaleCode] = useState<string | null>(null);
  const [aiCooldowns, setAiCooldowns] = useState<Record<string, boolean>>({});

  const { data: localesList = [] } = useQuery({ queryKey: ['translation-locales'], queryFn: fetchLocales });
  const { data: namespacesList = [] } = useQuery({ queryKey: ['translation-namespaces'], queryFn: fetchNamespaces });

  const prevLocalesCountRef = useRef(localesList.length);

  // Yeni dil eklendiğinde tabloyu sağa kaydır
  useEffect(() => {
    if (localesList.length > prevLocalesCountRef.current) {
      setTimeout(() => {
        if (tableWrapperRef.current) {
          tableWrapperRef.current.scrollTo({
            left: tableWrapperRef.current.scrollWidth,
            behavior: 'smooth',
          });
        }
      }, 150);
    }
    prevLocalesCountRef.current = localesList.length;
  }, [localesList.length]);

  const { data: keysData, isLoading } = useQuery({
    queryKey: ['translation-keys', namespace, page, pageSize, debouncedSearch, onlyMissing],
    queryFn: () =>
      fetchTranslationKeys({ namespace: namespace || undefined, page, pageSize, q: debouncedSearch, onlyMissing }),
  });

  const hasDirtyKeys = useMemo(() => {
    if (!keysData?.items) return false;
    return keysData.items.some((row) =>
      localesList.some((loc) => {
        const trans = row.translations[loc.code];
        const draft = trans?.draftValue ?? '';
        const published = trans?.publishedValue ?? '';
        return draft.trim() !== '' && draft !== published;
      }),
    );
  }, [keysData, localesList]);

  const updateMutation = useMutation({
    mutationFn: (input: UpdateTranslationInput) => updateTranslation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['translation-keys'] });
      toast.show('success', t('settings.translations.toast.draftSaved'));
    },
    onError: (err: Error) => toast.show('error', err.message || t('settings.translations.toast.updateFailed')),
  });

  const publishMutation = useMutation({
    mutationFn: () => publishTranslations({ namespace: namespace || undefined }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['translation-keys'] });
      void queryClient.invalidateQueries({ queryKey: ['i18n'] });
      toast.show('success', t('settings.translations.toast.publishSuccess', { count: res.publishedCount }));
    },
    onError: (err: Error) => toast.show('error', err.message || t('settings.translations.toast.publishFailed')),
  });

  const createKeyMutation = useMutation({
    mutationFn: () => createTranslationKey({ namespace: newNs, keyName: newKeyName, description: newDesc || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['translation-keys'] });
      toast.show('success', t('settings.translations.toast.keyCreated'));
      setIsCreateOpen(false);
      setNewKeyName('');
      setNewDesc('');
    },
    onError: (err: Error) => toast.show('error', err.message || t('settings.translations.toast.keyCreateFailed')),
  });

  const addLocaleMutation = useMutation({
    mutationFn: () => createLocale({ code: newLocaleCode, name: newLocaleName }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['translation-locales'] });
      void queryClient.invalidateQueries({ queryKey: ['translation-keys'] });
      toast.show('success', t('settings.translations.toast.localeAdded'));
      setIsAddLocaleOpen(false);
      setNewLocaleCode('');
      setNewLocaleName('');
    },
    onError: (err: Error) => toast.show('error', err.message || t('settings.translations.toast.localeAddFailed')),
  });

  // "Hepsini doldur" — görüntülenen namespace + tıklanan sütunun dili (Toplu / Batch istek).
  const autoFillColumnMutation = useMutation({
    mutationFn: (targetLocale: string) =>
      autoTranslateKeys({
        targetLocale,
        namespace: namespace || undefined,
        onlyMissing: true,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['translation-keys'] });
      toast.show('success', t('settings.translations.toast.autoFilled', { count: res.translatedCount }));
    },
    onError: (err: Error) => toast.show('error', err.message || t('settings.translations.toast.autoFillFailed')),
  });

  // "Bunu doldur" — tek hücre, dolu olsa da EZER (kullanıcı bilerek tetikliyor).
  const autoFillCellMutation = useMutation({
    mutationFn: (vars: { keyId: string; targetLocale: string }) =>
      autoTranslateKeys({ targetLocale: vars.targetLocale, keyIds: [vars.keyId], onlyMissing: false }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['translation-keys'] }),
    onError: (err: Error) => toast.show('error', err.message || t('settings.translations.toast.autoFillFailed')),
  });

  const handleAutoFillColumn = (targetLocale: string) => {
    if (aiCooldowns[targetLocale] || autoFillColumnMutation.isPending) return;

    // 5 saniyelik anti-spam bekleme süresi (cooldown timeout)
    setAiCooldowns((prev) => ({ ...prev, [targetLocale]: true }));
    setTimeout(() => {
      setAiCooldowns((prev) => ({ ...prev, [targetLocale]: false }));
    }, 5000);

    autoFillColumnMutation.mutate(targetLocale);
  };

  const deleteKeyMutation = useMutation({
    mutationFn: (id: string) => deleteTranslationKey(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['translation-keys'] });
      toast.show('success', t('settings.translations.toast.keyDeleted'));
      setConfirmingKeyId(null);
    },
    onError: (err: Error) => toast.show('error', err.message || t('settings.translations.toast.keyDeleteFailed')),
  });

  const deactivateLocaleMutation = useMutation({
    mutationFn: (code: string) => updateLocaleActive(code, false),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['translation-locales'] });
      toast.show('success', t('settings.translations.toast.localeDeactivated'));
      setConfirmingLocaleCode(null);
    },
    onError: (err: Error) => toast.show('error', err.message || t('settings.translations.toast.localeDeactivateFailed')),
  });

  const handleBlur = (
    transId: string | undefined,
    currentDraft: string | undefined,
    version: number | undefined,
    nextVal: string,
  ) => {
    if (!transId || version === undefined) return;
    if (nextVal === (currentDraft ?? '')) return;
    updateMutation.mutate({ id: transId, draftValue: nextVal, version });
  };

  return (
    <Modal
      title={t('settings.translations.title')}
      onClose={onClose}
      size="xl"
      headerActions={
        canWrite ? (
          <button type="button" className="btn btn--outline" onClick={() => setIsCreateOpen(true)}>
            <FiPlus /> {t('settings.translations.newKey')}
          </button>
        ) : undefined
      }
    >
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select
            className="select"
            value={namespace}
            onChange={(e) => {
              setNamespace(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('settings.translations.allModules')}</option>
            {namespacesList.map((ns) => (
              <option key={ns.id} value={ns.name}>
                {ns.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            className="input"
            placeholder={t('settings.translations.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => {
                setOnlyMissing(e.target.checked);
                setPage(1);
              }}
            />
            {t('settings.translations.onlyMissing')}
          </label>
        </div>

        {canPublish && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || !hasDirtyKeys}
          >
            <FiSend /> {publishMutation.isPending ? t('settings.translations.publishing') : t('settings.translations.publish')}
          </button>
        )}
      </div>

      <div className={styles.tableWrapper} ref={tableWrapperRef}>
        {isLoading ? (
          <div className={styles.loadingBox}>{t('common.loading')}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('settings.translations.columnKey')}</th>
                {localesList.map((loc) => (
                  <th key={loc.code}>
                    <div className={styles.localeHeader}>
                      <span>
                        {loc.name} ({loc.code}) {loc.isDefault && '★'}
                      </span>
                      <div className={styles.headerActions}>
                        {canWrite && (
                          <button
                            type="button"
                            className={clsx(styles.aiHeaderBtn, aiCooldowns[loc.code] && styles.cooldown)}
                            title={
                              aiCooldowns[loc.code]
                                ? t('settings.translations.cooldown', undefined, 'Lütfen bekleyin…')
                                : t('settings.translations.autoFill')
                            }
                            onClick={() => handleAutoFillColumn(loc.code)}
                            disabled={autoFillColumnMutation.isPending || !!aiCooldowns[loc.code]}
                          >
                            <SiGooglegemini />
                          </button>
                        )}
                        {canPublish && !loc.isDefault && (
                          confirmingLocaleCode === loc.code ? (
                            <>
                              <button
                                type="button"
                                className="icon-btn icon-btn--sm"
                                title={t('common.action.confirm')}
                                onClick={() => deactivateLocaleMutation.mutate(loc.code)}
                                disabled={deactivateLocaleMutation.isPending}
                              >
                                <FiCheck />
                              </button>
                              <button
                                type="button"
                                className="icon-btn icon-btn--sm"
                                title={t('common.action.cancel')}
                                onClick={() => setConfirmingLocaleCode(null)}
                              >
                                <FiX />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="icon-btn icon-btn--sm"
                              title={t('settings.translations.deactivateLocale')}
                              onClick={() => setConfirmingLocaleCode(loc.code)}
                            >
                              <FiTrash2 />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keysData?.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className={styles.keyNameRow}>
                      <div className="font-mono">{row.keyName}</div>
                      {canPublish && (
                        confirmingKeyId === row.id ? (
                          <>
                            <button
                              type="button"
                              className="icon-btn icon-btn--sm"
                              title={t('common.action.confirm')}
                              onClick={() => deleteKeyMutation.mutate(row.id)}
                              disabled={deleteKeyMutation.isPending}
                            >
                              <FiCheck />
                            </button>
                            <button
                              type="button"
                              className="icon-btn icon-btn--sm"
                              title={t('common.action.cancel')}
                              onClick={() => setConfirmingKeyId(null)}
                            >
                              <FiX />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="icon-btn icon-btn--sm"
                            title={t('settings.translations.deleteKey')}
                            onClick={() => setConfirmingKeyId(row.id)}
                          >
                            <FiTrash2 />
                          </button>
                        )
                      )}
                    </div>
                    {row.description && <div className={styles.keyDescription}>{row.description}</div>}
                  </td>

                  {localesList.map((loc) => {
                    const trans = row.translations[loc.code];
                    const draft = trans?.draftValue ?? '';
                    const published = trans?.publishedValue ?? '';
                    const isDirty = draft.trim() !== '' && draft !== published;

                    return (
                      <td key={loc.code}>
                        <div className={styles.cellWrap}>
                          <input
                            type="text"
                            className={clsx(styles.cellInput, isDirty && styles.dirty)}
                            defaultValue={trans?.draftValue ?? ''}
                            placeholder={t('settings.translations.cellPlaceholder', undefined, 'Çevirinizi buraya yazın…')}
                            readOnly={!canWrite}
                            onBlur={(e) => handleBlur(trans?.id, trans?.draftValue, trans?.version, e.target.value)}
                          />
                          {canWrite && (
                            <button
                              type="button"
                              className={styles.aiCellBtn}
                              title={t('settings.translations.autoFillCell')}
                              onClick={() => autoFillCellMutation.mutate({ keyId: row.id, targetLocale: loc.code })}
                              disabled={autoFillCellMutation.isPending}
                            >
                              <SiGooglegemini />
                            </button>
                          )}
                        </div>
                        <span
                          className={clsx(styles.publishedText, !trans?.publishedValue && styles.unpublished)}
                          title={t('settings.translations.liveValue')}
                        >
                          {trans?.publishedValue
                            ? t('settings.translations.liveValuePrefix', { value: trans.publishedValue })
                            : t('settings.translations.liveValueNone', undefined, 'Canlı: Henüz yayınlanmadı')}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {keysData?.items.length === 0 && (
                <tr>
                  <td colSpan={localesList.length + 1} className={styles.emptyCell}>
                    {t('settings.translations.emptyKeys')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {keysData && keysData.totalPages > 0 && (
        <div className={styles.paginationBar}>
          <div className={styles.paginationInfo}>
            <span>
              Toplam <strong>{keysData.total}</strong> çeviri anahtarı (Sayfa {keysData.page} / {keysData.totalPages})
            </span>
          </div>

          <div className={styles.paginationActions}>
            <div className={styles.pageSizeWrap}>
              <span>Satır:</span>
              <select
                className="select select--compact"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={1000}>Tümü (1000)</option>
              </select>
            </div>

            <div className={styles.pageButtons}>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Önceki
              </button>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setPage((p) => Math.min(keysData.totalPages, p + 1))}
                disabled={page >= keysData.totalPages}
              >
                Sonraki
              </button>
            </div>
          </div>
        </div>
      )}

      {canPublish && (
        <div className={styles.addLocaleRow}>
          {isAddLocaleOpen ? (
            <form
              className={styles.addLocaleForm}
              onSubmit={(e) => {
                e.preventDefault();
                addLocaleMutation.mutate();
              }}
            >
              <input
                className="input"
                placeholder={t('settings.translations.localeCodePlaceholder')}
                value={newLocaleCode}
                onChange={(e) => setNewLocaleCode(e.target.value)}
                required
              />
              <input
                className="input"
                placeholder={t('settings.translations.localeNamePlaceholder')}
                value={newLocaleName}
                onChange={(e) => setNewLocaleName(e.target.value)}
                required
              />
              <button type="submit" className="btn btn--primary" disabled={addLocaleMutation.isPending}>
                {t('common.action.add')}
              </button>
              <button type="button" className="btn btn--outline" onClick={() => setIsAddLocaleOpen(false)}>
                {t('common.action.cancel')}
              </button>
            </form>
          ) : (
            <button type="button" className="btn btn--outline" onClick={() => setIsAddLocaleOpen(true)}>
              <FiPlus /> {t('settings.translations.addLocale')}
            </button>
          )}
        </div>
      )}

      {isCreateOpen && (
        <Modal title={t('settings.translations.newKey')} onClose={() => setIsCreateOpen(false)}>
          <form
            className={styles.newKeyForm}
            onSubmit={(e) => {
              e.preventDefault();
              createKeyMutation.mutate();
            }}
          >
            <div className="field">
              <label className="field__label">{t('settings.translations.namespaceLabel')}</label>
              <select className="select" value={newNs} onChange={(e) => setNewNs(e.target.value)} required>
                {namespacesList.map((ns) => (
                  <option key={ns.id} value={ns.name}>
                    {ns.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field__label">{t('settings.translations.columnKey')}</label>
              <input className="input" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} required />
              <span className="field__hint">{t('settings.translations.keyNameHint')}</span>
            </div>

            <div className="field">
              <label className="field__label">{t('settings.translations.descriptionLabel')}</label>
              <input className="input" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn--outline" onClick={() => setIsCreateOpen(false)}>
                {t('common.action.cancel')}
              </button>
              <button type="submit" className="btn btn--primary" disabled={createKeyMutation.isPending}>
                <FiCheck /> {t('common.action.add')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  );
}
