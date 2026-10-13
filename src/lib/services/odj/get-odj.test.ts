// Composition de l'ODJ (get-odj) : ce que la fiche copro sait doit arriver dans l'ODJ.
// Toutes les sources sont simulees : aucune base, aucun appel ESTALE.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Odj } from "@/lib/domain/odj";

const etat = vi.hoisted(() => ({
  copro: {} as Record<string, unknown>,
  confirmations: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async findByCode() {
      return etat.copro;
    },
  }),
  getOdjRepository: () => ({
    async getEtat() {
      return [];
    },
  }),
}));
vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({
  donneesCoproEstale: async () => null,
}));
vi.mock("@/lib/services/coproprietes/confirmation-evenement", () => ({
  getConfirmations: async () => etat.confirmations,
}));
vi.mock("@/lib/services/agences/resoudre-agence", () => ({
  codeAgence: async () => undefined,
}));

import { getOdj } from "./get-odj";

function copro(extra: Record<string, unknown> = {}) {
  return {
    code: "S146",
    nom: "Les Marronniers",
    adresse: { ligne1: "12 rue des Lilas", codePostal: "92250", ville: "La Garenne-Colombes" },
    lotsPrincipaux: 20,
    equipe: [],
    prochaineAg: { date: "2026-11-16" },
    ...extra,
  };
}

function enTete(odj: Odj | null, id: string) {
  return odj?.enTete.find((c) => c.id === id);
}

beforeEach(() => {
  etat.copro = copro();
  etat.confirmations = [];
});

describe("getOdj - date du CS", () => {

  it("porte l'heure du CS quand la fiche copro la connait (REA-143)", async () => {
    etat.copro = copro({ prochaineCsDate: "2026-10-05", prochaineCsHeure: "18:30" });
    const odj = await getOdj("S146", "g1");
    expect(enTete(odj, "date-cs")?.valeur).toBe("05/10/2026 à 18h30");
  });

  it("garde la date seule pour un CS sans heure (journee entiere)", async () => {
    etat.copro = copro({ prochaineCsDate: "2026-10-05" });
    const odj = await getOdj("S146", "g1");
    expect(enTete(odj, "date-cs")?.valeur).toBe("05/10/2026");
  });
});

describe("getOdj - gestion courante (REA-251)", () => {
  function gestion(odj: Odj | null) {
    return odj?.sections.find((s) => s.id === "gestion-courante")?.champs ?? [];
  }

  it("reprend l'echeance d'assurance et le dernier controle gaz / VMC de la fiche copro", async () => {
    etat.copro = copro({ assuranceEcheance: "2027-03-31", ctqGazVmcDate: "2025-06-12" });
    const champs = gestion(await getOdj("S146", "g1"));
    const assurance = champs.find((c) => c.id === "gestion.assurance");
    const ctq = champs.find((c) => c.id === "gestion.ctq-gaz-vmc");
    expect(assurance).toMatchObject({ libelle: "Échéance du contrat d'assurance", valeur: "31/03/2027", editable: true });
    expect(ctq).toMatchObject({ libelle: "Dernier contrôle gaz / VMC (CTQ)", valeur: "12/06/2025", editable: true });
    // Juste apres les contrats d'energie, dans la meme section.
    const ids = champs.map((c) => c.id);
    expect(ids.indexOf("gestion.assurance")).toBe(ids.indexOf("gestion.electricite") + 1);
    expect(ids.indexOf("gestion.ctq-gaz-vmc")).toBe(ids.indexOf("gestion.assurance") + 1);
  });

  it("sans donnee sur la fiche, les deux lignes restent a saisir", async () => {
    etat.copro = copro();
    const champs = gestion(await getOdj("S146", "g1"));
    expect(champs.find((c) => c.id === "gestion.assurance")?.valeur).toBeUndefined();
    expect(champs.find((c) => c.id === "gestion.ctq-gaz-vmc")?.valeur).toBeUndefined();
  });

  it("les deux lignes passent dans l'ODJ rempli (Word / PDF)", async () => {
    const { arbreOdj } = await import("@/lib/domain/odj-rendu");
    etat.copro = copro({ assuranceEcheance: "2027-03-31", ctqGazVmcDate: "2025-06-12" });
    const odj = await getOdj("S146", "g1");
    const section = arbreOdj(odj!).sections.find((s) => s.titre === "Gestion courante");
    const lignes = (section?.noeuds ?? []).flatMap((n) => (n.type === "ligne" ? [[n.libelle, n.valeur]] : []));
    expect(lignes).toContainEqual(["Échéance du contrat d'assurance", "31/03/2027"]);
    expect(lignes).toContainEqual(["Dernier contrôle gaz / VMC (CTQ)", "12/06/2025"]);
  });
});

describe("getOdj - lieu de l'AG (REA-148)", () => {
  it("une reunion a l'exterieur du cabinet : l'adresse libre est le lieu", async () => {
    etat.confirmations = [{ type: "AG", lieuLibre: "Salle municipale, 3 place de la Mairie, 92250 La Garenne-Colombes" }];
    const lieu = enTete(await getOdj("S146", "g1"), "lieu");
    expect(lieu).toMatchObject({ valeur: "Salle municipale, 3 place de la Mairie, 92250 La Garenne-Colombes", source: "supabase" });
  });

  it("l'adresse libre prime sur une salle du cabinet", async () => {
    etat.confirmations = [{ type: "AG", lieuLibre: "Loge du gardien", salleEmail: "inconnue@real31.fr" }];
    expect(enTete(await getOdj("S146", "g1"), "lieu")?.valeur).toBe("Loge du gardien");
  });

  it("un lieu libre sur le CS ne remonte pas comme lieu de l'AG", async () => {
    etat.confirmations = [{ type: "CS", lieuLibre: "Chez le président" }];
    const lieu = enTete(await getOdj("S146", "g1"), "lieu");
    expect(lieu?.valeur).toBeUndefined();
    expect(lieu?.source).toBe("manuel");
  });

  it("colonne absente (SQL pas encore passe) : lieu vide, aucune erreur", async () => {
    etat.confirmations = [{ type: "AG" }];
    expect(enTete(await getOdj("S146", "g1"), "lieu")?.valeur).toBeUndefined();
  });
});
