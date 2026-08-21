/** Bir kullanıcıya verilmiş rol ataması — rol ve bölgesel kapsamı birlikte taşır. */
export interface Assignment {
  roleCode: string;
  unitPath: string;
}

/** Listede dönen atama — rol kodu ve birim adı; "Saha Operatörü @ Keçiören" satırı için. */
export interface AssignmentSummary extends Assignment {
  unitName: string | null;
}

/** Detay yanıtında dönen, rol adı da çözülmüş atama. */
export interface AssignmentDetail extends AssignmentSummary {
  roleName: string;
  isSystem: boolean;
}

export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  assignments: AssignmentSummary[];
  lastLoginAt: string | null;
}

export interface UserDetail {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: string[];
  permissions: string[];
  assignments: AssignmentDetail[];
}

export interface RoleListItem {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
}

export interface RoleDetail {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  permissionCodes: string[];
}

export interface PermissionItem {
  code: string;
  description: string | null;
  /**
   * İznin ait olduğu modül. İzin kodunun önekinden türetilmez — abone izinleri `customer:`
   * ön ekini taşır ama şebeke modülünde görünür.
   */
  module: string;
  /** Modül içindeki sabit satır sırası; sunucudan gelir, istemcide yeniden hesaplanmaz. */
  sortOrder: number;
}

/** İdari birim ağacındaki tek düğüm (`units_ro` read-model'i). */
export interface UnitNode {
  path: string;
  parentPath: string | null;
  level: UnitLevel;
  name: string;
  provinceName: string;
  districtName: string | null;
  childCount: number;
  userCount: number;
}

export const UNIT_LEVELS = ['PROVINCE', 'DISTRICT', 'NEIGHBORHOOD'] as const;
export type UnitLevel = (typeof UNIT_LEVELS)[number];

/**
 * Kök kapsam — veri seti bugün yalnız Ankara'yı taşıdığı için il düğümü aynı zamanda ağacın
 * köküdür. Yeni bir yetki satırının varsayılan birimi budur (bkz. @inavitas/shared
 * ROOT_UNIT_PATH; iki taraf da aynı değeri kullanır).
 */
export const ROOT_UNIT_PATH = 'TR.06';

/**
 * Birimin tam yolu — "Ankara › Keçiören › Kalaba Mah.".
 *
 * Ata zinciri ayrıca sorgulanmaz: `units_ro` zaten il ve ilçe adını her satırda taşıyor,
 * üç seviyelik ağaçta bu yeterli.
 */
export function unitFullName(unit: Pick<UnitNode, 'level' | 'name' | 'provinceName' | 'districtName'>): string {
  if (unit.level === 'PROVINCE') return unit.name;
  if (unit.level === 'DISTRICT') return `${unit.provinceName} › ${unit.name}`;
  return [unit.provinceName, unit.districtName, unit.name].filter(Boolean).join(' › ');
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  password: string;
  assignments: Assignment[];
}

export interface UpdateUserInput {
  email?: string;
  fullName?: string;
  isActive?: boolean;
}

export interface CreateRoleInput {
  name: string;
  permissionCodes: string[];
}

export interface UpdateRoleInput {
  name: string;
}
