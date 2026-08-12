import { ALL_PERMISSIONS, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@inavitas/shared';
import * as roleRepository from '../repository/role.repository.ts';

/** Ad'dan slugify ile kod üretir: "Kesinti İzleyici" → "KESINTI_IZLEYICI". */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // aksanları kaldır
    .replace(/[^a-zA-Z0-9\s]/g, '')   // harf/rakam/boşluk dışı kaldır
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

/** Sistem rolü kodları — çakışma engeli için sabit set. */
const SYSTEM_CODES = new Set(['ADMIN', 'OUTAGE_OPERATOR', 'WORK_ORDER_OPERATOR']);

/** Yeni rol oluşturur. İzin kodları PERMISSIONS sabitine karşı doğrulanır. */
export async function createRole(input: {
  name: string;
  permissionCodes: string[];
}): Promise<string> {
  const invalidPerms = input.permissionCodes.filter(
    (c) => !(ALL_PERMISSIONS as readonly string[]).includes(c),
  );
  if (invalidPerms.length > 0) {
    throw new ValidationError(`Geçersiz izin kodları: ${invalidPerms.join(', ')}`);
  }

  const code = slugify(input.name);

  if (SYSTEM_CODES.has(code)) {
    throw new ConflictError(`Bu kod sistem rolüyle çakışıyor: ${code}`);
  }

  const existing = await roleRepository.findByCode(code);
  if (existing) {
    throw new ConflictError(`Bu kod zaten kullanımda: ${code}`);
  }

  return roleRepository.create({ name: input.name, code, permissionCodes: input.permissionCodes });
}

/** Rol adını günceller — sistem rolleri düzenlenemez. */
export async function updateRole(id: string, name: string): Promise<void> {
  const role = await roleRepository.findById(id);
  if (!role) throw new NotFoundError('Rol', id);
  if (role.isSystem) throw new ForbiddenError('Sistem rolleri düzenlenemez');

  await roleRepository.updateName(id, name);
}

/** Rolün izin setini değiştirir — sistem rolleri değiştirilemez. */
export async function setRolePermissions(roleId: string, permissionCodes: string[]): Promise<void> {
  const role = await roleRepository.findById(roleId);
  if (!role) throw new NotFoundError('Rol', roleId);
  if (role.isSystem) throw new ForbiddenError('Sistem rollerinin izinleri değiştirilemez');

  const invalidPerms = permissionCodes.filter(
    (c) => !(ALL_PERMISSIONS as readonly string[]).includes(c),
  );
  if (invalidPerms.length > 0) {
    throw new ValidationError(`Geçersiz izin kodları: ${invalidPerms.join(', ')}`);
  }

  await roleRepository.setPermissions(roleId, permissionCodes);
}

/** Rolü siler — sistem rolleri ve kullanımdaki roller silinemez. */
export async function deleteRole(id: string): Promise<void> {
  const role = await roleRepository.findById(id);
  if (!role) throw new NotFoundError('Rol', id);
  if (role.isSystem) throw new ForbiddenError('Sistem rolleri silinemez');

  const userCount = await roleRepository.countUsers(id);
  if (userCount > 0) {
    throw new ConflictError(
      `Bu rol ${userCount} kullanıcıya atanmış. Önce bu kullanıcıları başka bir role taşıyın.`,
    );
  }

  await roleRepository.remove(id);
}
