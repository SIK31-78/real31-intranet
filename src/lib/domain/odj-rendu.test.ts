// L'arbre de l'ODJ rempli : ce que l'ecran montre doit s'y retrouver EN ENTIER (REA-132).
// Le reproche fait au Word existant est exactement celui-la : les paragraphes libres et les
// saisies de seance n'y passaient pas. Chaque `it` ci-dessous garde une de ces pertes.

import { describe, expect, it } from "vitest";
import type { Odj } from "./odj";
import { formatEuros } from "./format-montant";
import { arbreOdj, estParagraphe, finReunionLisible, heureCloture, nomFichierOdjRempli } from "./odj-rendu";

function odjMinimal(): Odj {
  return {
    copro: { code: "S146", nom: "Les Marronniers", adresse: "12 rue des Lilas, 92250 La Garenne-Colombes" },
    agence: "LGC",
    dateAg: "16/11/2026",
    dateAgISO: "2026-11-16",
    enTete: [
      { id: "date-cs", libelle: "Conseil syndical du", source: "supabase", valeur: "05/10/2026" },
      { id: "presents-syndic", libelle: "Pour le syndic", source: "manuel", valeur: "KOMA Sekou" },
      { id: "presents-cs", libelle: "Pour le conseil syndical", source: "estale", valeur: "DURAND Paul" },
      { id: "date-ag", libelle: "AG fixée au", source: "supabase", valeur: "16/11/2026" },
      { id: "lieu", libelle: "Lieu", source: "supabase", valeur: "Salle Molière" },
      { id: "visio", libelle: "Visio", source: "manuel", type: "booleen", valeur: "oui" },
      { id: "limite-odj", libelle: "Limite", source: "jalon", valeur: "02/10/2026" },
      { id: "mise-sous-pli", libelle: "Mise sous pli", source: "jalon", valeur: "16/10/2026" },
    ],
    sections: [
      {
        id: "comptes",
        titre: "Vérification des comptes",
        champs: [
          { id: "comptes.budget", libelle: "Budget", source: "estale", type: "montant", valeur: "45000" },
          { id: "comptes.depenses-courantes", libelle: "Dépenses", source: "estale", type: "montant", valeur: "41200" },
        ],
      },
    ],
    pointsLegaux: [
      { id: "ppt", titre: "Projet de plan pluriannuel de travaux", texte: "Le PPT est soumis au vote.", applicable: true },
      { id: "dpe-collectif", titre: "DPE collectif", texte: "Le DPE est soumis au vote.", applicable: false },
    ],
  };
}

describe("arbreOdj", () => {
  it("reprend l'encadre reunion, dans l'ordre de l'ecran, avec la modalite en clair", () => {
    const a = arbreOdj(odjMinimal());
    expect(a.reunion.map((n) => (n.type === "ligne" ? [n.libelle, n.valeur] : n.type))).toEqual([
      ["Conseil syndical du", "05/10/2026"],
      ["Pour le syndic", "KOMA Sekou"],
      ["Pour le conseil syndical", "DURAND Paul"],
      ["Assemblée générale fixée au", "16/11/2026"],
      ["Lieu", "Salle Molière"],
      ["Modalité", "Présentiel et visio (hybride)"],
      ["Limite d'ajout de points à l'ODJ", "02/10/2026"],
      ["Mise sous pli de la convocation", "16/10/2026"],
    ]);
  });

  it("sans reponse visio, la modalite reste le presentiel (le cas general)", () => {
    const odj = odjMinimal();
    odj.enTete = odj.enTete.filter((c) => c.id !== "visio");
    const modalite = arbreOdj(odj).reunion.find((n) => n.type === "ligne" && n.libelle === "Modalité");
    expect(modalite).toMatchObject({ valeur: "Présentiel" });
  });

  it("formate les montants comme l'ecran et numerote les sections", () => {
    const a = arbreOdj(odjMinimal());
    expect(a.sections[0]).toMatchObject({ numero: 1, titre: "Vérification des comptes" });
    expect(a.sections[0]?.noeuds[0]).toEqual({
      type: "ligne",
      libelle: "Budget",
      valeur: formatEuros(45000),
      paragraphe: false,
    });
  });

  it("garde les PARAGRAPHES LIBRES d'une section, apres ses lignes", () => {
    const odj = odjMinimal();
    odj.sections[0]!.blocs = [{ id: "bloc.1", texte: "Le trop-perçu sera rendu avec l'appel du T1." }];
    const noeuds = arbreOdj(odj).sections[0]!.noeuds;
    expect(noeuds.at(-1)).toEqual({ type: "paragraphe", texte: "Le trop-perçu sera rendu avec l'appel du T1." });
  });

  it("garde les NOTES ANCREES juste sous leur ligne", () => {
    const odj = odjMinimal();
    odj.sections[0]!.champs[0]!.notes = [{ id: "note.comptes.budget.1", texte: "Budget voté en AG 2025." }];
    const noeuds = arbreOdj(odj).sections[0]!.noeuds;
    expect(noeuds[0]).toMatchObject({ type: "ligne", libelle: "Budget" });
    expect(noeuds[1]).toEqual({ type: "paragraphe", texte: "Budget voté en AG 2025." });
  });

  it("retire une ligne MASQUEE mais conserve la note qui y est ancree", () => {
    const odj = odjMinimal();
    odj.sections[0]!.champs[0]!.masque = true;
    odj.sections[0]!.champs[0]!.notes = [{ id: "note.comptes.budget.1", texte: "Voir annexe." }];
    const noeuds = arbreOdj(odj).sections[0]!.noeuds;
    expect(noeuds.some((n) => n.type === "ligne" && n.libelle === "Budget")).toBe(false);
    expect(noeuds[0]).toEqual({ type: "paragraphe", texte: "Voir annexe." });
  });

  it("garde les CHAMPS LIBRES et les LIBELLES REECRITS tels qu'ils sont a l'ecran", () => {
    const odj = odjMinimal();
    odj.sections[0]!.champs[1]!.libelle = "Dépenses réelles 2025";
    odj.sections[0]!.champs[1]!.libelleReecrit = true;
    odj.sections[0]!.champs.push({
      id: "libre.comptes.1759",
      libelle: "Régularisation eau",
      source: "manuel",
      libre: true,
      valeur: "À répartir sur les tantièmes d'eau froide.",
    });
    const noeuds = arbreOdj(odj).sections[0]!.noeuds;
    expect(noeuds[1]).toMatchObject({ libelle: "Dépenses réelles 2025" });
    // Un texte libre passe en PARAGRAPHE, comme a l'ecran (regle du 2026-09-01).
    expect(noeuds[2]).toEqual({
      type: "ligne",
      libelle: "Régularisation eau",
      valeur: "À répartir sur les tantièmes d'eau froide.",
      paragraphe: true,
    });
  });

  it("garde le TITRE DE SECTION reecrit", () => {
    const odj = odjMinimal();
    odj.sections[0]!.titre = "Comptes de l'exercice clos";
    odj.sections[0]!.titreReecrit = true;
    expect(arbreOdj(odj).sections[0]?.titre).toBe("Comptes de l'exercice clos");
  });

  it("ne retient que les points reglementaires RETENUS, en derniere section numerotee", () => {
    const a = arbreOdj(odjMinimal());
    const derniere = a.sections.at(-1)!;
    expect(derniere).toMatchObject({ numero: 2, titre: "Points réglementaires à l'ordre du jour" });
    expect(derniere.noeuds).toEqual([
      { type: "point", titre: "Projet de plan pluriannuel de travaux", texte: "Le PPT est soumis au vote." },
    ]);
  });

  it("garde les PARAGRAPHES de fin de document, et ignore ceux qui sont vides", () => {
    const odj = odjMinimal();
    odj.blocsLibres = [{ id: "bloc.1", texte: "Le CS valide l'ODJ." }, { id: "bloc.2", texte: "   " }];
    expect(arbreOdj(odj).blocsFin).toEqual(["Le CS valide l'ODJ."]);
  });

  it("porte les mentions legales de l'AGENCE et l'heure de fin", () => {
    const odj = odjMinimal();
    odj.finReunion = "20h30";
    const a = arbreOdj(odj);
    expect(a.finReunion).toBe("20h30");
    expect(a.mentions.length).toBeGreaterThan(0);
    expect(a.mentions.join(" ")).toContain("CPI 7801");
  });

  it("une valeur non renseignee reste un BLANC, jamais 'undefined'", () => {
    const odj = odjMinimal();
    delete odj.sections[0]!.champs[0]!.valeur;
    expect(arbreOdj(odj).sections[0]?.noeuds[0]).toMatchObject({ valeur: "", paragraphe: false });
  });
});

describe("finReunionLisible", () => {
  it("prefere la saisie a l'heure de cloture (clore le lendemain ecrivait une heure fausse)", () => {
    const odj = { ...odjMinimal(), finReunion: "20h30", cloture: { le: "2026-10-06T09:12:00.000Z", par: "SK" } };
    expect(finReunionLisible(odj)).toBe("20h30");
  });

  it("retombe sur l'heure de cloture, en heure de Paris", () => {
    const odj = { ...odjMinimal(), cloture: { le: "2026-10-05T18:45:00.000Z", par: "SK" } };
    expect(finReunionLisible(odj)).toBe("20h45");
  });

  it("rend undefined quand rien n'est connu", () => {
    expect(finReunionLisible(odjMinimal())).toBeUndefined();
  });

  it("ignore un horodatage illisible plutot que d'ecrire une date invalide", () => {
    expect(heureCloture("pas une date")).toBeUndefined();
  });
});

describe("estParagraphe", () => {
  it("passe un texte renseigne sous son libelle, garde les montants inline", () => {
    expect(estParagraphe({ type: "texte" }, "un texte")).toBe(true);
    expect(estParagraphe({}, "un texte")).toBe(true);
    expect(estParagraphe({ type: "montant" }, "45 000,00 €")).toBe(false);
    expect(estParagraphe({ type: "texte" }, "")).toBe(false);
  });
});

describe("nomFichierOdjRempli", () => {
  it("remet la date du CS en ISO pour que les fichiers se trient", () => {
    expect(nomFichierOdjRempli(odjMinimal())).toBe("ODJ rempli - S146 - 2026-10-05");
  });

  it("retombe sur la date d'AG sans date de CS, puis sur 'sans-date'", () => {
    const sansCs = odjMinimal();
    sansCs.enTete = sansCs.enTete.filter((c) => c.id !== "date-cs");
    expect(nomFichierOdjRempli(sansCs)).toBe("ODJ rempli - S146 - 2026-11-16");
    const sansRien = { ...sansCs };
    delete sansRien.dateAgISO;
    expect(nomFichierOdjRempli(sansRien)).toBe("ODJ rempli - S146 - sans-date");
  });
});
