// Port des points ESTALE (outil admin). Persistance : intranet_points_estale.

import type { CategoriePointEstale, PointEstale, StatutPointEstale } from "@/lib/domain/points-estale";

/** Levee quand la table n'existe pas encore (SQL intranet_points_estale.sql a passer). */
export class PointsEstaleNonConfigureError extends Error {
  constructor() {
    super("Table intranet_points_estale absente - SQL a passer : supabase/sql/intranet_points_estale.sql");
    this.name = "PointsEstaleNonConfigureError";
  }
}

export interface PatchPointEstale {
  titre?: string;
  detail?: string | null;
  bloquant?: boolean;
  categorie?: CategoriePointEstale;
  demandeur?: string | null;
  statut?: StatutPointEstale;
  reponse?: string | null;
}

export interface PointsEstaleRepository {
  lister(): Promise<PointEstale[]>;
  creer(point: {
    titre: string;
    detail?: string;
    bloquant: boolean;
    categorie?: CategoriePointEstale;
    demandeur?: string;
  }): Promise<PointEstale>;
  patch(id: string, patch: PatchPointEstale): Promise<PointEstale | null>;
}
