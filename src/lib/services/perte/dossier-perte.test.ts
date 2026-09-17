import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoproRepository } from "@/lib/ports/copro-repository";
import type { PerteRepository } from "@/lib/ports/perte-repository";
import type { DossierPerte } from "@/lib/domain/perte/dossier";

// Ouvrir une perte = deux ecritures : le dossier (la trace), PUIS la copro inactive au
// referentiel App A. L'ordre est une garantie documentee (si la perte echoue, le dossier
// existe et le dit). Aucun test avant l'audit du 16/09/2026.

const etat = vi.hoisted(() => ({
  copro: null as { code: string; nom: string; statut: "active" | "inactive" } | null,
  enCours: null as DossierPerte | null,
  ordre: [] as string[],
  dossiers: [] as DossierPerte[],
  pannePerte: false,
}));

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () =>
    ({
      async findByCode() {
        return etat.copro;
      },
      async perdreCopro() {
        etat.ordre.push("perdreCopro");
        if (etat.pannePerte) throw new Error("PostgREST timeout");
      },
    }) satisfies Partial<Record<keyof CoproRepository, unknown>>,
  getPerteRepository: () =>
    ({
      async getEnCoursPourCopro() {
        return etat.enCours;
      },
      async creer(d: Omit<DossierPerte, "id">) {
        etat.ordre.push("creer");
        const dossier = { ...d, id: `d${etat.dossiers.length + 1}` } as DossierPerte;
        etat.dossiers.push(dossier);
        return dossier;
      },
      async get(id: string) {
        return etat.dossiers.find((d) => d.id === id) ?? null;
      },
      async sauver(d: DossierPerte) {
        etat.dossiers = etat.dossiers.map((x) => (x.id === d.id ? d : x));
      },
    }) satisfies Partial<Record<keyof PerteRepository, unknown>>,
}));

import { mettreAJourEtapePerte, ouvrirDossierPerte } from "./dossier-perte";

const ouverture = { coproCode: "S182", dateAgISO: "2026-09-10", finGestionISO: "2026-12-31", motif: "Changement de syndic", par: "Sandy CARRIER" };

beforeEach(() => {
  etat.copro = { code: "S182", nom: "LES LILAS", statut: "active" };
  etat.enCours = null;
  etat.ordre = [];
  etat.dossiers = [];
  etat.pannePerte = false;
});

describe("ouvrirDossierPerte", () => {
  it("cree le dossier AVANT de passer la copro inactive, et l'etape LE3 est faite", async () => {
    const d = await ouvrirDossierPerte(ouverture);
    expect(etat.ordre).toEqual(["creer", "perdreCopro"]);
    expect(d.statut).toBe("en_cours");
    expect(d.etapes.find((e) => e.code === "LE3")).toMatchObject({ statut: "fait", assigneA: "Sandy CARRIER" });
    expect(d.journal.map((j) => j.texte)).toEqual([
      "Dossier ouvert : AG du 10/09/2026, gérée jusqu'au 31/12/2026 — Changement de syndic",
      "Copropriété passée inactive au référentiel",
    ]);
  });
  it("si la perte au referentiel echoue, le dossier existe quand meme et l'erreur remonte", async () => {
    etat.pannePerte = true;
    await expect(ouvrirDossierPerte(ouverture)).rejects.toThrow("PostgREST timeout");
    expect(etat.dossiers).toHaveLength(1);
  });
  it("refuse un second dossier pour la meme copro", async () => {
    etat.enCours = { id: "d0" } as DossierPerte;
    await expect(ouvrirDossierPerte(ouverture)).rejects.toThrow(/déjà ouvert pour S182/);
    expect(etat.ordre).toEqual([]);
  });
  it("ne repasse pas inactive une copro qui l'est deja ; refuse une copro inconnue ou une date illisible", async () => {
    etat.copro = { code: "S182", nom: "LES LILAS", statut: "inactive" };
    await ouvrirDossierPerte(ouverture);
    expect(etat.ordre).toEqual(["creer"]);
    etat.copro = null;
    await expect(ouvrirDossierPerte(ouverture)).rejects.toThrow(/S182 introuvable/);
    await expect(ouvrirDossierPerte({ ...ouverture, dateAgISO: "10/09/2026" })).rejects.toThrow(/date d'AG illisible/);
  });
});

describe("mettreAJourEtapePerte", () => {
  it("cocher toutes les cases termine l'etape ; passer chaque etape a fait termine le dossier", async () => {
    const d = await ouvrirDossierPerte(ouverture);
    const avecControles = d.etapes.find((e) => e.controles && Object.keys(e.controles).length > 0);
    if (avecControles) {
      let maj = d;
      for (const libelle of Object.keys(avecControles.controles!)) {
        maj = await mettreAJourEtapePerte(d.id, avecControles.code, { controle: { libelle, coche: true } }, "Sandy");
      }
      expect(maj.etapes.find((e) => e.code === avecControles.code)!.statut).toBe("fait");
    }
    let maj = d;
    for (const e of d.etapes) maj = await mettreAJourEtapePerte(d.id, e.code, { statut: "fait" }, "Sandy");
    expect(maj.statut).toBe("termine");
    expect(maj.journal.at(-1)!.texte).toBe("Dossier terminé : toutes les étapes sont faites");
  });
  it("le journal garde les mots du module : « ignore » se dit « sans objet », et l'etape ignoree compte comme close", async () => {
    const d = await ouvrirDossierPerte(ouverture);
    const maj = await mettreAJourEtapePerte(d.id, "LE4", { statut: "ignore" }, "Sandy");
    expect(maj.etapes.find((e) => e.code === "LE4")!.statut).toBe("ignore");
    expect(maj.journal.at(-1)!.texte).toBe("LE4 → sans objet");
    let fin = maj;
    for (const e of d.etapes) if (e.code !== "LE4") fin = await mettreAJourEtapePerte(d.id, e.code, { statut: "fait" }, "Sandy");
    expect(fin.statut).toBe("termine");
  });
  it("etape inconnue ou dossier inconnu : erreur explicite", async () => {
    const d = await ouvrirDossierPerte(ouverture);
    await expect(mettreAJourEtapePerte(d.id, "ZZ9", { statut: "fait" }, "S")).rejects.toThrow(/Étape inconnue : ZZ9/);
    await expect(mettreAJourEtapePerte("nope", "LE3", { statut: "fait" }, "S")).rejects.toThrow(/introuvable/);
  });
});
