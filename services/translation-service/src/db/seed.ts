import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, sql } from 'drizzle-orm';
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
  { code: 'tr-TR', name: 'Türkçe', isDefault: true, isActive: true, providerCode: 'TR' },
  { code: 'en-US', name: 'English', isDefault: false, isActive: true, providerCode: 'EN-US' },
] as const;

const SEED_NAMESPACES = [
  { name: 'common', description: 'Butonlar, tablo, sayfalama, ortak etiketler' },
  { name: 'auth', description: 'Giriş, yetki ve oturum metinleri' },
  { name: 'outage', description: 'Kesinti ekranı ve kesinti enum etiketleri' },
  { name: 'work-order', description: 'İş emri ekranı ve iş emri enum etiketleri' },
  { name: 'settings', description: 'Ayarlar menüsü ve çeviri yönetimi' },
  { name: 'user-management', description: 'Kullanıcı ve rol yönetimi ekranları' },
  { name: 'network', description: 'Şebeke elemanı enum etiketleri' },
  { name: 'map', description: 'Harita ekranı' },
  // Sunucudan dönen hata kodlarının kullanıcıya gösterilen karşılıkları. Anahtar adı
  // `ERROR_CODES` ile birebir aynıdır (bkz. packages/shared/src/errors.ts) — istemci
  // `ApiError.code`'a bakıp doğrudan bu anahtarı seçer.
  { name: 'error', description: 'Sunucu hata kodlarının kullanıcı mesajları' },
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

  // tr-TR değerleri access-service seed'indeki ROLE_NAMES ile bilerek AYNI
  // tutulur (bkz. services/access-service/src/db/seed.ts) — aksi halde bu
  // anahtar kullanılmaya başlandığında Türkçe arayüzde metin değişmiş görünür.
  ['common', 'enum.role.ADMIN', 'Yönetici', 'System Administrator'],
  ['common', 'enum.role.OUTAGE_OPERATOR', 'Kesinti Operatörü', 'Outage Operator'],
  ['common', 'enum.role.WORK_ORDER_OPERATOR', 'Saha Personeli', 'Field Operator'],

  // --- Ortak aksiyonlar ---
  ['common', 'action.save', 'Kaydet', 'Save'],
  ['common', 'action.saving', 'Kaydediliyor…', 'Saving…'],
  ['common', 'action.create', 'Oluştur', 'Create'],
  ['common', 'action.creating', 'Oluşturuluyor…', 'Creating…'],
  ['common', 'action.cancel', 'İptal', 'Cancel'],
  ['common', 'action.close', 'Kapat', 'Close'],
  ['common', 'action.edit', 'Düzenle', 'Edit'],
  ['common', 'action.delete', 'Sil', 'Delete'],
  ['common', 'action.selectAll', 'Tümünü seç', 'Select all'],
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
  ['common', 'placeholder.cbsIdExample', 'ör. 100196', 'e.g. 100196'],
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
  ['user-management', 'page.title', 'Kullanıcı Yönetimi', 'User Management'],
  ['user-management', 'segment.users', 'Kullanıcılar', 'Users'],
  ['user-management', 'segment.roles', 'Roller', 'Roles'],

  ['user-management', 'column.email', 'E-posta', 'Email'],
  ['user-management', 'column.fullName', 'Ad Soyad', 'Full Name'],
  ['user-management', 'column.roles', 'Roller', 'Roles'],
  ['user-management', 'column.status', 'Durum', 'Status'],
  ['user-management', 'column.createdAt', 'Oluşturulma', 'Created'],
  ['user-management', 'column.actions', 'İşlemler', 'Actions'],
  ['user-management', 'column.lastLoginAt', 'Son Giriş', 'Last Login'],
  ['user-management', 'column.neverLoggedIn', 'Hiç giriş yapmadı', 'Never logged in'],
  ['user-management', 'filter.search', 'Ad veya e-posta ara…', 'Search by name or email…'],
  ['user-management', 'filter.email', 'E-posta ara…', 'Search by email…'],
  ['user-management', 'table.empty', 'Kullanıcı kaydı yok', 'No users found'],
  ['user-management', 'action.new', 'Yeni Kullanıcı', 'New User'],
  ['user-management', 'field.email', 'E-posta', 'Email'],
  ['user-management', 'field.fullName', 'Ad Soyad', 'Full Name'],
  ['user-management', 'field.password', 'Parola', 'Password'],
  ['user-management', 'field.passwordHint', 'En az 8 karakter', 'At least 8 characters'],
  ['user-management', 'field.roles', 'Roller', 'Roles'],
  ['user-management', 'field.addRole', 'Yeni rol alanı ekle', 'Add new role row'],
  ['user-management', 'field.resetPassword', 'Parola Sıfırla', 'Reset Password'],
  ['user-management', 'field.resetPasswordHint', 'Boş bırakırsanız değişmez', 'Leave blank to keep unchanged'],
  ['user-management', 'field.resetPasswordDescription', 'kullanıcısı için yeni bir parola belirleyin.', 'set a new password for this user.'],
  ['user-management', 'dialog.create.title', 'Yeni Kullanıcı', 'New User'],
  ['user-management', 'dialog.edit.title', 'Kullanıcı Düzenle', 'Edit User'],
  ['user-management', 'toast.createSuccess', 'Kullanıcı oluşturuldu', 'User created'],
  ['user-management', 'toast.updateSuccess', 'Kullanıcı güncellendi', 'User updated'],
  ['user-management', 'toast.userDeleted', 'Kullanıcı silindi', 'User deleted'],
  ['user-management', 'toast.passwordResetSuccess', 'Parola başarıyla sıfırlandı', 'Password reset successfully'],
  ['user-management', 'confirm.delete', '{fullName} ({email}) kullanıcısını silmek istediğinize emin misiniz?', 'Are you sure you want to delete user {fullName} ({email})?'],
  ['user-management', 'validation.emailInvalid', 'Geçerli bir e-posta girin', 'Enter a valid email'],
  ['user-management', 'validation.fullNameRequired', 'Ad soyad zorunludur', 'Full name is required'],
  ['user-management', 'validation.passwordMin', 'Parola en az 8 karakter olmalı', 'Password must be at least 8 characters'],
  ['user-management', 'validation.rolesRequired', 'En az bir rol seçilmeli', 'At least one role must be selected'],

  ['user-management', 'role.column.name', 'Rol Adı', 'Role Name'],
  ['user-management', 'role.column.permissions', 'İzin Sayısı', 'Permissions'],
  ['user-management', 'role.column.users', 'Kullanıcı', 'Users'],
  ['user-management', 'role.table.empty', 'Rol kaydı yok', 'No roles found'],
  ['user-management', 'role.action.new', 'Yeni Rol', 'New Role'],
  ['user-management', 'role.filter.namePlaceholder', 'Rol adı ara…', 'Search by role name…'],
  ['user-management', 'role.badge.system', 'Sistem', 'System'],
  ['user-management', 'role.badge.systemTooltip', 'Sistem rolleri düzenlenemez veya silinemez', 'System roles cannot be edited or deleted'],
  ['user-management', 'role.badge.systemNote', 'Bu bir sistem rolüdür. Salt-okunur görüntüleniyor.', 'This is a system role. Displayed as read-only.'],
  ['user-management', 'role.delete.hasUsers', 'Önce kullanıcıları başka role taşıyın', 'Move users to another role first'],
  ['user-management', 'role.delete.systemBlocked', 'Sistem rolleri silinemez', 'System roles cannot be deleted'],
  ['user-management', 'role.confirm.delete', '{name} rolünü silmek istediğinize emin misiniz?', 'Are you sure you want to delete the role {name}?'],
  ['user-management', 'role.dialog.create.title', 'Yeni Rol', 'New Role'],
  ['user-management', 'role.dialog.edit.title', 'Rol Düzenle', 'Edit Role'],
  ['user-management', 'role.field.name', 'Rol Adı', 'Role Name'],
  ['user-management', 'role.field.permissions', 'İzinler', 'Permissions'],
  ['user-management', 'role.validation.nameRequired', 'Rol adı zorunludur', 'Role name is required'],
  ['user-management', 'role.permissionNote', 'Yapılan değişiklikler, kullanıcıların bir sonraki oturum yenilemesinde (token süresi) etkili olur.', 'Changes will take effect for users on their next session refresh (token expiry).'],
  ['user-management', 'role.permissionsPanel.emptyState', 'İzinlerini düzenlemek için soldaki tablodan bir rol seçin.', 'Select a role from the table on the left to edit its permissions.'],
  ['user-management', 'role.permissionsTitle', '{name} İzinleri', '{name} Permissions'],
  ['user-management', 'role.module.outage', 'Kesinti Yönetimi', 'Outage Management'],
  ['user-management', 'role.module.workorder', 'İş Emri Yönetimi', 'Work Order Management'],
  ['user-management', 'role.module.user', 'Kullanıcı & Rol Yönetimi', 'User & Role Management'],
  ['user-management', 'role.module.translation', 'Çeviri Yönetimi', 'Translation Management'],
  ['user-management', 'role.module.generic', '{module} Modülü', '{module} Module'],
  ['user-management', 'role.toast.createSuccess', 'Rol oluşturuldu', 'Role created'],
  ['user-management', 'role.toast.updateSuccess', 'Rol güncellendi', 'Role updated'],
  ['user-management', 'role.toast.deleteSuccess', 'Rol silindi', 'Role deleted'],

  // İzin açıklamaları — kaynak: services/access-service/src/db/seed.ts PERMISSION_DESCRIPTIONS
  // (tr-TR değerleri o dosyayla bilerek AYNI tutulur, bkz. yukarıdaki not).
  ['user-management', 'permission.outage.read', 'Kesinti kayıtlarını görme', 'View outage records'],
  ['user-management', 'permission.outage.write', 'Kesinti oluşturma ve düzenle', 'Create and edit outages'],
  ['user-management', 'permission.workorder.read', 'İş emirlerini görme', 'View work orders'],
  ['user-management', 'permission.workorder.write', 'İş emri oluşturma ve durum güncelleme', 'Create work orders and update status'],
  ['user-management', 'permission.user.manage', 'Kullanıcı ve rol yönetimi', 'Manage users and roles'],
  ['user-management', 'permission.translation.read', 'Çeviri yönetimini görme', 'View translation management'],
  ['user-management', 'permission.translation.write', 'Çeviri ekleme ve düzenle', 'Add and edit translations'],
  ['user-management', 'permission.translation.publish', 'Çeviri yayınlama', 'Publish translations'],
  ['user-management', 'permission.network.read', 'Şebeke ve idari birim verilerini görme', 'View network and administrative unit data'],
  ['user-management', 'permission.customer.read', 'Abone verilerini görme (PII hariç)', 'View customer data (excluding PII)'],
  ['user-management', 'permission.customer.read-pii', 'Abone tesisat/sözleşme numarasını görme', 'View customer wiring/contract numbers'],

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
  ['outage', 'related.cbsLabel', 'CBS:', 'GIS:'],
  ['outage', 'table.empty', 'Kesinti kaydı yok', 'No outage records'],
  ['outage', 'column.createdAt', 'Oluşturulma', 'Created'],
  ['outage', 'column.status', 'Durum', 'Status'],
  ['outage', 'column.startedAt', 'Başlangıç', 'Started'],
  ['outage', 'column.endedAt', 'Bitiş', 'Ended'],
  ['outage', 'column.durationMinutes', 'Süre (dk)', 'Duration (min)'],
  ['outage', 'column.origin', 'Kaynak', 'Origin'],
  ['outage', 'column.affectedCustomerCount', 'Etkilenen Abone', 'Affected Customers'],
  ['outage', 'column.workOrderId', 'İş Emri', 'Work Order'],
  ['outage', 'action.openWorkOrder', 'İş emri ekranında aç', 'Open in work order screen'],
  ['outage', 'action.new', 'Yeni Kesinti', 'New Outage'],
  ['outage', 'action.locked', 'Kilitli', 'Locked'],
  ['outage', 'action.edit', 'Kesintiyi güncelle', 'Update outage'],
  ['outage', 'validation.cbsIdRequired', 'CBS ID zorunlu', 'CBS ID is required'],
  ['outage', 'validation.startedAtRequired', 'Başlangıç zamanı zorunlu', 'Start time is required'],
  ['outage', 'validation.endedAtBeforeStarted', 'Bitiş zamanı, başlangıçtan önce olamaz', 'End time cannot be before start time'],
  ['outage', 'toast.createSuccess', 'Kesinti oluşturuldu', 'Outage created'],
  ['outage', 'toast.createError', 'Kesinti oluşturulamadı', 'Failed to create outage'],
  ['outage', 'toast.updateSuccess', 'Kesinti güncellendi', 'Outage updated'],
  ['outage', 'toast.updateError', 'Kesinti güncellenemedi', 'Failed to update outage'],
  ['outage', 'dialog.create.title', 'Yeni Kesinti', 'New Outage'],
  ['outage', 'dialog.create.cbsIdLabel', 'CBS ID (şebeke elemanı)', 'GIS ID (network element)'],
  ['outage', 'dialog.create.startedAtLabel', 'Başlangıç zamanı', 'Start time'],
  ['outage', 'dialog.create.endedAtLabel', 'Bitiş zamanı', 'End time'],
  [
    'outage',
    'dialog.create.endedAtHint',
    '(opsiyonel — verilirse durum otomatik "{status}" olur)',
    '(optional — if set, status automatically becomes "{status}")',
  ],
  // --- Etki ve kaskad ---
  ['outage', 'tab.detail', 'Detay', 'Details'],
  ['outage', 'tab.history', 'Durum Geçmişi', 'Status History'],
  ['outage', 'tab.affectedCustomers', 'Etkilenen Aboneler', 'Affected Customers'],
  ['outage', 'detail.componentLabel', 'Eleman', 'Element'],
  ['outage', 'detail.unitPathLabel', 'İdari Birim', 'Administrative Unit'],
  ['outage', 'detail.affectedCustomerCountLabel', 'Etkilenen Abone', 'Affected Customers'],
  ['outage', 'detail.customerMinutesLabel', 'Müşteri-Dakika', 'Customer-Minutes'],
  ['outage', 'detail.impactPending', 'Hesaplanıyor…', 'Calculating…'],
  [
    'outage',
    'detail.impactUnavailable',
    'Hesaplanamadı (alternatif besleme)',
    'Unavailable (alternative supply)',
  ],
  [
    'outage',
    'detail.coveredByParent',
    'Üst kesintide sayılıyor',
    'Counted in the covering outage',
  ],
  ['outage', 'affectedCustomers.column.customerId', 'Abone No', 'Customer No'],
  ['outage', 'affectedCustomers.column.unitPath', 'İdari Birim', 'Administrative Unit'],
  ['outage', 'affectedCustomers.column.customerType', 'Abone Tipi', 'Customer Type'],
  ['outage', 'affectedCustomers.empty', 'Etkilenen abone kaydı yok', 'No affected customers'],
  [
    'outage',
    'affectedCustomers.unavailable',
    'Etki hesaplanamadı — bu eleman kapalı bir ring üzerinden besleniyor olabilir.',
    'Impact could not be calculated — this element may be fed through a closed ring.',
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
  ['work-order', 'validation.cbsIdRequired', 'CBS ID zorunlu', 'CBS ID is required'],
  ['work-order', 'toast.createSuccess', 'İş emri oluşturuldu', 'Work order created'],
  ['work-order', 'toast.createError', 'İş emri oluşturulamadı', 'Failed to create work order'],
  ['work-order', 'toast.updateError', 'İş emri güncellenemedi', 'Failed to update work order'],
  ['work-order', 'toast.statusChanged', 'İş emri {status} durumuna geçti', 'Work order transitioned to {status}'],
  ['work-order', 'dialog.create.title', 'Yeni İş Emri', 'New Work Order'],
  ['work-order', 'dialog.create.cbsIdLabel', 'CBS ID (şebeke elemanı)', 'GIS ID (network element)'],
  ['work-order', 'dialog.create.typeLabel', 'Tip', 'Type'],
  ['work-order', 'dialog.edit.title', 'İş Emrini Güncelle', 'Update Work Order'],
  ['work-order', 'dialog.edit.originLabel', 'Kaynak', 'Origin'],
  ['work-order', 'dialog.edit.createdAtLabel', 'Oluşturulma', 'Created'],
  ['work-order', 'dialog.edit.currentStatusLabel', 'Mevcut durum', 'Current status'],
  ['work-order', 'dialog.edit.nextStatusLabel', 'Yeni durum', 'New status'],
  ['work-order', 'dialog.edit.selectTransition', 'Geçiş seç…', 'Select transition…'],
  ['work-order', 'dialog.edit.noTransitions', 'Bu durumdan başka bir duruma geçiş yok.', 'No transition available from this status.'],
  ['work-order', 'dialog.history.title', 'Durum Geçmişi — {id}', 'Status History — {id}'],

  // --- Şebeke elemanı enum etiketleri (harita katman/filtre ağacı bunları paylaşır) ---
  // Gerilim kısaltmaları uluslararası (HV/MV/LV) kullanılır — Türkçe YG/OG/AG karışıklığı
  // yaratıyordu (bkz. `enum.voltageLevel.*`). `LV_JUNCTION` ve `LV_NETWORK` bilerek aynı
  // metni taşır — biri "buat" biri "AG Şebeke" derken aynı elemanı iki farklı adla anan
  // eski halin yerine geçer.
  ['network', 'enum.componentType.TM', 'Trafo Merkezi', 'Substation (TM)'],
  ['network', 'enum.componentType.BUS', 'Bara', 'Bus'],
  ['network', 'enum.componentType.CIRCUIT_BREAKER', 'Kesici', 'Circuit Breaker'],
  ['network', 'enum.componentType.FEEDER', 'Fider', 'Feeder'],
  ['network', 'enum.componentType.MV_LINE', 'MV Ana Hat', 'MV Main Line'],
  ['network', 'enum.componentType.MV_BRANCH', 'MV Kolu', 'MV Branch'],
  ['network', 'enum.componentType.MV_TIE_LINE', 'MV Bağlantı Hattı', 'MV Tie Line'],
  ['network', 'enum.componentType.DM', 'Dağıtım Merkezi', 'Distribution Center (DM)'],
  ['network', 'enum.componentType.TRANSFORMER', 'Dağıtım Trafosu', 'Distribution Transformer'],
  ['network', 'enum.componentType.LV_BUS', 'LV Panosu', 'LV Panel'],
  ['network', 'enum.componentType.LV_LINE', 'LV Hat', 'LV Line'],
  ['network', 'enum.componentType.LV_JUNCTION', 'LV Bağlantı Noktası', 'LV Connection Point'],
  ['network', 'enum.componentType.SERVICE_DROP', 'İrtibat Hattı', 'Service Drop'],
  ['network', 'enum.componentType.HV_LINE', 'HV Hattı', 'HV Line'],
  ['network', 'enum.componentType.HV_LINK', 'HV Bağlantısı', 'HV Link'],

  ['network', 'enum.category.SUBSTATION', 'Trafo Merkezi', 'Substation'],
  ['network', 'enum.category.MV_NETWORK', 'MV Şebeke', 'MV Network'],
  ['network', 'enum.category.DIST_TRANSFORMER', 'Trafo', 'Transformer'],
  ['network', 'enum.category.LV_NETWORK', 'LV Bağlantı Noktası', 'LV Connection Point'],
  ['network', 'enum.category.SERVICE_ENTRY', 'Kofra', 'Service Entry'],
  ['network', 'enum.category.CUSTOMER', 'Abone', 'Customer'],

  ['network', 'enum.breakerRole.TM_FEEDER', 'Fider Kesicisi', 'Feeder Breaker'],
  ['network', 'enum.breakerRole.DM_ENTRY', 'DM Giriş Kesicisi', 'DM Entry Breaker'],
  ['network', 'enum.breakerRole.TRANSFORMER', 'Trafo Kesicisi', 'Transformer Breaker'],
  ['network', 'enum.breakerRole.TIE', 'Bağlantı (Tie) Kesicisi', 'Tie Breaker'],
  ['network', 'enum.breakerRole.SERVICE_ENTRY', 'Kofra Kesicisi', 'Service Entry Breaker'],

  // Gerilim her yerde kV olarak yazılır — kısaltma tek başına bırakılmaz.
  // Veri setinde yalnız bu iki abone tipi var (ölçüldü: `SELECT DISTINCT customer_type`).
  ['network', 'enum.customerType.RESIDENTIAL', 'Mesken', 'Residential'],
  ['network', 'enum.customerType.COMMERCIAL', 'Ticarethane', 'Commercial'],

  ['network', 'enum.voltageLevel.HV', '154/400 kV', '154/400 kV'],
  ['network', 'enum.voltageLevel.MV', '34,5 kV', '34.5 kV'],
  ['network', 'enum.voltageLevel.LV', '0,4 kV', '0.4 kV'],
  ['network', 'enum.voltageLevel.MV_LV', '34,5 / 0,4 kV', '34.5 / 0.4 kV'],

  // Veri setinde yalnız bu üç durum var (ölçüldü: `SELECT DISTINCT status FROM network.components`).
  ['network', 'enum.status.ENERGIZED', 'Enerjili', 'Energized'],
  ['network', 'enum.status.CLOSED', 'Kapalı', 'Closed'],
  ['network', 'enum.status.OPEN', 'Açık', 'Open'],

  // Anlık enerjilenme durumu — `network.components.status` kolonundan FARKLIDIR: bu, aktif
  // kesintilerden türetilen runtime değeridir.
  ['network', 'enum.energization.ENERGIZED', 'Enerjili', 'Energized'],
  ['network', 'enum.energization.DE_ENERGIZED', 'Enerjisiz', 'De-energized'],

  // --- Sunucu hata kodları (409 kapıları) ---
  // Anahtar adı `ERROR_CODES` ile birebir aynıdır; istemci `ApiError.code`'a bakıp seçer.
  [
    'error',
    'COMPONENT_DE_ENERGIZED',
    'Bu şebeke elemanının elektriği hâlihazırda kesik. Önce mevcut kesintiyi sonlandırın.',
    'This network element is already de-energized. End the existing outage first.',
  ],
  [
    'error',
    'OUTAGE_ALREADY_ACTIVE',
    'Bu şebeke elemanında süren bir kesinti zaten var.',
    'This network element already has an ongoing outage.',
  ],
  [
    'error',
    'WORK_ORDER_ALREADY_ACTIVE',
    'Bu şebeke elemanına ait süren bir iş emri zaten var.',
    'This network element already has an ongoing work order.',
  ],

  // --- Harita ekranı ---
  ['map', 'page.title', 'Harita', 'Map'],
  ['map', 'panel.detail.title', 'Seçili Eleman', 'Selected Element'],
  ['map', 'panel.detail.empty', 'Haritada bir eleman seçin', 'Select an element on the map'],
  ['map', 'panel.detail.field.id', 'CBS ID', 'GIS ID'],
  ['map', 'panel.detail.field.type', 'Tip', 'Type'],
  ['map', 'panel.detail.field.voltageLevel', 'Gerilim', 'Voltage'],
  ['map', 'panel.detail.field.capacity', 'Kapasite', 'Capacity'],
  ['map', 'panel.detail.field.status', 'Durum', 'Status'],
  ['map', 'panel.detail.field.unitPath', 'Mahalle', 'Administrative Unit'],
  ['map', 'panel.detail.field.province', 'İl', 'Province'],
  ['map', 'panel.detail.field.district', 'İlçe', 'District'],
  ['map', 'panel.detail.field.customerCount', 'Abone Sayısı', 'Customer Count'],
  ['map', 'panel.detail.componentTitle', 'Eleman Detayı', 'Element Detail'],
  ['map', 'panel.detail.outageTitle', 'Kesinti Detayı', 'Outage Detail'],
  ['map', 'panel.detail.workOrderTitle', 'İş Emri Detayı', 'Work Order Detail'],
  ['map', 'panel.detail.section.general', 'Genel', 'General'],
  ['map', 'panel.detail.section.location', 'Konum', 'Location'],
  ['map', 'panel.detail.section.component', 'Eleman', 'Element'],
  ['map', 'panel.mode.title', 'Katmanlar', 'Layers'],
  ['map', 'panel.mode.collapse', 'Paneli daralt', 'Collapse panel'],
  ['map', 'panel.mode.expand', 'Paneli genişlet', 'Expand panel'],
  ['map', 'mode.network.title', 'Şebeke Elemanlarını Göster', 'Show Network Elements'],

  // Efsane — hat katmanları birim katmanlarından ayrı satırlardır.
  ['map', 'legend.section.lines', 'Hatlar', 'Lines'],
  ['map', 'legend.section.units', 'Elemanlar', 'Components'],
  ['map', 'legend.line.hv', '154/400 kV HV hattı', '154/400 kV HV line'],
  ['map', 'legend.line.mvMain', '34,5 kV MV ana hat + yedek', '34.5 kV MV main line + tie'],
  ['map', 'legend.line.mvBranch', '34,5 kV MV dağıtım kolu', '34.5 kV MV branch'],
  ['map', 'legend.line.lv', '0,4 kV LV hattı', '0.4 kV LV line'],
  ['map', 'legend.unit.tm', 'TM — Trafo Merkezi', 'TM — Substation'],
  ['map', 'legend.unit.dm', 'DM — Dağıtım Merkezi', 'DM — Distribution Center'],
  ['map', 'legend.unit.transformer', 'Trafo', 'Transformer'],
  ['map', 'legend.unit.lvJunction', 'LV bağlantı noktası', 'LV connection point'],
  ['map', 'legend.unit.serviceEntry', 'Kofra', 'Enclosure'],
  ['map', 'legend.unit.customer', 'Abone', 'Customer'],
  [
    'map',
    'legend.buildingHint',
    'TM / DM / trafo bina izi ve kesicileri zoom 16’dan itibaren açılır.',
    'Substation / DM / transformer footprints and breakers appear from zoom 16.',
  ],
  ['map', 'filter.voltageLevel.title', 'Gerilim Seviyesi', 'Voltage Level'],
  ['map', 'filter.breakerRole.title', 'Yalnız Kesiciler', 'Breakers Only'],
  ['map', 'layer.adminBoundaries', 'İdari Sınırlar', 'Administrative Boundaries'],
  ['map', 'layer.zoomHint', 'Bu katman z ≥ {level} yakınlıkta görünür', 'This layer appears at zoom ≥ {level}'],
  ['map', 'basemap.unavailable', 'Altlık harita yüklenemedi', 'Basemap unavailable'],

  // --- Harita işletim katmanları ---
  // Kesinti ve iş emri haritada ayrı bir "mod" değil, efsanede kendi katman satırıdır.
  ['map', 'legend.section.outages', 'Kesintiler', 'Outages'],
  ['map', 'legend.section.workOrders', 'İş Emirleri', 'Work Orders'],
  ['map', 'legend.section.operations', 'Kesinti ve İş Emirleri', 'Outages and Work Orders'],
  ['map', 'legend.section.heatmap', 'Isı Haritası', 'Heat Map'],
  ['map', 'legend.section.independent', 'Bağımsız Katmanlar', 'Independent Layers'],
  ['map', 'layer.outages', 'Kesintileri göster', 'Show outages'],
  ['map', 'layer.workOrders', 'İş emirlerini göster', 'Show work orders'],
  ['map', 'layer.outageHeatmap', 'Kesinti ısı haritası', 'Outage heat map'],
  [
    'map',
    'layer.truncated',
    'Sonuçlar üst sınıra ulaştı — filtreyi daraltın.',
    'Results hit the limit — narrow the filter.',
  ],
  ['map', 'filter.status', 'Durum', 'Status'],
  ['map', 'filter.origin', 'Kaynak', 'Origin'],
  ['map', 'filter.type', 'Tür', 'Type'],
  ['map', 'filter.startedAtFrom', 'Başlangıç (en erken)', 'Started after'],
  ['map', 'filter.startedAtTo', 'Başlangıç (en geç)', 'Started before'],
  ['map', 'filter.createdAtFrom', 'Oluşturulma (en erken)', 'Created after'],
  ['map', 'filter.createdAtTo', 'Oluşturulma (en geç)', 'Created before'],
  ['map', 'filter.minAffectedCustomers', 'Etkilenen abone sayısı en az', 'Min. affected customer count'],
  ['map', 'filter.minDuration', 'Kesinti süresi en az (dakika)', 'Min. outage duration (minutes)'],
  ['map', 'filter.maxDuration', 'En uzun süre (dk)', 'Max duration (min)'],
  ['map', 'filter.sinceDate', 'Şu tarihten itibaren', 'Since date'],
  ['map', 'filter.outageSpecific.title', 'Kesintiye Özel', 'Outage-specific'],
  ['map', 'filter.dateSection.title', 'Kesinti ve İş Emri Tarihi', 'Outage & Work Order Date'],
  ['map', 'filter.hasWorkOrder', 'İş emri bağı', 'Work order link'],
  ['map', 'filter.hasOutage', 'Kesinti bağı', 'Outage link'],
  ['map', 'filter.any', 'Farketmez', 'Any'],
  ['map', 'filter.linked', 'Var', 'Linked'],
  ['map', 'filter.unlinked', 'Yok', 'Not linked'],

  // --- Haritadan aksiyon ---
  // Sol paneldeki iz aksiyonları, etki onay adımı ve haritadan kayıt açma.
  ['map', 'action.traceUp', 'Upstream', 'Upstream'],
  ['map', 'action.traceDown', 'Downstream', 'Downstream'],
  ['map', 'action.createOutage', 'Kesinti Aç', 'Open Outage'],
  ['map', 'action.createWorkOrder', 'İş Emri Aç', 'Open Work Order'],
  ['map', 'action.showOnMap', 'Haritada göster', 'Show on map'],
  ['map', 'action.zoomIn', 'Yakınlaştır', 'Zoom in'],
  ['map', 'action.zoomOut', 'Uzaklaştır', 'Zoom out'],
  ['map', 'action.openRecord', 'Kaydı aç', 'Open record'],

  // --- Kesinti iptali (haritadan) ---
  ['map', 'action.cancelOutage', 'Kesintiyi İptal Et', 'Cancel Outage'],
  ['map', 'action.cancelOutageConfirmTitle', 'Kesintiyi iptal et', 'Cancel the outage'],
  [
    'map',
    'action.cancelOutageConfirmBody',
    'Kesinti iptal edilecek ve hesaplanan etkisi geri alınacak. Bu işlem geri alınamaz.',
    'The outage will be cancelled and its calculated impact reverted. This cannot be undone.',
  ],
  [
    'map',
    'action.cancelOutageWorkOrderNote',
    'Bu kesintiye bağlı iş emri de iptal edilecek.',
    'The work order linked to this outage will also be cancelled.',
  ],

  // --- Kapı (engel) sebepleri: sunucudaki 409'ların arayüzdeki erken karşılığı ---
  [
    'map',
    'block.deEnergized',
    'Bu elemanın elektriği üstteki bir kesinti yüzünden hâlihazırda kesik.',
    'This element is already de-energized by an upstream outage.',
  ],
  [
    'map',
    'block.outageActive',
    'Bu şebeke elemanında süren bir kesinti zaten var.',
    'This network element already has an ongoing outage.',
  ],
  [
    'map',
    'block.workOrderActive',
    'Bu şebeke elemanında süren bir iş emri zaten var.',
    'This network element already has an ongoing work order.',
  ],

  // --- Kaskad onayı: bir bilgilendirmedir, izin sorusu değil ---
  ['map', 'cascade.title', 'Alt Kesintiler Bulundu', 'Downstream Outages Found'],
  [
    'map',
    'cascade.body',
    'Bu elemanın beslediği hatta hâlihazırda {count} kesinti sürüyor. Yeni kesinti açılırsa bu kesintiler kapsanan kesinti olarak buna bağlanacak ve müşteri-dakikaları yalnız üst kesintide sayılacak.',
    '{count} outages are already ongoing downstream of this element. If you open a new outage, they will be linked to it as contained outages and customer-minutes will be counted only on the parent.',
  ],
  ['map', 'cascade.confirm', 'Onayla ve Devam', 'Confirm and Continue'],
  ['map', 'cascade.customerCount', '{count} abone', '{count} customers'],
  ['map', 'cascade.more', 've {count} kesinti daha', 'and {count} more outages'],

  // --- Enerjisizlik katmanı ---
  ['map', 'layer.deEnergized', 'Enerjisiz Bölgeler', 'De-energized Areas'],
  ['map', 'legend.deEnergized', 'Enerjisiz', 'De-energized'],
  ['map', 'panel.detail.field.deEnergizedBy', 'Karartan kesinti', 'De-energized by'],

  [
    'map',
    'trace.upstreamSummary',
    'Besleme zinciri: TM’ye kadar {count} eleman.',
    'Supply chain: {count} elements up to the substation.',
  ],
  [
    'map',
    'trace.downstreamSummary',
    'Etkilenen: {elements} şebeke elemanı, {customers} abone.',
    'Affected: {elements} network elements, {customers} customers.',
  ],
  // Sayılar kesindir; kırpılan yalnız kimlik listesidir — vurgu eksik kalır, sayı değil.
  [
    'map',
    'trace.overflowed',
    'Sayılar tamdır, haritadaki vurgu ilk 10.000 elemanla sınırlıdır.',
    'The counts are exact; the map highlight is limited to the first 10,000 elements.',
  ],
  [
    'map',
    'trace.radialityViolated',
    'Bu eleman birden çok kaynaktan besleniyor (kapalı ring) — etki güvenilir biçimde hesaplanamıyor.',
    'This element is fed from more than one source (closed ring) — impact cannot be computed reliably.',
  ],

  ['map', 'confirm.outageTitle', 'Yeni Kesinti', 'New Outage'],
  ['map', 'confirm.workOrderTitle', 'Yeni İş Emri', 'New Work Order'],
  ['map', 'confirm.outageInfoTitle', 'Kesinti Bilgileri', 'Outage Information'],
  ['map', 'confirm.workOrderInfoTitle', 'İş Emri Bilgileri', 'Work Order Information'],
  ['map', 'confirm.componentLabel', 'Eleman', 'Element'],
  ['map', 'confirm.locationLabel', 'Konum', 'Location'],
  ['map', 'confirm.affectedAssetsTitle', 'Etkilenecek Varlıklar', 'Affected Assets'],
  ['map', 'confirm.affectedElementsLabel', 'Şebeke Elemanı Sayısı', 'Network Element Count'],
  ['map', 'confirm.highImpactWarning', 'Yüksek etkili kesinti', 'High-impact outage'],
  [
    'map',
    'confirm.highImpactForbidden',
    'Yüksek etkili kesinti açmak için ek yetki gerekiyor; yöneticinizle görüşün.',
    'Opening a high-impact outage requires additional authorization; contact your administrator.',
  ],
  [
    'map',
    'confirm.highImpactWorkOrderNote',
    'Kesintili iş emri türleri (planlı/plansız) bu elemanda ek yetki ister; kesintisiz türler serbesttir.',
    'Outage-causing work order types (planned/unplanned) need extra authorization on this element; non-outage types do not.',
  ],
  ['map', 'confirm.previewFailed', 'Etki önizlemesi alınamadı.', 'Impact preview could not be loaded.'],

  // --- Harita araç şeridi ve panelleri ---
  // Şerit dar kalsın diye düğmelerde yazı yok; etiket yalnız ipucu olarak görünür.
  ['map', 'tool.layers', 'Katmanlar', 'Layers'],
  ['map', 'tool.filters', 'Filtreler', 'Filters'],
  ['map', 'tool.area', 'Alan Seç', 'Select Area'],
  [
    'map',
    'filter.layerOff',
    'Bu katman kapalı; filtreler açıldığında uygulanır.',
    'This layer is off; the filters apply once it is turned on.',
  ],

  // --- Alan (poligon) seçimi ---
  ['map', 'area.startDrawing', 'Alan çiz', 'Draw area'],
  ['map', 'area.cancelDrawing', 'Çizimi iptal et', 'Cancel drawing'],
  ['map', 'area.clear', 'Alanı temizle', 'Clear area'],
  [
    'map',
    'area.drawingHint',
    'Köşe eklemek için haritaya tıklayın; kapatmak için çift tıklayın veya ilk köşeye basın. Esc iptal eder.',
    'Click the map to add corners; double-click or click the first corner to close. Esc cancels.',
  ],
  [
    'map',
    'area.idleHint',
    'Bir alan çizin; içindeki elemanlar ve kayıtlar solda listelenir.',
    'Draw an area; the elements and records inside are listed on the left.',
  ],
  ['map', 'area.noteLabel', 'Not:', 'Note:'],
  [
    'map',
    'area.noteScope',
    'Alanın içinde ne aranacağı Katmanlar ve Filtreler panellerindeki o anki seçime göre belirlenir.',
    'What is searched inside the area follows the current selection in the Layers and Filters panels.',
  ],
  ['map', 'area.categories', 'Aranacak Kategoriler', 'Searched Categories'],
  ['map', 'area.records', 'Kayıtlar', 'Records'],
  [
    'map',
    'area.recordsHint',
    'Kayıtlar Filtreler panelindeki durum ve tür filtreleriyle süzülür.',
    'Records are filtered by the status and type filters in the Filters panel.',
  ],
  ['map', 'area.result', 'Sonuç', 'Result'],
  ['map', 'area.countComponents', 'Şebeke elemanı', 'Network elements'],
  [
    'map',
    'area.overflowed',
    'Alan çok geniş — sonuç üst sınıra dayandı. Alanı daraltın veya kategori seçimini azaltın.',
    'The area is too large — the result hit the limit. Narrow the area or select fewer categories.',
  ],

  // --- Alan sonuç listesi (sol panel) ---
  ['map', 'result.title', 'Alan Sonuçları', 'Area Results'],
  ['map', 'result.empty', 'Bu alanda kayıt yok', 'Nothing in this area'],
  ['map', 'result.tab.components', 'Elemanlar', 'Elements'],
  ['map', 'result.tab.outages', 'Kesintiler', 'Outages'],
  ['map', 'result.tab.workOrders', 'İş Emirleri', 'Work Orders'],
  ['map', 'result.column.id', 'CBS ID', 'GIS ID'],
  ['map', 'result.column.type', 'Tip', 'Type'],
  ['map', 'result.column.name', 'Ad', 'Name'],
  ['map', 'result.column.unit', 'Mahalle', 'Neighborhood'],
  ['map', 'result.column.district', 'İlçe', 'District'],
  ['map', 'result.column.record', 'Kayıt', 'Record'],
  ['map', 'result.column.status', 'Durum', 'Status'],
  ['map', 'result.column.component', 'Eleman', 'Element'],

  ['map', 'panel.detail.linkedOutages', 'Bu elemandaki kesintiler', 'Outages on this element'],
  ['map', 'panel.detail.linkedWorkOrders', 'Bu elemandaki iş emirleri', 'Work orders on this element'],
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
  /**
   * Yeni anahtar eklenen namespace'ler. Bundle'ın ETag'i ve Redis anahtarı **versiyona**
   * bağlıdır; versiyon artmazsa yeni anahtar veritabanında olsa bile istemci eski bundle'ı
   * önbellekten okumaya devam eder ve ekranda ham anahtar adı (`map.action.traceUp`) görünür.
   */
  const namespacesWithNewKeys = new Set<string>();
  /**
   * Yeni anahtar eklenmese bile bir anahtarın METNİ değişmiş olabilir (ör. bir çeviriyi
   * düzeltip seed'i yeniden çalıştırmak). `namespacesWithNewKeys` bunu YAKALAMIYORDU — versiyon
   * artmayınca Redis'teki eski bundle 24 saat boyunca güncel metni hiç göstermiyordu. Her
   * `onConflictDoUpdate` gerçek bir değişiklik olsun olmasın satırı döndürdüğü için burada
   * "namespace'e bu seed çalışmasında dokunuldu mu" izlenir — gereksiz bir versiyon artışı,
   * sessiz kalan bir metin değişikliğinden çok daha ucuz bir bedel.
   */
  const namespacesWithUpdatedTranslations = new Set<string>();

  for (const [namespaceName, keySuffix, tr, en] of SEED_KEYS) {
    const namespaceId = namespaceIds[namespaceName];
    if (!namespaceId) throw new Error(`Namespace bulunamadı: ${namespaceName}`);

    // Anahtar adı namespace ön ekini LİTERAL olarak taşır —
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
      namespacesWithNewKeys.add(namespaceName);
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

      if (inserted.length > 0) {
        translationCount++;
        namespacesWithUpdatedTranslations.add(namespaceName);
      }
    }
  }

  // 4. Bundle versiyonları — yayınlanmış içerik v1'dir (bkz. translation.repository.ts D1 notu).
  //    Var olan bir namespace'e yeni anahtar geldiyse YA DA mevcut bir anahtarın metni
  //    değiştiyse versiyon artırılır: seed zaten `published_value`'yu doldurduğu için
  //    "Yayınla"ya basmaya gerek yok, ama versiyon sabit kalırsa ETag da sabit kalır ve
  //    istemci 304 alıp eski (Redis'te önbelleklenmiş) sözlüğü kullanmaya devam eder.
  let versionCount = 0;
  let bumpedCount = 0;
  for (const ns of SEED_NAMESPACES) {
    const namespaceId = namespaceIds[ns.name]!;
    const hasNewKeys = namespacesWithNewKeys.has(ns.name);
    const hasUpdatedTranslations = namespacesWithUpdatedTranslations.has(ns.name);
    for (const loc of SEED_LOCALES) {
      const inserted = await db
        .insert(bundleVersions)
        .values({ localeCode: loc.code, namespaceId, version: 1, publishedAt: new Date() })
        .onConflictDoNothing({ target: [bundleVersions.localeCode, bundleVersions.namespaceId] })
        .returning({ localeCode: bundleVersions.localeCode });

      if (inserted.length > 0) {
        versionCount++;
        continue;
      }

      // Satır zaten vardı — yalnız içeriği değişen (yeni anahtar VEYA metni güncellenen)
      // namespace'in versiyonu artırılır.
      if (!hasNewKeys && !hasUpdatedTranslations) continue;
      await db
        .update(bundleVersions)
        .set({ version: sql`${bundleVersions.version} + 1`, publishedAt: new Date() })
        .where(and(eq(bundleVersions.localeCode, loc.code), eq(bundleVersions.namespaceId, namespaceId)));
      bumpedCount++;
    }
  }

  console.log(
    `Seed tamam: ${SEED_LOCALES.length} dil, ${SEED_NAMESPACES.length} namespace, ${keyCount} yeni anahtar, ${translationCount} yeni çeviri satırı, ${versionCount} yeni bundle versiyonu, ${bumpedCount} versiyon artırıldı.`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('Seed başarısız:', err);
    process.exit(1);
  })
  .finally(() => void pool.end());
