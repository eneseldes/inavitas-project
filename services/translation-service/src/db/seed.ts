import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { bundleVersions, locales, translationKeys, translationNamespaces, translations } from './schema.ts';

/**
 * Veritabanı başlangıç verilerini (seed) hazırlar.
 *
 * Yeniden çalıştırılabilir yapıdadır (`onConflictDoNothing`) — çevirmenin elle
 * yaptığı düzeltmeyi ezmez. CLI betiği olarak çalıştığından kendi veritabanı
 * bağlantı havuzunu kullanır (migrator, DDL değil ama tablo sahibi).
 */

const connectionString = process.env.TRANSLATION_DATABASE_URL;

if (!connectionString) {
  console.error('TRANSLATION_DATABASE_URL tanımlı değil — kök .env dosyanı kontrol et.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle(pool);

const SEED_LOCALES = [
  { code: 'tr-TR', name: 'Türkçe', isDefault: true, isActive: true },
  { code: 'en-US', name: 'English', isDefault: false, isActive: true },
] as const;

const SEED_NAMESPACES = [
  { name: 'common', description: 'Butonlar, tablo, sayfalama, ortak etiketler' },
  { name: 'auth', description: 'Giriş, yetki ve oturum metinleri' },
  { name: 'outage', description: 'Kesinti ekranı ve kesinti enum etiketleri' },
  { name: 'work-order', description: 'İş emri ekranı ve iş emri enum etiketleri' },
  { name: 'settings', description: 'Ayarlar menüsü ve çeviri yönetimi' },
  { name: 'user-management', description: 'Kullanıcı ve rol yönetimi ekranları' },
] as const;

/** [namespace, keyName, tr, en] */
const SEED_KEYS: [string, string, string, string][] = [
  // --- Enum etiketleri (eski labels.ts) ---
  ['outage', 'enum.status.STARTED', 'Başladı', 'Started'],
  ['outage', 'enum.status.ENERGIZED', 'Enerji Verildi', 'Energized'],
  ['outage', 'enum.status.ARCHIVED', 'Arşivlendi', 'Archived'],
  ['outage', 'enum.status.CANCELLED', 'İptal Edildi', 'Cancelled'],

  ['work-order', 'enum.status.STARTED', 'Başladı', 'Started'],
  ['work-order', 'enum.status.ASSIGNED', 'Atandı', 'Assigned'],
  ['work-order', 'enum.status.IN_PROGRESS', 'Devam Ediyor', 'In Progress'],
  ['work-order', 'enum.status.ENERGIZED', 'Enerji Verildi', 'Energized'],
  ['work-order', 'enum.status.DONE', 'Tamamlandı', 'Done'],
  ['work-order', 'enum.status.CANCELLED', 'İptal Edildi', 'Cancelled'],

  ['work-order', 'enum.type.BASIC_WORK', 'Temel İş', 'Basic Work'],
  ['work-order', 'enum.type.LIGHTING_WORK_ORDER', 'Aydınlatma İş Emri', 'Lighting Work Order'],
  ['work-order', 'enum.type.PLANNED_OUTAGE_WORK_ORDER', 'Planlı Kesinti İş Emri', 'Planned Outage Work Order'],
  ['work-order', 'enum.type.UNPLANNED_OUTAGE_WORK_ORDER', 'Plansız Kesinti İş Emri', 'Unplanned Outage Work Order'],
  ['work-order', 'enum.type.WITHOUT_OUTAGE_WORK_ORDER', 'Kesintisiz İş Emri', 'Work Order Without Outage'],

  ['common', 'enum.origin.USER', 'Kullanıcı', 'User'],
  ['common', 'enum.origin.SYSTEM', 'Sistem', 'System'],

  ['common', 'enum.role.ADMIN', 'Sistem Yöneticisi', 'System Administrator'],
  ['common', 'enum.role.OUTAGE_OPERATOR', 'Kesinti Yöneticisi', 'Outage Operator'],
  ['common', 'enum.role.WORK_ORDER_OPERATOR', 'Saha Personeli', 'Field Operator'],

  // --- Ortak aksiyonlar ---
  ['common', 'action.save', 'Kaydet', 'Save'],
  ['common', 'action.saving', 'Kaydediliyor…', 'Saving…'],
  ['common', 'action.create', 'Oluştur', 'Create'],
  ['common', 'action.creating', 'Oluşturuluyor…', 'Creating…'],
  ['common', 'action.cancel', 'İptal', 'Cancel'],
  ['common', 'action.close', 'Kapat', 'Close'],
  ['common', 'loading', 'Yükleniyor…', 'Loading…'],
  ['common', 'table.empty', 'Kayıt bulunamadı', 'No records found'],
  ['common', 'error.unexpected', 'Beklenmeyen bir hata oluştu', 'An unexpected error occurred'],

  // --- Ayarlar ---
  ['settings', 'title', 'Ayarlar', 'Settings'],
  ['settings', 'theme.dark', 'Karanlık mod', 'Dark mode'],
  ['settings', 'language.label', 'Dil', 'Language'],
  ['settings', 'translations.manage', 'Çevirileri yönet', 'Manage translations'],
  ['settings', 'translations.title', 'Çeviri Yönetimi', 'Translation Management'],
  ['settings', 'translations.publish', 'Değişiklikleri yayınla', 'Publish changes'],
  ['settings', 'translations.newKey', 'Yeni anahtar ekle', 'Add new key'],
  ['settings', 'translations.autoFill', 'Eksikleri yapay zekâ ile doldur', 'Fill missing with AI'],
  ['settings', 'translations.onlyMissing', 'Yalnız eksikleri göster', 'Show only missing'],
  ['settings', 'translations.liveValue', 'Canlı', 'Live'],
  ['settings', 'translations.deleteKey', 'Anahtarı sil', 'Delete key'],
  ['settings', 'translations.deactivateLocale', 'Dili pasifleştir', 'Deactivate language'],
  ['common', 'action.confirm', 'Onayla', 'Confirm'],
  ['settings', 'translations.publishing', 'Yayınlanıyor…', 'Publishing…'],
  ['settings', 'translations.allModules', 'Tüm Modüller', 'All Modules'],
  ['settings', 'translations.searchPlaceholder', 'Anahtar adı ile ara…', 'Search by key name…'],
  ['settings', 'translations.autoFillCell', 'Bu hücreyi yapay zekâ ile doldur', 'Fill this cell with AI'],
  ['settings', 'translations.liveValuePrefix', 'Canlı: {value}', 'Live: {value}'],
  ['settings', 'translations.columnKey', 'Anahtar Adı', 'Key Name'],
  ['settings', 'translations.emptyKeys', 'Çeviri anahtarı bulunamadı', 'No translation keys found'],
  ['settings', 'translations.namespaceLabel', 'Modül', 'Module'],
  ['settings', 'translations.keyNameHint', 'ör: outage.status.started', 'e.g. outage.status.started'],
  ['settings', 'translations.descriptionLabel', 'Açıklama (opsiyonel)', 'Description (optional)'],
  ['settings', 'translations.addLocale', 'Dil ekle', 'Add language'],
  ['settings', 'translations.localeCodePlaceholder', 'kod (ör. de-DE)', 'code (e.g. de-DE)'],
  ['settings', 'translations.localeNamePlaceholder', 'ad (ör. Deutsch)', 'name (e.g. Deutsch)'],
  ['settings', 'translations.toast.draftSaved', 'Taslak metin kaydedildi', 'Draft text saved'],
  ['settings', 'translations.toast.updateFailed', 'Güncelleme başarısız', 'Update failed'],
  ['settings', 'translations.toast.publishSuccess', '{count} çeviri canlıya yayınlandı', '{count} translations published'],
  ['settings', 'translations.toast.publishFailed', 'Yayınlama başarısız', 'Publishing failed'],
  ['settings', 'translations.toast.keyCreated', 'Yeni çeviri anahtarı eklendi', 'New translation key added'],
  ['settings', 'translations.toast.keyCreateFailed', 'Anahtar ekleme başarısız', 'Key creation failed'],
  ['settings', 'translations.toast.autoFilled', '{count} çeviri yapay zekâ ile dolduruldu', '{count} translations filled with AI'],
  ['settings', 'translations.toast.autoFillFailed', 'Otomatik çeviri başarısız', 'Auto-translation failed'],
  ['settings', 'translations.toast.localeAdded', 'Yeni dil eklendi', 'New language added'],
  ['settings', 'translations.toast.localeAddFailed', 'Dil ekleme başarısız', 'Failed to add language'],
  ['settings', 'translations.toast.keyDeleted', 'Anahtar silindi', 'Key deleted'],
  ['settings', 'translations.toast.keyDeleteFailed', 'Anahtar silinemedi', 'Failed to delete key'],
  ['settings', 'translations.toast.localeDeactivated', 'Dil pasifleştirildi', 'Language deactivated'],
  ['settings', 'translations.toast.localeDeactivateFailed', 'Dil pasifleştirilemedi', 'Failed to deactivate language'],
  ['settings', 'translations.confirmDeleteKey', 'Bu anahtarı silmek istediğine emin misin?', 'Are you sure you want to delete this key?'],
  ['common', 'action.add', 'Ekle', 'Add'],
  ['common', 'placeholder.gisIdExample', 'ör. CB-10', 'e.g. CB-10'],
  ['common', 'pagination.pageSize', 'Sayfa boyutu', 'Page size'],
  ['common', 'pagination.first', 'İlk sayfa', 'First page'],
  ['common', 'pagination.prev', 'Önceki sayfa', 'Previous page'],
  ['common', 'pagination.next', 'Sonraki sayfa', 'Next page'],
  ['common', 'pagination.last', 'Son sayfa', 'Last page'],
  ['common', 'live.activeTitle', 'Canlı güncellemeler aktif', 'Live updates active'],
  ['common', 'live.connectingTitle', 'Canlı bağlantı kuruluyor', 'Connecting live updates'],
  ['common', 'live.active', 'Canlı', 'Live'],
  ['common', 'live.connecting', 'Bağlanıyor…', 'Connecting…'],
  ['common', 'action.refresh', 'Yenile', 'Refresh'],
  ['common', 'action.logout', 'Çıkış yap', 'Log out'],
  ['common', 'action.expandMenu', 'Menüyü genişlet', 'Expand menu'],
  ['common', 'action.collapseMenu', 'Menüyü daralt', 'Collapse menu'],
  ['common', 'history.dateTime', 'Tarih / Saat', 'Date / Time'],
  ['common', 'history.prevStatus', 'Önceki Durum', 'Previous Status'],
  ['common', 'history.newStatus', 'Yeni Durum', 'New Status'],
  ['common', 'history.actor', 'İşlem Sahibi', 'Actor'],
  ['common', 'history.origin', 'Kaynak', 'Origin'],
  ['common', 'history.created', 'Oluşturuldu', 'Created'],
  ['common', 'history.empty', 'Geçmiş kaydı bulunamadı.', 'No history records found.'],
  ['common', 'filter.clear', 'Temizle', 'Clear'],
  ['common', 'filter.apply', 'Uygula', 'Apply'],
  ['common', 'filter.trigger', '{label} filtrele', 'Filter {label}'],
  ['common', 'filter.activeTitle', 'Aktif Filtreler', 'Active Filters'],
  ['common', 'filter.noActive', 'Aktif filtre bulunmuyor', 'No active filters'],
  ['common', 'filter.clearAll', 'Tümünü Temizle', 'Clear All'],
  ['common', 'filter.date.operator', 'Filtre Modu', 'Filter Mode'],
  ['common', 'filter.date.between', 'Tarihler Arası', 'Between Dates'],
  ['common', 'filter.date.after', 'Sonrasında (>=)', 'After (>=)'],
  ['common', 'filter.date.before', 'Öncesinde (<=)', 'Before (<=)'],
  ['common', 'filter.date.from', 'Başlangıç', 'From'],
  ['common', 'filter.date.to', 'Bitiş', 'To'],

  // --- Kullanıcı & Rol Yönetimi ---
  ['user-management', 'page.title', 'Kullanıcılar', 'User Management'],
  ['user-management', 'segment.users', 'Kullanıcılar', 'Users'],
  ['user-management', 'segment.roles', 'Roller', 'Roles'],

  ['user-management', 'column.email', 'E-posta', 'Email'],
  ['user-management', 'column.fullName', 'Ad Soyad', 'Full Name'],
  ['user-management', 'column.roles', 'Roller', 'Roles'],
  ['user-management', 'column.status', 'Durum', 'Status'],
  ['user-management', 'column.createdAt', 'Oluşturulma', 'Created'],
  ['user-management', 'filter.search', 'Ad veya e-posta ara…', 'Search by name or email…'],
  ['user-management', 'table.empty', 'Kullanıcı kaydı yok', 'No users found'],
  ['user-management', 'action.new', 'Yeni Kullanıcı', 'New User'],
  ['user-management', 'field.email', 'E-posta', 'Email'],
  ['user-management', 'field.fullName', 'Ad Soyad', 'Full Name'],
  ['user-management', 'field.password', 'Parola', 'Password'],
  ['user-management', 'field.roles', 'Roller', 'Roles'],
  ['user-management', 'field.resetPassword', 'Parola Sıfırla', 'Reset Password'],
  ['user-management', 'field.resetPasswordHint', 'Boş bırakırsanız değişmez', 'Leave blank to keep unchanged'],
  ['user-management', 'dialog.create.title', 'Yeni Kullanıcı', 'New User'],
  ['user-management', 'dialog.edit.title', 'Kullanıcı Düzenle', 'Edit User'],
  ['user-management', 'toast.createSuccess', 'Kullanıcı oluşturuldu', 'User created'],
  ['user-management', 'toast.updateSuccess', 'Kullanıcı güncellendi', 'User updated'],

  ['user-management', 'role.column.name', 'Rol Adı', 'Role Name'],
  ['user-management', 'role.column.permissions', 'İzin Sayısı', 'Permissions'],
  ['user-management', 'role.column.users', 'Kullanıcı', 'Users'],
  ['user-management', 'role.table.empty', 'Rol kaydı yok', 'No roles found'],
  ['user-management', 'role.action.new', 'Yeni Rol', 'New Role'],
  ['user-management', 'role.badge.system', 'Sistem', 'System'],
  ['user-management', 'role.badge.systemTooltip', 'Sistem rolleri düzenlenemez veya silinemez', 'System roles cannot be edited or deleted'],
  ['user-management', 'role.badge.systemNote', 'Bu bir sistem rolüdür. Salt-okunur görüntüleniyor.', 'This is a system role. Displayed as read-only.'],
  ['user-management', 'role.delete.hasUsers', 'Önce kullanıcıları başka role taşıyın', 'Move users to another role first'],
  ['user-management', 'role.confirm.delete', '{name} rolünü silmek istediğinize emin misiniz?', 'Are you sure you want to delete the role {name}?'],
  ['user-management', 'role.dialog.create.title', 'Yeni Rol', 'New Role'],
  ['user-management', 'role.dialog.edit.title', 'Rol Düzenle', 'Edit Role'],
  ['user-management', 'role.field.name', 'Rol Adı', 'Role Name'],
  ['user-management', 'role.field.permissions', 'İzinler', 'Permissions'],
  ['user-management', 'role.permissionNote', 'Yapılan değişiklikler, kullanıcıların bir sonraki oturum yenilemesinde (token süresi) etkili olur.', 'Changes will take effect for users on their next session refresh (token expiry).'],
  ['user-management', 'role.toast.createSuccess', 'Rol oluşturuldu', 'Role created'],
  ['user-management', 'role.toast.updateSuccess', 'Rol güncellendi', 'Role updated'],
  ['user-management', 'role.toast.deleteSuccess', 'Rol silindi', 'Role deleted'],

  ['common', 'status.active', 'Aktif', 'Active'],
  ['common', 'status.inactive', 'Pasif', 'Inactive'],

  // --- Auth ---
  ['auth', 'validation.email', 'Geçerli bir e-posta adresi girin', 'Enter a valid email address'],
  ['auth', 'validation.passwordRequired', 'Parola zorunlu', 'Password is required'],
  ['auth', 'error.loginFailed', 'Giriş yapılamadı, tekrar deneyin', 'Sign in failed, please try again'],
  ['auth', 'action.signingIn', 'Giriş yapılıyor…', 'Signing in…'],
  ['auth', 'action.signIn', 'Giriş Yap', 'Sign In'],
  ['auth', 'action.emailLabel', 'E-posta Adresi', 'Email Address'],
  ['auth', 'action.passwordLabel', 'Parola', 'Password'],
  ['auth', 'forbidden.title', '403 — Bu sayfaya erişim yetkiniz yok', "403 — You don't have access to this page"],
  [
    'auth',
    'forbidden.description',
    'Bu ekranı görüntülemek için izniniz bulunmuyor.',
    'You do not have permission to view this page.',
  ],
  ['auth', 'forbidden.back', 'Ana sayfaya dön', 'Back to home'],
  ['auth', 'session.expired', 'Oturum sona erdi, tekrar giriş yapın', 'Session expired, please sign in again'],
  ['auth', 'hero.titleBefore', 'Enerjinizi', 'Manage your energy with'],
  ['auth', 'hero.titleAfter', 'ile yönetin', ''],

  // --- Kesinti ekranı ---
  ['outage', 'page.title', 'Kesintiler', 'Outages'],
  ['outage', 'related.label', 'İlişkili kesinti:', 'Related outage:'],
  ['outage', 'related.loading', 'İlişkili kesinti yükleniyor…', 'Loading related outage…'],
  ['outage', 'related.gisLabel', 'GIS:', 'GIS:'],
  ['outage', 'table.empty', 'Kesinti kaydı yok', 'No outage records'],
  ['outage', 'column.createdAt', 'Oluşturulma', 'Created'],
  ['outage', 'column.status', 'Durum', 'Status'],
  ['outage', 'column.startedAt', 'Başlangıç', 'Started'],
  ['outage', 'column.endedAt', 'Bitiş', 'Ended'],
  ['outage', 'column.durationMinutes', 'Süre (dk)', 'Duration (min)'],
  ['outage', 'column.origin', 'Kaynak', 'Origin'],
  ['outage', 'column.workOrderId', 'İş Emri', 'Work Order'],
  ['outage', 'action.openWorkOrder', 'İş emri ekranında aç', 'Open in work order screen'],
  ['outage', 'action.new', 'Yeni Kesinti', 'New Outage'],
  ['outage', 'action.locked', 'Kilitli', 'Locked'],
  ['outage', 'action.edit', 'Kesintiyi güncelle', 'Update outage'],
  ['outage', 'validation.gisIdRequired', 'gisId zorunlu', 'gisId is required'],
  ['outage', 'validation.startedAtRequired', 'Başlangıç zamanı zorunlu', 'Start time is required'],
  ['outage', 'validation.endedAtBeforeStarted', 'Bitiş zamanı, başlangıçtan önce olamaz', 'End time cannot be before start time'],
  ['outage', 'toast.createSuccess', 'Kesinti oluşturuldu', 'Outage created'],
  ['outage', 'toast.createError', 'Kesinti oluşturulamadı', 'Failed to create outage'],
  ['outage', 'toast.updateSuccess', 'Kesinti güncellendi', 'Outage updated'],
  ['outage', 'toast.updateError', 'Kesinti güncellenemedi', 'Failed to update outage'],
  ['outage', 'dialog.create.title', 'Yeni Kesinti', 'New Outage'],
  ['outage', 'dialog.create.gisIdLabel', 'GIS ID (kesici)', 'GIS ID (breaker)'],
  ['outage', 'dialog.create.startedAtLabel', 'Başlangıç zamanı', 'Start time'],
  ['outage', 'dialog.create.endedAtLabel', 'Bitiş zamanı', 'End time'],
  [
    'outage',
    'dialog.create.endedAtHint',
    '(opsiyonel — verilirse durum otomatik "{status}" olur)',
    '(optional — if set, status automatically becomes "{status}")',
  ],
  ['outage', 'dialog.edit.title', 'Kesintiyi Güncelle', 'Update Outage'],
  ['outage', 'dialog.edit.endedAtHint', '(verilirse durum otomatik "{status}" olur)', '(if set, status automatically becomes "{status}")'],
  ['outage', 'dialog.edit.currentStatusLabel', 'Mevcut durum', 'Current status'],
  ['outage', 'dialog.edit.nextStatusLabel', 'Yeni durum', 'New status'],
  ['outage', 'dialog.edit.selectTransition', 'Geçiş seç…', 'Select transition…'],
  ['outage', 'dialog.edit.noTransitions', 'Bu durumdan başka bir duruma geçiş yok.', 'No transition available from this status.'],
  ['outage', 'dialog.history.title', 'Durum Geçmişi — {id}', 'Status History — {id}'],
  ['outage', 'tooltip.locked', 'Arşivlenmiş/iptal edilmiş kesinti kilitlidir, düzenlenemez', 'Archived/cancelled outage is locked, cannot be edited'],

  // --- İş emri ekranı ---
  ['work-order', 'page.title', 'İş Emirleri', 'Work Orders'],
  ['work-order', 'related.label', 'İlişkili iş emri:', 'Related work order:'],
  ['work-order', 'related.loading', 'İlişkili iş emri yükleniyor…', 'Loading related work order…'],
  ['work-order', 'table.empty', 'İş emri kaydı yok', 'No work order records'],
  ['work-order', 'column.createdAt', 'Oluşturulma', 'Created'],
  ['work-order', 'column.type', 'Tip', 'Type'],
  ['work-order', 'column.status', 'Durum', 'Status'],
  ['work-order', 'column.origin', 'Kaynak', 'Origin'],
  ['work-order', 'column.outageId', 'Kesinti', 'Outage'],
  ['work-order', 'action.openOutage', 'Kesinti ekranında aç', 'Open in outage screen'],
  ['work-order', 'action.new', 'Yeni İş Emri', 'New Work Order'],
  ['work-order', 'action.edit', 'İş emrini güncelle', 'Update work order'],
  ['work-order', 'validation.gisIdRequired', 'gisId zorunlu', 'gisId is required'],
  ['work-order', 'toast.createSuccess', 'İş emri oluşturuldu', 'Work order created'],
  ['work-order', 'toast.createError', 'İş emri oluşturulamadı', 'Failed to create work order'],
  ['work-order', 'toast.updateError', 'İş emri güncellenemedi', 'Failed to update work order'],
  ['work-order', 'toast.statusChanged', 'İş emri {status} durumuna geçti', 'Work order transitioned to {status}'],
  ['work-order', 'dialog.create.title', 'Yeni İş Emri', 'New Work Order'],
  ['work-order', 'dialog.create.gisIdLabel', 'GIS ID (kesici)', 'GIS ID (breaker)'],
  ['work-order', 'dialog.create.typeLabel', 'Tip', 'Type'],
  ['work-order', 'dialog.edit.title', 'İş Emrini Güncelle', 'Update Work Order'],
  ['work-order', 'dialog.edit.originLabel', 'Kaynak', 'Origin'],
  ['work-order', 'dialog.edit.createdAtLabel', 'Oluşturulma', 'Created'],
  ['work-order', 'dialog.edit.currentStatusLabel', 'Mevcut durum', 'Current status'],
  ['work-order', 'dialog.edit.nextStatusLabel', 'Yeni durum', 'New status'],
  ['work-order', 'dialog.edit.selectTransition', 'Geçiş seç…', 'Select transition…'],
  ['work-order', 'dialog.edit.noTransitions', 'Bu durumdan başka bir duruma geçiş yok.', 'No transition available from this status.'],
  ['work-order', 'dialog.history.title', 'Durum Geçmişi — {id}', 'Status History — {id}'],
];

async function main(): Promise<void> {
  // 1. Diller
  for (const loc of SEED_LOCALES) {
    await db.insert(locales).values(loc).onConflictDoNothing({ target: locales.code });
  }

  // 2. Namespace'ler
  const namespaceIds: Record<string, string> = {};
  for (const ns of SEED_NAMESPACES) {
    const [existing] = await db
      .select()
      .from(translationNamespaces)
      .where(eq(translationNamespaces.name, ns.name));

    if (existing) {
      namespaceIds[ns.name] = existing.id;
    } else {
      const [created] = await db.insert(translationNamespaces).values(ns).returning();
      namespaceIds[ns.name] = created!.id;
    }
  }

  // 3. Anahtarlar ve çeviriler — draft VE published birlikte doldurulur, aksi
  //    halde uygulama ilk açılışta boş sözlük görür ve birinin panelden
  //    "Yayınla"ya basması gerekir.
  let keyCount = 0;
  let translationCount = 0;

  for (const [namespaceName, keySuffix, tr, en] of SEED_KEYS) {
    const namespaceId = namespaceIds[namespaceName];
    if (!namespaceId) throw new Error(`Namespace bulunamadı: ${namespaceName}`);

    // Anahtar adı namespace ön ekini LİTERAL olarak taşır (bkz. §4 adlandırma kuralı) —
    // toplu bundle (E3) namespace'siz düz bir sözlük döndüğü için ön ek olmadan
    // farklı namespace'lerdeki aynı adlı anahtarlar (ör. enum.status.STARTED) çakışırdı.
    const keyName = `${namespaceName}.${keySuffix}`;

    let [key] = await db
      .select()
      .from(translationKeys)
      .where(eq(translationKeys.keyName, keyName));

    if (!key) {
      const [created] = await db
        .insert(translationKeys)
        .values({ namespaceId, keyName })
        .returning();
      key = created;
      keyCount++;
    }

    for (const [localeCode, value] of [
      ['tr-TR', tr],
      ['en-US', en],
    ] as const) {
      const inserted = await db
        .insert(translations)
        .values({
          keyId: key!.id,
          localeCode,
          draftValue: value,
          publishedValue: value,
          updatedBy: 'seed',
        })
        .onConflictDoUpdate({
          target: [translations.keyId, translations.localeCode],
          set: {
            draftValue: value,
            publishedValue: value,
            updatedBy: 'seed',
          },
        })
        .returning({ id: translations.id });

      if (inserted.length > 0) translationCount++;
    }
  }

  // 4. Bundle versiyonları — yayınlanmış içerik v1'dir (bkz. translation.repository.ts D1 notu).
  let versionCount = 0;
  for (const ns of SEED_NAMESPACES) {
    const namespaceId = namespaceIds[ns.name]!;
    for (const loc of SEED_LOCALES) {
      const inserted = await db
        .insert(bundleVersions)
        .values({ localeCode: loc.code, namespaceId, version: 1, publishedAt: new Date() })
        .onConflictDoNothing({ target: [bundleVersions.localeCode, bundleVersions.namespaceId] })
        .returning({ localeCode: bundleVersions.localeCode });

      if (inserted.length > 0) versionCount++;
    }
  }

  console.log(
    `Seed tamam: ${SEED_LOCALES.length} dil, ${SEED_NAMESPACES.length} namespace, ${keyCount} yeni anahtar, ${translationCount} yeni çeviri satırı, ${versionCount} yeni bundle versiyonu.`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('Seed başarısız:', err);
    process.exit(1);
  })
  .finally(() => void pool.end());
