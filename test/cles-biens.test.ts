import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockClesRepository } from "@/lib/adapters/mock/mock-cles-repository";
import { MockBienRepository } from "@/lib/adapters/mock/mock-bien-repository";
import type { BienHorsSyndic } from "@/lib/domain/bien";

// Trousseaux d'Asnieres (ADR-049, REA-53) : un acces vers un bien hors syndic se garde a la
// modification, le bien est relu en base, et la valeur des cles suit la composition.

const etat = vi.hoisted(() => ({ repo: null as unknown as MockClesRepository, biens: null as unknown as MockBienRepository }));

vi.mock("@/lib/adapters/router", () => ({
  getClesRepository: () => etat.repo,
  getBienRepository: () => etat.biens,
  getClesPhotoStore: () => ({ urlSignee: async () => null, televerser: async () => {} }),
}));

import { creerTrousseau, modifierTrousseau } from "@/lib/services/cles/referentiel";
import type { Acteur } from "@/lib/domain/cles/acteur";

const CAMILIA: Acteur = { id: "u1", nom: "Camilia F.", agence: "ASN", direction: [] };
const NEIS: Acteur = { id: "u2", nom: "Neis L.", agence: "LGC", direction: [] };
const XAVIER: Acteur = { id: "u3", nom: "Xavier B.", agence: "LGC", direction: [], activitesDirigees: ["transaction"] };

const bien = (id: string, agenceCode: string, activite: BienHorsSyndic["activite"]): BienHorsSyndic => ({
  id,
  agenceCode,
  activite,
  reference: `REF-${id}`,
  type: "immeuble",
  libelle: "",
  adresse: { numeroVoie: "22", typeVoie: "rue", nomVoie: "Olympe De Gouges", codePostal: "92600", ville: "ASNIÈRES-SUR-SEINE" },
  actif: true,
  source: "import_keyko",
});

beforeEach(() => {
  etat.repo = new MockClesRepository();
  etat.biens = new MockBienRepository();
  etat.biens.biens = [bien("b1", "ASN", "location"), bien("b2", "ASN", "transaction"), bien("b3", "LGC", "location")];
});

const accesBien = (id: string) => [{ bien: { type: "lot_locatif" as const, id, ref: "" }, types: ["total" as const], libelle: "", ordre: 0 }];

describe("trousseau qui ouvre un bien hors syndic", () => {
  it("relit le bien en base : type par l'activité, référence et adresse du référentiel", async () => {
    const t = await creerTrousseau({ agenceCode: "ASN", numero: "ALVES-48", libelle: "", composition: [], acces: accesBien("b2") }, CAMILIA);
    expect(t.acces[0].bien).toEqual({ type: "bien_vente", id: "b2", ref: "REF-b2", adresse: "22 rue Olympe De Gouges, 92600 ASNIÈRES-SUR-SEINE" });
  });

  it("refuse un bien d'une autre agence ou inconnu", async () => {
    await expect(creerTrousseau({ agenceCode: "ASN", numero: "X-1", libelle: "", composition: [], acces: accesBien("b3") }, CAMILIA)).rejects.toThrow(/introuvable dans l'agence/);
    await expect(creerTrousseau({ agenceCode: "ASN", numero: "X-2", libelle: "", composition: [], acces: accesBien("zz") }, CAMILIA)).rejects.toThrow(/introuvable dans l'agence/);
  });

  it("garde le bien et la valeur des clés quand on ajoute un élément", async () => {
    const t = await creerTrousseau({ agenceCode: "ASN", numero: "ALVES-48", libelle: "", composition: [{ type: "cle", libelle: "", quantite: 3, valeurUnitaire: 15 }], acces: accesBien("b1") }, CAMILIA);
    const maj = await modifierTrousseau(
      t.id,
      { numero: "ALVES-48", libelle: "", composition: [{ type: "cle", libelle: "", quantite: 3, valeurUnitaire: 15 }, { type: "badge", libelle: "Vigik", quantite: 1, valeurUnitaire: 25.555 }], acces: accesBien("b1") },
      CAMILIA,
    );
    expect(maj.acces[0].bien).toMatchObject({ type: "lot_locatif", id: "b1" });
    expect(maj.composition[1]).toEqual({ type: "badge", libelle: "Vigik", quantite: 1, valeurUnitaire: 25.56 });
  });

  it("le type annoncé par l'écran ne compte pas : Xavier (transaction) ne modifie pas un bien en location", async () => {
    const t = await creerTrousseau({ agenceCode: "ASN", numero: "LOC-1", libelle: "", composition: [], acces: accesBien("b1") }, CAMILIA);
    await expect(modifierTrousseau(t.id, { numero: "LOC-1", libelle: "", composition: [], acces: [{ bien: { type: "bien_vente", id: "b1", ref: "" }, types: ["total"], libelle: "", ordre: 0 }] }, XAVIER)).rejects.toThrow();
    await expect(modifierTrousseau(t.id, { numero: "LOC-1", libelle: "", composition: [], acces: accesBien("b1") }, NEIS)).rejects.toThrow();
  });
});
