// Mock memoire des points ESTALE (mode demo / dev sans Supabase).

import type { PointEstale } from "@/lib/domain/points-estale";
import type { PatchPointEstale, PointsEstaleRepository } from "@/lib/ports/points-estale-repository";

const points: PointEstale[] = [];

export class MockPointsEstaleRepository implements PointsEstaleRepository {
  async lister(): Promise<PointEstale[]> {
    return [...points];
  }

  async creer(point: { titre: string; detail?: string; bloquant: boolean; categorie?: import("@/lib/domain/points-estale").CategoriePointEstale; demandeur?: string }): Promise<PointEstale> {
    const p: PointEstale = {
      id: `mock-${Date.now()}-${points.length}`,
      titre: point.titre,
      bloquant: point.bloquant,
      categorie: point.categorie ?? "produit",
      statut: "a_trancher",
      createdAt: new Date().toISOString(),
      ...(point.detail ? { detail: point.detail } : {}),
      ...(point.demandeur ? { demandeur: point.demandeur } : {}),
    };
    points.unshift(p);
    return p;
  }

  async patch(id: string, patch: PatchPointEstale): Promise<PointEstale | null> {
    const p = points.find((x) => x.id === id);
    if (!p) return null;
    if (patch.titre !== undefined) p.titre = patch.titre;
    if (patch.detail !== undefined) {
      if (patch.detail) p.detail = patch.detail;
      else delete p.detail;
    }
    if (patch.bloquant !== undefined) p.bloquant = patch.bloquant;
    if (patch.categorie !== undefined) p.categorie = patch.categorie;
    if (patch.demandeur !== undefined) {
      if (patch.demandeur) p.demandeur = patch.demandeur;
      else delete p.demandeur;
    }
    if (patch.reponse !== undefined) {
      if (patch.reponse) p.reponse = patch.reponse;
      else delete p.reponse;
    }
    if (patch.statut !== undefined) {
      p.statut = patch.statut;
      if (patch.statut === "resolu" || patch.statut === "abandonne") p.resoluAt = new Date().toISOString();
      else delete p.resoluAt;
    }
    p.updatedAt = new Date().toISOString();
    return p;
  }
}
