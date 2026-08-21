import {
  ConflictError,
  ForbiddenError,
  isPathInScope,
  NotFoundError,
  PERMISSIONS,
  ValidationError,
  type AuthenticatedUser,
} from '@inavitas/shared';
import { hashPassword } from '../domain/password.ts';
import { publishScopeVersion } from '../domain/scope-store.ts';
import * as roleRepository from '../repository/role.repository.ts';
import * as unitRepository from '../repository/unit.repository.ts';
import * as userRepository from '../repository/user.repository.ts';
import type { AssignmentInput } from '../repository/user.repository.ts';

/** İstemciden gelen ham atama — rol ve birim kodlarıyla. */
export interface AssignmentRequest {
  roleCode: string;
  unitPath: string;
}

/**
 * Atamaları doğrular ve veritabanı kimliklerine çevirir.
 *
 * 🚨 **Kapsam yükseltme kapısı burasıdır.** Bir kullanıcı kendi kapsamından geniş bir kapsam
 * atayamaz — aksi halde bir mahalle sorumlusu kendini il sorumlusu yapardı. Karar sunucuda
 * verilir; arayüzün ağacı süzülmüş göstermesi bir kanıt değildir.
 */
async function resolveAssignments(
  requester: AuthenticatedUser,
  assignments: AssignmentRequest[],
): Promise<AssignmentInput[]> {
  const seen = new Set<string>();
  for (const a of assignments) {
    const key = `${a.roleCode}@${a.unitPath}`;
    if (seen.has(key)) throw new ValidationError(`Aynı rol aynı birimde iki kez atanamaz: ${key}`);
    seen.add(key);
  }

  const invalidRoles = await roleRepository.validateCodes(assignments.map((a) => a.roleCode));
  if (invalidRoles.length > 0) {
    throw new ValidationError(`Geçersiz rol kodları: ${invalidRoles.join(', ')}`);
  }

  const missingUnits = await unitRepository.findMissingPaths(assignments.map((a) => a.unitPath));
  if (missingUnits.length > 0) {
    throw new ValidationError(`Geçersiz birim yolları: ${missingUnits.join(', ')}`);
  }

  const grantable = requester.scopes[PERMISSIONS.SCOPE_MANAGE] ?? [];
  const tooWide = assignments.filter((a) => !isPathInScope(a.unitPath, grantable));
  if (tooWide.length > 0) {
    throw new ForbiddenError(
      `Kendi kapsamınızdan geniş bir kapsam atayamazsınız: ${tooWide.map((a) => a.unitPath).join(', ')}`,
    );
  }

  const roles = await roleRepository.findByCodes(assignments.map((a) => a.roleCode));
  const roleIdByCode = new Map(roles.map((r) => [r.code, r.id]));

  return assignments.map((a) => ({ roleId: roleIdByCode.get(a.roleCode)!, unitPath: a.unitPath }));
}

/** Yeni kullanıcı oluşturur. Email tekilliği, rol kodları ve kapsam doğrulanır. */
export async function createUser(
  requester: AuthenticatedUser,
  input: {
    email: string;
    fullName: string;
    password: string;
    assignments: AssignmentRequest[];
  },
): Promise<string> {
  if (await userRepository.existsByEmail(input.email)) {
    throw new ConflictError(`Bu e-posta zaten kayıtlı: ${input.email}`);
  }

  const resolved = await resolveAssignments(requester, input.assignments);
  const passwordHash = await hashPassword(input.password);

  return userRepository.create({ email: input.email, fullName: input.fullName }, passwordHash, resolved);
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

/** Kullanıcının rol atamalarını değiştirir. Son ADMIN'in admin rolü kaldırılamaz. */
export async function setUserAssignments(
  requester: AuthenticatedUser,
  targetId: string,
  assignments: AssignmentRequest[],
): Promise<void> {
  const user = await userRepository.findById(targetId);
  if (!user) throw new NotFoundError('Kullanıcı', targetId);

  // Son ADMIN'in ADMIN rolü kaldırılamaz — kapsamı ne olursa olsun rolün varlığına bakılır.
  const hadAdmin = user.roles.includes('ADMIN');
  const willHaveAdmin = assignments.some((a) => a.roleCode === 'ADMIN');
  if (hadAdmin && !willHaveAdmin) {
    const adminCount = await userRepository.countAdmins();
    if (adminCount <= 1) {
      throw new ConflictError('Son yöneticinin admin rolü kaldırılamaz');
    }
  }

  const resolved = await resolveAssignments(requester, assignments);
  const scopeVersion = await userRepository.setAssignments(targetId, resolved);

  // Gateway veritabanını görmez; kapsamı daralan kullanıcının elindeki token ancak bu kayıt
  // güncellenince bayat sayılır (`SCOPE_STALE`). Atlanırsa eski kapsam token süresi dolana
  // kadar geçerli kalır — bu fazın bütün noktası da o değil.
  await publishScopeVersion(targetId, scopeVersion);
}

/** Yönetici tarafından parola sıfırlama. */
export async function resetPassword(userId: string, password: string): Promise<void> {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Kullanıcı', userId);

  const passwordHash = await hashPassword(password);
  await userRepository.updatePassword(userId, passwordHash);
}
