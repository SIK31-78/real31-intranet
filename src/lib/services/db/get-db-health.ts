import { getDbHealth as routerGetDbHealth, type DbHealth } from "@/lib/adapters/router";

export type { DbHealth };

export async function getDbHealth(): Promise<DbHealth> {
  return routerGetDbHealth();
}
