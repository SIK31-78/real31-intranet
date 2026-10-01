// Saisie des factures REAL31 dans ESTALE (REA-11) : ce qui part, ce qui attend, ce qui
// ne part jamais deux fois.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FacturationRepository, FacturePourEstale } from "@/lib/ports/facturation-repository";
import type { FactureEmise, InvoicingProvider } from "@/lib/ports/invoicing-provider";
import type { ComptaEstaleProvider, FactureFournisseurEstale } from "@/lib/ports/compta-estale-provider";
import { CATEGORIE_FORFAIT_POSTAUX, CATEGORIE_GESTION_COURANTE } from "@/lib/domain/facturation/produits";

const etat = vi.hoisted(() => ({
  factures: [] as FacturePourEstale[],
  pennylane: new Map<string, FactureEmise>(),
  coprosEstale: new Set<string>(),
  depots: [] as FactureFournisseurEstale[],
  envoyees: new Map<string, string>(),
  erreurs: new Map<string, string>(),
  depotEnPanne: false,
}));

vi.mock("@/lib/adapters/router", () => ({
  getFacturationRepository: (): Partial<Record<keyof FacturationRepository, unknown>> => ({
    async listerFacturesPourEstale() {
      return etat.factures;
    },
    async marquerEnvoyeeEstale(id: string, ecritureId: string) {
      etat.envoyees.set(id, ecritureId);
    },
    async marquerErreurEstale(id: string, message: string) {
      etat.erreurs.set(id, message);
    },
  }),
  getInvoicingProvider: (): Partial<Record<keyof InvoicingProvider, unknown>> => ({
    async lireFactureEmise(id: string) {
      return etat.pennylane.get(id);
    },
    async telechargerPdf() {
      return new Uint8Array([37, 80, 68, 70]);
    },
  }),
  getComptaEstaleProvider: (): Partial<Record<keyof ComptaEstaleProvider, unknown>> => ({
    async coproPresente(code: string) {
      return etat.coprosEstale.has(code);
    },
    async deposerFacture(f: FactureFournisseurEstale) {
      if (etat.depotEnPanne) throw new Error("L'exercice ESTALE qui couvre le 2026-03-31 est verrouillé.");
      etat.depots.push(f);
      return { ecritureId: `ecriture-${f.numero}`, dejaPresente: false };
    },
  }),
}));

const { saisirFacturesDansEstale, MESSAGE_BROUILLON_PENNYLANE } = await import("./saisir-factures-estale");

function factureGc(id: string, coproCode: string, extra: Partial<FacturePourEstale> = {}): FacturePourEstale {
  return {
    id,
    coproCode,
    typePrestation: "gestion_courante",
    libelle: "Honoraires de gestion courante - 2026-T4",
    factureExterneId: `pl-${id}`,
    lignes: [
      { categorieProduit: CATEGORIE_GESTION_COURANTE, quantite: 1, prixUnitaireHt: 1000, tauxTva: 0.2 },
      { categorieProduit: CATEGORIE_FORFAIT_POSTAUX, quantite: 1, prixUnitaireHt: 45.5, tauxTva: 0 },
    ],
    ...extra,
  };
}

const validee = (numero: string, montantTtc = 1245.5): FactureEmise => ({
  validee: true,
  numero,
  date: "2026-10-01",
  echeance: "2026-10-31",
  montantTtc,
});

beforeEach(() => {
  etat.factures = [];
  etat.pennylane.clear();
  etat.coprosEstale = new Set(["S300"]);
  etat.depots = [];
  etat.envoyees.clear();
  etat.erreurs.clear();
  etat.depotEnPanne = false;
});

describe("saisirFacturesDansEstale", () => {
  it("saisit une facture validee, ventilee 6211 / 6213, avec son numero Pennylane et son PDF", async () => {
    etat.factures = [factureGc("f1", "S300")];
    etat.pennylane.set("pl-f1", validee("F-2026-10-00001"));

    const r = await saisirFacturesDansEstale(["f1"]);

    expect(r).toMatchObject({ envoyees: 1, enAttente: 0, enErreur: 0 });
    expect(etat.depots[0]).toMatchObject({
      coproCode: "S300",
      numero: "F-2026-10-00001",
      date: "2026-10-01",
      echeance: "2026-10-31",
      nomFichier: "F-2026-10-00001.pdf",
      lignes: [
        { compte: "6211", montantTtc: 1200, tva: 200 },
        { compte: "6213", montantTtc: 45.5, tva: 0 },
      ],
    });
    expect(etat.envoyees.get("f1")).toBe("ecriture-F-2026-10-00001");
  });

  it("laisse un brouillon Pennylane en attente, avec la raison, sans rien envoyer", async () => {
    etat.factures = [factureGc("f1", "S300")];
    etat.pennylane.set("pl-f1", { validee: false, date: "2026-10-01", echeance: "2026-10-31", montantTtc: 1245.5 });

    const r = await saisirFacturesDansEstale(["f1"]);

    expect(r).toMatchObject({ envoyees: 0, enAttente: 1, enErreur: 0 });
    expect(etat.depots).toHaveLength(0);
    expect(etat.erreurs.get("f1")).toBe(MESSAGE_BROUILLON_PENNYLANE);
  });

  it("ignore sans trace une copro hors ESTALE, une autre prestation et une facture deja saisie", async () => {
    etat.factures = [
      factureGc("f1", "S091"),
      factureGc("f2", "S300", { typePrestation: "etat_date" }),
      factureGc("f3", "S300", { estaleEcritureId: "deja" }),
    ];

    const r = await saisirFacturesDansEstale(["f1", "f2", "f3"]);

    expect(r).toMatchObject({ envoyees: 0, enAttente: 0, enErreur: 0 });
    expect(etat.depots).toHaveLength(0);
    expect(etat.erreurs.size).toBe(0);
  });

  it("refuse d'envoyer si le total intranet ne tombe pas au centime sur Pennylane", async () => {
    etat.factures = [factureGc("f1", "S300")];
    etat.pennylane.set("pl-f1", validee("F-2026-10-00001", 1245.51));

    const r = await saisirFacturesDansEstale(["f1"]);

    expect(r.enErreur).toBe(1);
    expect(etat.depots).toHaveLength(0);
    expect(etat.erreurs.get("f1")).toMatch(/Montants discordants/);
  });

  it("trace un refus ESTALE sur la facture et continue avec les suivantes", async () => {
    etat.factures = [factureGc("f1", "S300"), factureGc("f2", "S300")];
    etat.pennylane.set("pl-f1", validee("F-1"));
    etat.pennylane.set("pl-f2", validee("F-2"));
    etat.depotEnPanne = true;

    const r = await saisirFacturesDansEstale(["f1", "f2"]);

    expect(r).toMatchObject({ envoyees: 0, enErreur: 2 });
    expect(etat.erreurs.get("f1")).toMatch(/verrouillé/);
    expect(etat.erreurs.get("f2")).toMatch(/verrouillé/);
  });
});
