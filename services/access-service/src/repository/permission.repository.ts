import { asc } from 'drizzle-orm';
import { db } from '../db.ts';
import { permissions } from '../db/schema.ts';

export interface PermissionItem {
  code: string;
  description: string | null;
  /** Rol panelindeki kutu — izin koduna değil, izne ait bir alandır. */
  module: string;
  sortOrder: number;
}

/** Tüm izinleri modül ve sabit sırasıyla listeler. */
export async function list(): Promise<PermissionItem[]> {
  return db
    .select({
      code: permissions.code,
      description: permissions.description,
      module: permissions.module,
      sortOrder: permissions.sortOrder,
    })
    .from(permissions)
    .orderBy(asc(permissions.sortOrder));
}
