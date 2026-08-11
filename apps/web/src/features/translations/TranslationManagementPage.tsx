import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FiCheck, FiPlus, FiSend } from 'react-icons/fi';
import { Modal } from '../../shared/components/Modal.tsx';
import { useToast } from '../../shared/components/Toast.tsx';
import type { UpdateTranslationInput } from '../../types/translation.ts';
import {
  createTranslationKey,
  fetchLocales,
  fetchNamespaces,
  fetchTranslationKeys,
  publishTranslations,
  updateTranslation,
} from '../i18n/api.ts';
import styles from './TranslationManagementPage.module.scss';

export function TranslationManagementPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [namespace, setNamespace] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Yeni Anahtar Formu State'leri
  const [newNs, setNewNs] = useState('common');
  const [newKeyName, setNewKeyName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // 1. Dinamik Dilleri Getir
  const { data: localesList = [] } = useQuery({
    queryKey: ['translation-locales'],
    queryFn: fetchLocales,
  });

  // 2. Namespace Listesini Getir
  const { data: namespacesList = [] } = useQuery({
    queryKey: ['translation-namespaces'],
    queryFn: fetchNamespaces,
  });

  // 3. Çeviri Anahtarlarını Getir
  const { data: keysData, isLoading } = useQuery({
    queryKey: ['translation-keys', namespace, page, search],
    queryFn: () => fetchTranslationKeys({ namespace: namespace || undefined, page, pageSize: 25, q: search }),
  });

  // 4. Güncelleme Mutasyonu
  const updateMutation = useMutation({
    mutationFn: (input: UpdateTranslationInput) => updateTranslation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['translation-keys'] });
      toast.show('success', 'Taslak metin kaydedildi');
    },
    onError: (err: Error) => {
      toast.show('error', err.message || 'Güncelleme başarısız');
    },
  });

  // 5. Yayınlama Mutasyonu
  const publishMutation = useMutation({
    mutationFn: () => publishTranslations({ namespace: namespace || undefined }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['translation-keys'] });
      void queryClient.invalidateQueries({ queryKey: ['i18n'] });
      toast.show('success', `${res.publishedCount} çeviri canlıya yayınlandı`);
    },
    onError: (err: Error) => {
      toast.show('error', err.message || 'Yayınlama başarısız');
    },
  });

  // 6. Yeni Anahtar Ekleme Mutasyonu
  const createKeyMutation = useMutation({
    mutationFn: () =>
      createTranslationKey({
        namespace: newNs,
        keyName: newKeyName,
        description: newDesc,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['translation-keys'] });
      toast.show('success', 'Yeni çeviri anahtarı eklendi');
      setIsModalOpen(false);
      setNewKeyName('');
      setNewDesc('');
    },
    onError: (err: Error) => {
      toast.show('error', err.message || 'Anahtar ekleme başarısız');
    },
  });

  const handleBlur = (
    transId: string | undefined,
    currentDraft: string | undefined,
    version: number | undefined,
    nextVal: string,
  ) => {
    if (!transId || version === undefined) return;
    if (nextVal === (currentDraft ?? '')) return;

    updateMutation.mutate({
      id: transId,
      draftValue: nextVal,
      version,
    });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Çeviri Yönetimi</h1>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.newKeyBtn}
            onClick={() => setIsModalOpen(true)}
          >
            <FiPlus /> Yeni Anahtar Ekle
          </button>

          <button
            type="button"
            className={styles.publishBtn}
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending}
          >
            <FiSend /> {publishMutation.isPending ? 'Yayınlanıyor...' : 'Değişiklikleri Yayınla'}
          </button>
        </div>
      </header>

      <div className={styles.filters}>
        <select
          className={styles.select}
          value={namespace}
          onChange={(e) => {
            setNamespace(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tüm Modüller (Namespaces)</option>
          {namespacesList.map((ns) => (
            <option key={ns.id} value={ns.name}>
              {ns.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          className={styles.input}
          placeholder="Anahtar adı ile ara..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className={styles.tableWrapper}>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Yükleniyor...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Anahtar Adı (Key)</th>
                {localesList.map((loc) => (
                  <th key={loc.code}>
                    {loc.name} ({loc.code}) {loc.isDefault && '★'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keysData?.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className={styles.keyName}>{row.keyName}</div>
                    {row.description && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {row.description}
                      </div>
                    )}
                  </td>

                  {localesList.map((loc) => {
                    const trans = row.translations[loc.code];
                    const isDirty =
                      trans && trans.publishedValue !== null && trans.draftValue !== trans.publishedValue;

                    return (
                      <td key={loc.code}>
                        <input
                          type="text"
                          className={`${styles.cellInput} ${isDirty ? styles.dirty : ''}`}
                          defaultValue={trans?.draftValue ?? ''}
                          onBlur={(e) =>
                            handleBlur(
                              trans?.id,
                              trans?.draftValue,
                              trans?.version,
                              e.target.value,
                            )
                          }
                        />
                        {trans?.publishedValue && (
                          <span className={styles.publishedText} title="Canlıdaki Değer">
                            Canlı: {trans.publishedValue}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {keysData?.items.length === 0 && (
                <tr>
                  <td colSpan={localesList.length + 1} style={{ textAlign: 'center', padding: '2rem' }}>
                    Çeviri anahtarı bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* YENİ ANAHTAR EKLEME MODALI */}
      {isModalOpen && (
        <Modal
          onClose={() => setIsModalOpen(false)}
          title="Yeni Çeviri Anahtarı Ekle"
        >
          <form
            className={styles.newKeyForm}
            onSubmit={(e) => {
              e.preventDefault();
              createKeyMutation.mutate();
            }}
          >
            <div className={styles.formGroup}>
              <label>Modül (Namespace)</label>
              <select
                className={styles.select}
                value={newNs}
                onChange={(e) => setNewNs(e.target.value)}
                required
              >
                {namespacesList.map((ns) => (
                  <option key={ns.id} value={ns.name}>
                    {ns.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Anahtar Adı (ör: outage.status.started)</label>
              <input
                type="text"
                className={styles.input}
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Açıklama (Opsiyonel)</label>
              <input
                type="text"
                className={styles.input}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button
                type="button"
                className={styles.newKeyBtn}
                onClick={() => setIsModalOpen(false)}
              >
                İptal
              </button>
              <button
                type="submit"
                className={styles.publishBtn}
                disabled={createKeyMutation.isPending}
              >
                <FiCheck /> Ekle
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
