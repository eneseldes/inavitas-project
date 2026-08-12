import { ALL_PERMISSIONS, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@inavitas/shared';
import { hashPassword } from '../domain/password.ts';
import * as roleRepository from '../repository/role.repository.ts';
import * as userRepository from '../repository/user.repository.ts';

/** Yeni kullanıcı oluşturur. Email tekilliği ve rol kodları doğrulanır. */
export async function createUser(input: {
  email: string;
  fullName: string;
  password: string;
  roleCodes: string[];
}): Promise<string> {
  if (await userRepository.existsByEmail(input.email)) {
    throw new ConflictError(`Bu e-posta zaten kayıtlı: ${input.email}`);
  }

  const invalidCodes = await roleRepository.validateCodes(input.roleCodes);
  if (invalidCodes.length > 0) {
    throw new ValidationError(`Geçersiz rol kodları: ${invalidCodes.join(', ')}`);
  }

  const roles = await roleRepository.findByCodes(input.roleCodes);
  const roleIds = roles.map((r) => r.id);

  const passwordHash = await hashPassword(input.password);
  return userRepository.create({ email: input.email, fullName: input.fullName }, passwordHash, roleIds);
}

/** Kullanıcı profilini günceller. Self-lockout ve son-admin guard'ları uygulanır. */
export async function updateUser(
  targetId: string,
  requesterId: string,
  patch: { email?: string; fullName?: string; isActive?: boolean },
): Promise<void> {
  const user = await userRepository.findById(targetId);
  if (!user) throw new NotFoundError('Kullanıcı', targetId);

  if (patch.email && patch.email !== user.email) {
    if (await userRepository.existsByEmail(patch.email)) {
      throw new ConflictError(`Bu e-posta zaten kayıtlı: ${patch.email}`);
    }
  }

  // Kendi hesabını pasifleştirme engeli
  if (patch.isActive === false && targetId === requesterId) {
    throw new ForbiddenError('Kendi hesabınızı pasifleştiremezsiniz');
  }

  // Son ADMIN pasifleştirilemez
  if (patch.isActive === false) {
    const isAdmin = await userRepository.hasRole(targetId, 'ADMIN');
    if (isAdmin) {
      const adminCount = await userRepository.countAdmins();
      if (adminCount <= 1) {
        throw new ConflictError('Son aktif yönetici pasifleştirilemez');
      }
    }
  }

  await userRepository.updateProfile(targetId, patch);
}

/** Kullanıcının rol setini değiştirir. Son ADMIN'in admin rolü kaldırılamaz. */
export async function setUserRoles(
  targetId: string,
  roleCodes: string[],
): Promise<void> {
  const user = await userRepository.findById(targetId);
  if (!user) throw new NotFoundError('Kullanıcı', targetId);

  const invalidCodes = await roleRepository.validateCodes(roleCodes);
  if (invalidCodes.length > 0) {
    throw new ValidationError(`Geçersiz rol kodları: ${invalidCodes.join(', ')}`);
  }

  // Son ADMIN'in ADMIN rolü kaldırılamaz
  const hadAdmin = user.roles.includes('ADMIN');
  const willHaveAdmin = roleCodes.includes('ADMIN');
  if (hadAdmin && !willHaveAdmin) {
    const adminCount = await userRepository.countAdmins();
    if (adminCount <= 1) {
      throw new ConflictError('Son yöneticinin admin rolü kaldırılamaz');
    }
  }

  const roles = await roleRepository.findByCodes(roleCodes);
  const roleIds = roles.map((r) => r.id);
  await userRepository.setRoles(targetId, roleIds);
}

/** Yönetici tarafından parola sıfırlama. */
export async function resetPassword(userId: string, password: string): Promise<void> {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Kullanıcı', userId);

  const passwordHash = await hashPassword(password);
  await userRepository.updatePassword(userId, passwordHash);
}
