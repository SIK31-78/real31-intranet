// Indexation par apports (etape 2, etude §1). Cas de reference : les 14 documents de S0306,
// dont le routage par NOM ne classait correctement que 6 (cf. indexation-attendue.json).

import { describe, expect, it } from "vitest";
import { indexerDocument, indexerLot } from "@/lib/reprise/domain/indexation-documents";
import {
  documentsIgnores,
  documentsPour,
  messageApportManquant,
  verifierCouverture,
} from "@/lib/reprise/domain/apports";

/** Texte assez long pour compter comme couche texte (seuil 200 car.). */
const rembourrer = (s: string): string => s + " ".repeat(Math.max(0, 220 - s.length));

describe("indexerDocument - le contenu decide, le nom n'est qu'un indice", () => {
  it("capte le RGD par son sigle ET par sa forme en clair (le bug d'un caractere)", () => {
    // `pourStructure` cherchait "rgdd" (deux d) : le sigle metier est RGD. Et "releve
    // general des depenses" en clair n'etait capte par RIEN -> ANNEXE.
    const parSigle = indexerDocument({ nom: "rgd.pdf", texte: rembourrer("RGD exercice 2025 TVA deductible") });
    const enClair = indexerDocument({
      nom: "Releve-general-depenses-date 2025.pdf",
      texte: rembourrer("Releve general des depenses 2025 - repartition des charges"),
    });
    expect(parSigle.apports).toContain("tva_deductible_par_facture");
    expect(enClair.apports).toContain("tva_deductible_par_facture");
    expect(enClair.apports).toContain("cles_utilisees_en_compta");
  });

  it("capte un grand livre nomme 'Balance generale' ou 'Journal'", () => {
    // estNomGrandLivre ne connaissait que "grand livre" et "GL" : un syndic qui sort une
    // balance ou un journal ne declenchait JAMAIS le pipeline compta.
    for (const t of ["Balance generale exercice 2025", "Journal general des ecritures"]) {
      expect(indexerDocument({ nom: "export.pdf", texte: rembourrer(t) }).apports).toContain(
        "ecritures_comptables",
      );
    }
  });

  it("voit la feuille de presence comme porteuse de CINQ apports", () => {
    // La donnee n'est pas ou le nom la promet : les tantiemes et les 118 attributions de
    // S0306 venaient de la FDP, pas de l'EDD ni du RCP (scans de 1974).
    const fdp = indexerDocument({
      nom: "Feuille de presence - 2026.pdf",
      texte: rembourrer(
        "Feuille de presence assemblee generale - copropriétaire adresse - N° de lot / tantiemes - Nombre de tantiemes : 2459 - lot n° 12",
      ),
    });
    expect(fdp.apports).toEqual(
      expect.arrayContaining([
        "owners_adresses",
        "attributions",
        "tantiemes_par_lot",
        "totaux_tantiemes_par_owner",
        "lots_descriptif",
      ]),
    );
  });

  it("voit dans une convocation de 87 pages l'etat de repartition 450 qu'aucun nom ne promet", () => {
    const convoc = indexerDocument({
      nom: "CONVOCATION_AG_654464_139.pdf",
      texte: rembourrer("Convocation AG - annexe 2 - repartition par compte 45000019 - TVA deductible - debiteurs"),
    });
    expect(convoc.apports).toEqual(
      expect.arrayContaining(["quotes_parts_450", "tva_deductible_par_facture", "debiteurs_crediteurs"]),
    );
  });

  it("accorde le DROIT DE NE RIEN ANALYSER (economie directe)", () => {
    const rien = indexerDocument({ nom: "devis-ravalement.pdf", texte: rembourrer("Devis peinture facade") });
    expect(rien.apports).toEqual(["aucun"]);
    expect(documentsIgnores([rien])).toHaveLength(1);
  });

  it("le nom ne parle QUE si le contenu est muet, et ne contredit jamais un texte lu", () => {
    // Scan muet : le nom sert d'indice, marque comme a confirmer.
    const scan = indexerDocument({ nom: "grand-livre-2025.pdf", texte: "" });
    expect(scan.forme).toBe("scan");
    expect(scan.apports).toContain("ecritures_comptables");
    expect(scan.motif).toContain("a confirmer");

    // Texte lu : le nom trompeur ne peut RIEN ajouter (piege "EDD" = etat descriptif de
    // division cote patrimoine OU etat detaille des depenses cote compta).
    const edd = indexerDocument({
      nom: "EDD.pdf",
      texte: rembourrer("Etat detaille des depenses - releve general des depenses - TVA deductible"),
    });
    expect(edd.apports).toContain("tva_deductible_par_facture");
    expect(edd.apports).not.toContain("lots_descriptif");
  });
});

describe("indexerLot - doublons de forme", () => {
  it("prefere la couche texte au scan du MEME document", () => {
    const index = indexerLot([
      { nom: "Releve-general-depenses-date 2025.pdf", texte: rembourrer("Releve general des depenses 2025 TVA deductible") },
      { nom: "rgd.pdf", texte: rembourrer("Releve general des depenses 2025 TVA deductible") },
    ]);
    const texte = index.find((d) => d.nom.startsWith("Releve"))!;
    const scan = index.find((d) => d.nom === "rgd.pdf")!;
    expect(texte.doublonDe).toBeUndefined();
    expect(scan.doublonDe).toBe("Releve-general-depenses-date 2025.pdf");
    // Un doublon n'apporte rien de plus : il ne compte pas dans la couverture...
    expect(documentsPour(index, "tva_deductible_par_facture")).toHaveLength(1);
  });

  it("ne confond PAS deux exercices differents (2025 vs 2026)", () => {
    const index = indexerLot([
      { nom: "Releve 2025.pdf", texte: rembourrer("Releve general des depenses 2025 TVA deductible") },
      { nom: "Releve 2026.pdf", texte: rembourrer("Releve general des depenses 2026 TVA deductible") },
    ]);
    expect(index.every((d) => !d.doublonDe)).toBe(true);
  });

  it("ne presume AUCUN doublon quand l'annee est indeterminable (perdre un doc est pire)", () => {
    const index = indexerLot([
      { nom: "a.pdf", texte: rembourrer("Releve general des depenses TVA deductible") },
      { nom: "b.pdf", texte: rembourrer("Releve general des depenses TVA deductible") },
    ]);
    expect(index.every((d) => !d.doublonDe)).toBe(true);
  });
});

describe("couverture des apports requis (§1.5, controle miroir)", () => {
  it("BLOQUE si aucun document n'apporte une donnee requise", () => {
    const index = indexerLot([
      { nom: "gl.pdf", texte: rembourrer("Grand-livre exercice 2025") },
    ]);
    const c = verifierCouverture(index, "patrimoine");
    expect(c.ok).toBe(false);
    expect(c.requisManquants).toEqual(
      expect.arrayContaining(["lots_descriptif", "tantiemes_par_lot", "owners_adresses", "attributions"]),
    );
  });

  it("passe quand les requis sont couverts, meme par UN seul document", () => {
    const index = indexerLot([
      {
        nom: "Feuille de presence.pdf",
        texte: rembourrer(
          "Feuille de presence - copropriétaire adresse - N° de lot / tantiemes - lot n° 3 - Nombre de tantiemes : 153",
        ),
      },
    ]);
    const c = verifierCouverture(index, "patrimoine");
    expect(c.ok).toBe(true);
    // Les souhaites manquants sont une NOTE, pas un blocage.
    expect(c.souhaitesManquants).toContain("nb_lots_batiments");
  });

  it("le message d'un requis manquant dit QUOI demander (comme les refus §3bis)", () => {
    expect(messageApportManquant("tva_deductible_par_facture")).toContain("relevé général des dépenses");
    expect(messageApportManquant("attributions")).toContain("feuille de présence");
    expect(messageApportManquant("ecritures_comptables")).toContain("grand livre");
  });
});
