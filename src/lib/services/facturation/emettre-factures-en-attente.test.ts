// Regression signalee par Emmanuel LOPES : la reference du sinistre saisie dans
// le champ "Libelle du sinistre" etait bien stockee, mais n'arrivait plus sur la
// facture Pennylane - le comptable ne pouvait plus codifier. Elle doit repartir
// dans pdf_invoice_free_text, a cote du code entite.
//
// Le test remonte la chaine complete : facture stockee -> demande d'emission ->
// payload Pennylane, et verifie que les autres prestations gardent le code
// entite seul.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FactureAEmettre } from "@/lib/ports/facturation-repository";
import type { DemandeEmission } from "@/lib/ports/invoicing-provider";
import { construirePayloadFacture } from "@/lib/adapters/pennylane/payload";

const etat = vi.hoisted(() => {
  const ref = {
    aEmettre: [] as FactureAEmettre[],
    demandes: [] as DemandeEmission[],
    erreurs: [] as string[],
    reset() {
      ref.aEmettre = [];
      ref.demandes = [];
      ref.erreurs = [];
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getFacturationRepository: () => ({
    async listerFacturesAEmettre() {
      return etat.aEmettre;
    },
    async chargerProduits() {
      return [];
    },
    async getClientFacturationRef() {
      return "penny-client-1";
    },
    async getAgenceCopro() {
      return "LGC";
    },
    async marquerFacturee() {},
    async marquerErreur(_id: string, message: string) {
      etat.erreurs.push(message);
    },
  }),
  getInvoicingProvider: () => ({
    async creerFactureBrouillon(demande: DemandeEmission) {
      etat.demandes.push(demande);
      return { factureExterneId: `ext-${etat.demandes.length}` };
    },
  }),
}));

import { emettreFacturesEnAttente } from "@/lib/services/facturation/emettre-factures-en-attente";

/** Facture minimale a emettre, une ligne, personnalisable par le test. */
function facture(surcharge: Partial<FactureAEmettre>): FactureAEmettre {
  return {
    id: "f1",
    coproCode: "S072",
    typePrestation: "suivi_sinistre",
    libelle: "Suivi de sinistre - S072DODUPINDDE",
    dateFacture: "2026-08-19",
    lignes: [
      {
        description: "Constitution du dossier assureur",
        categorieProduit: null,
        quantite: 1,
        prixUnitaireHt: 135,
        tauxTva: 0.2,
      },
    ],
    ...surcharge,
  };
}

beforeEach(() => {
  etat.reset();
});

describe("emission - reference du sinistre sur le PDF", () => {
  it("suivi de sinistre : la reference saisie repart dans pdf_invoice_free_text", async () => {
    etat.aEmettre = [facture({ details: { libelleSinistre: "S072DODUPINDDE" } })];

    const resultat = await emettreFacturesEnAttente(["f1"]);

    expect(resultat.emises).toBe(1);
    expect(etat.demandes[0]!.mentionLibre).toBe("S072DODUPINDDE");
    expect(construirePayloadFacture(etat.demandes[0]!).pdf_invoice_free_text).toBe(
      "S072 - S072DODUPINDDE",
    );
  });

  it("les autres prestations gardent le code entite seul", async () => {
    etat.aEmettre = [
      facture({
        id: "f2",
        coproCode: "S016",
        typePrestation: "gestion_courante",
        libelle: "Honoraires de gestion courante 2026-T3",
        // Meme si des details sont stockes, ils ne partent pas sur le PDF.
        details: { libelleSinistre: "NE-DOIT-PAS-APPARAITRE", periode: "2026-T3" },
      }),
    ];

    await emettreFacturesEnAttente(["f2"]);

    expect(etat.demandes[0]!.mentionLibre).toBeUndefined();
    expect(construirePayloadFacture(etat.demandes[0]!).pdf_invoice_free_text).toBe("S016");
  });

  it("sinistre sans reference saisie : code entite seul, pas de tiret orphelin", async () => {
    etat.aEmettre = [
      facture({ id: "f3", details: { anneeBareme: 2026 } }),
      facture({ id: "f4", details: { libelleSinistre: "   " } }),
      facture({ id: "f5", details: null }),
    ];

    await emettreFacturesEnAttente(["f3", "f4", "f5"]);

    expect(etat.demandes).toHaveLength(3);
    for (const demande of etat.demandes) {
      expect(construirePayloadFacture(demande).pdf_invoice_free_text).toBe("S072");
    }
  });
});
