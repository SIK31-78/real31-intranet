// Referentiel d'entreprises du cabinet (decision 4 du 16/10/2026, REA-333) : metiers et
// courtier partenaire sur les entreprises du module cles, via le mock.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockClesEntrepriseRepository, MockClesRepository, mockCles } from "@/lib/adapters/mock/mock-cles-repository";

const etat = vi.hoisted(() => ({ repo: null as unknown as MockClesRepository, entreprises: null as unknown as MockClesEntrepriseRepository }));

vi.mock("@/lib/adapters/router", () => ({
  getClesRepository: () => etat.repo,
  getClesEntrepriseRepository: () => etat.entreprises,
  getClesPhotoStore: () => ({ urlSignee: async () => null, televerser: async () => {} }),
}));

import { creerEntreprise, MESSAGE_COURTIER_PARTENAIRE, modifierEntreprise } from "@/lib/services/cles/referentiel";
import type { Acteur } from "@/lib/domain/cles/acteur";

const NEIS: Acteur = { id: "u1", nom: "Neis L.", agence: "LGC", direction: [] };

beforeEach(() => {
  etat.repo = new MockClesRepository();
  etat.entreprises = new MockClesEntrepriseRepository(etat.repo.nomsEntreprises);
});

describe("metiers du referentiel", () => {
  it("une entreprise sans metier reste comme avant : metiers [] et pas partenaire", async () => {
    const e = await creerEntreprise({ nom: "CTH" }, NEIS);
    expect(e.metiers).toEqual([]);
    expect(e.courtierPartenaire).toBe(false);
  });

  it("dedoublonne les metiers et garde l'ordre de saisie", async () => {
    const e = await creerEntreprise({ nom: "Ascenseurs Martin", metiers: ["ascensoriste", "organisme_controle", "ascensoriste"] }, NEIS);
    expect(e.metiers).toEqual(["ascensoriste", "organisme_controle"]);
  });

  it("refuse « courtier partenaire » sur une entreprise qui n'est pas courtier", async () => {
    await expect(creerEntreprise({ nom: "Engie", metiers: ["fournisseur_gaz"], courtierPartenaire: true }, NEIS)).rejects.toThrow(MESSAGE_COURTIER_PARTENAIRE);
    await expect(creerEntreprise({ nom: "Sans métier", courtierPartenaire: true }, NEIS)).rejects.toThrow(MESSAGE_COURTIER_PARTENAIRE);
  });

  it("un courtier peut etre partenaire ; retirer le metier courtier retombe le drapeau", async () => {
    const verdier = await creerEntreprise({ nom: "Cabinet Verdier Courtage", metiers: ["courtier"], courtierPartenaire: true }, NEIS);
    expect(verdier.courtierPartenaire).toBe(true);
    // Le formulaire envoie courtierPartenaire: false quand il decoche courtier ; un appelant qui l'omet est retombe aussi.
    const maj = await modifierEntreprise(verdier.id, { nom: verdier.nom, metiers: ["assureur"] });
    expect(maj.metiers).toEqual(["assureur"]);
    expect(maj.courtierPartenaire).toBe(false);
    // Coche explicitement sans le metier : refuse, la fiche n'est pas touchee.
    await expect(modifierEntreprise(verdier.id, { nom: verdier.nom, metiers: ["assureur"], courtierPartenaire: true })).rejects.toThrow(MESSAGE_COURTIER_PARTENAIRE);
    expect((await etat.entreprises.get(verdier.id))?.courtierPartenaire).toBe(false);
  });

  it("un appelant qui ne connait pas les metiers (comptoir) ne les efface pas", async () => {
    const e = await creerEntreprise({ nom: "Otis", metiers: ["ascensoriste"] }, NEIS);
    const maj = await modifierEntreprise(e.id, { nom: "Otis", telephone: "01 00 00 00 00" });
    expect(maj.metiers).toEqual(["ascensoriste"]);
  });

  it("listerParMetier filtre sur le metier et trie par nom", async () => {
    await creerEntreprise({ nom: "Schindler", metiers: ["ascensoriste"] }, NEIS);
    await creerEntreprise({ nom: "Ascenseurs Martin", metiers: ["ascensoriste", "organisme_controle"] }, NEIS);
    await creerEntreprise({ nom: "Engie", metiers: ["fournisseur_gaz"] }, NEIS);
    await creerEntreprise({ nom: "CTH" }, NEIS);
    expect((await etat.entreprises.listerParMetier("ascensoriste")).map((e) => e.nom)).toEqual(["Ascenseurs Martin", "Schindler"]);
    expect((await etat.entreprises.listerParMetier("fournisseur_gaz")).map((e) => e.nom)).toEqual(["Engie"]);
    expect(await etat.entreprises.listerParMetier("courtier")).toEqual([]);
  });

  it("le jeu partage du mode mock porte un ascensoriste, un courtier partenaire et un fournisseur de gaz", async () => {
    const { entreprises } = mockCles();
    const verdier = await entreprises.get("ent-verdier-courtage");
    expect(verdier).toMatchObject({ nom: "Cabinet Verdier Courtage", metiers: ["courtier"], courtierPartenaire: true });
    expect((await entreprises.listerParMetier("ascensoriste")).map((e) => e.id)).toContain("ent-ascenseurs-martin");
    expect((await entreprises.listerParMetier("fournisseur_gaz")).map((e) => e.nom)).toEqual(["Engie"]);
  });
});
