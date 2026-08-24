// LE DRY-RUN DE BOUT EN BOUT du volet patrimoine (critere de la refonte 2026-08) :
//   verser les 4 xlsx -> analyse (parsing + auto-checks) -> GO -> injection DRY-RUN
//   (createCondo + lots -> cles -> tantiemes -> owners -> links, IDs captures) -> rapport.
// AUCUN reseau : l'adapter d'ecriture est le dry-run (journal en memoire, IDs deterministes).
// Le volet compta a son propre dry-run complet dans produire-compta.test.ts.
import { describe, expect, it } from "vitest";
import { genererPhaseABuffers } from "@/lib/reprise/adapters/xlsx/generer-xlsx";
import { DryRunEstaleEcritureProvider } from "@/lib/reprise/adapters/estale-ecriture/dry-run-provider";
import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import { analyserPatrimoineDepuisXlsx, produirePhaseABuffers } from "../orchestrateur-patrimoine";
import { onboarderCopro, type MetadonneesCopro } from "../onboarder-copro";
import { jeuCanonique } from "./fixtures/jeu-canonique";

const META: MetadonneesCopro = {
  name: "Copro Test Dry-Run",
  reference: "S0999",
  management: "CONDO",
  establishmentID: "etab-test",
  address: { postcode: "31000", city: "Toulouse", country: "France" },
};

describe("dry-run de bout en bout (verser -> valider -> GO -> injecter -> rapport)", () => {
  it("deroule le flux complet sans aucun reseau", async () => {
    // 1. VERSER : les 4 xlsx (fixtures = les buffers generes depuis le jeu canonique,
    // exactement ce que le skill estale-migration produit).
    const buffers = await genererPhaseABuffers(jeuCanonique());
    const fichiers: DocumentSource[] = buffers.map((b) => ({ nom: b.nom, contenu: b.contenu }));
    expect(fichiers.map((f) => f.nom)).toEqual([
      "lots.xlsx",
      "tantiemes_001_charges-generales.xlsx",
      "owners.xlsx",
      "links_DRAFT.xlsx",
    ]);

    // 2. VALIDER : parsing + auto-checks -> recap GO/STOP vert.
    const { jeu, recap, erreursParsing } = await analyserPatrimoineDepuisXlsx(fichiers);
    expect(erreursParsing).toEqual([]);
    expect(recap.checks.ok).toBe(true);
    expect(recap.pretAProduire).toBe(true);
    expect(recap.lots.total).toBe(3);
    expect(recap.owners.total).toBe(3);

    // 3. GO -> INJECTION DRY-RUN (le GO humain est la modale UI ; ici on l'a donne).
    const provider = new DryRunEstaleEcritureProvider();
    const rapport = await onboarderCopro(provider, jeu, { metadonnees: META });

    // 4. RAPPORT : copro creee, compteurs = le jeu, aucune erreur, plan ordonne complet.
    expect(rapport.succes).toBe(true);
    expect(rapport.coproCreee).toBe(true);
    expect(rapport.condoID).toBeTruthy();
    expect(rapport.injection.compteurs).toEqual({ lots: 3, cles: 1, tantiemes: 3, owners: 3, links: 3 });
    expect(rapport.injection.erreur).toBeUndefined();
    expect(rapport.injection.operations.length).toBeGreaterThan(0);

    // Et la production des xlsx de repli marche sur le MEME jeu (apres GO).
    const produits = await produirePhaseABuffers(jeu);
    expect(produits.map((p) => p.type)).toEqual(["lots", "tantiemes", "owners", "links_draft"]);
  });
});
