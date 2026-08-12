import { db } from '../db.ts';
import { permissions } from '../db/schema.ts';

export interface PermissionItem {
  code: string;
  description: string | null;
}

/** Tüm izinleri kod ve açıklama ile listeler. */
export async function list(): Promise<PermissionItem[]> {
  const rows = await db
    .select({ code: permissions.code, description: permissions.description })
    .from(permissions)
    .orderBy(permissions.code);

  return rows;
}
