// L'arbre de rendu du contrat : ce que l'ecran et le PDF dessinent. Retour du test du
// 17/09/2026 : « le pdf est mal genere notamment au niveau des tableaux ».

import { describe, expect, it } from "vitest";
import { assemblerChampsContrat, PRESTATIONS_CONTRAT, type CoproContrat, type PrestationContrat } from "./champs-contrat";
import { htmlContrat } from "./html-contrat";
import { arbreContrat, estMontant, estTitre, type NoeudContrat } from "./rendu-contrat";

const COPRO: CoproContrat = {
  code: "S215",
  nom: "BLEUETS4",
  adresse1: "4 rue des Bleuets",
  adresse2: "",
  adresse3: "",
  codePostal: "92250",
  ville: "LA GARENNE-COLOMBES",
  immatriculation: "AI2016400",
  assurance: "AXA",
  assuranceDateISO: "2023-06-27",
  agence: "LGC",
  lotsPrincipaux: 18,
  lotsAutres: 18,
  nbVisites: 1,
  dureeAgHeures: 2,
  nbCs: 1,
  dureeCsHeures: 1,
  finMaxAgHeure: 22,
};

function champs(conditionsParticulieres?: string) {
  const tarifs = {} as Record<PrestationContrat, { libelle: string; ttc: number }>;
  for (const p of PRESTATIONS_CONTRAT) tarifs[p] = { libelle: p, ttc: 120 };
  return assemblerChampsContrat(
    COPRO,
    { dateAgISO: "2026-10-22", debutISO: "2026-07-01", finISO: "2027-06-30", honorairesGestionTtc: 9419, forfaitPostauxTtc: 792 },
    tarifs,
    conditionsParticulieres,
  );
}

const tableaux = (noeuds: NoeudContrat[]) => noeuds.filter((n) => n.type === "tableau");
const titres = (noeuds: NoeudContrat[]) => noeuds.filter((n) => n.type === "titre").map((n) => n.texte);

describe("estTitre", () => {
  it("reconnait les titres numerotes, meme longs ou sur deux lignes", () => {
    expect(estTitre("2. DUREE DU CONTRAT")).toBe(true);
    expect(estTitre("7.1.3. Prestations optionnelles qui peuvent être incluses dans le forfait sur décision des parties")).toBe(true);
    expect(estTitre("7.2.2. Prestations relatives aux réunions et visites supplémentaires \n(au-delà du contenu du forfait stipulé aux 7.1.1 et 7.1.3)")).toBe(true);
  });
  it("laisse en paragraphe un alinea qui commence par un numero", () => {
    expect(estTitre("8.4 Préparation, convocation et tenue d’une assemblée générale à la demande d’un ou plusieurs copropriétaires, pour des questions concernant leurs droits ou obligations (art. 17-1 AA de la loi du 10 juillet 1965)")).toBe(false);
    expect(estTitre("Le présent contrat est conclu pour une durée de 1 an.")).toBe(false);
  });
});

describe("estMontant", () => {
  it("reconnait un montant nu, pas une phrase tarifaire", () => {
    expect(estMontant("163.65")).toBe(true);
    expect(estMontant("1 234,00 €")).toBe(true);
    expect(estMontant("34.00 € HT soit 40.80 € TTC par lot principal")).toBe(false);
  });
});

describe("arbreContrat", () => {
  const a = arbreContrat(champs());

  it("rend les grilles tarifaires en vrais tableaux aux colonnes constantes", () => {
    const tous = [...tableaux(a.gauche), ...tableaux(a.droite)];
    expect(tous.length).toBeGreaterThan(5);
    for (const t of tous) {
      expect(t.type === "tableau" && t.lignes.every((l) => l.cellules.length === t.colonnes)).toBe(true);
    }
  });

  it("ouvre un nouveau tableau a chaque en-tete « DETAIL DE LA PRESTATION », meme au milieu d'une grille", () => {
    const tous = [...tableaux(a.gauche), ...tableaux(a.droite)];
    for (const t of tous) {
      if (t.type !== "tableau") continue;
      const enTetes = t.lignes.map((l, i) => (l.enTete ? i : -1)).filter((i) => i >= 0);
      expect(enTetes.every((i) => i === 0)).toBe(true);
    }
  });

  it("voit l'en-tete « MODALITE DE TARIFICATION\\nconvenues » comme un en-tete", () => {
    const avecEnTete = [...tableaux(a.gauche), ...tableaux(a.droite)].filter((t) => t.type === "tableau" && t.lignes[0]?.enTete);
    expect(avecEnTete.length).toBeGreaterThan(5);
  });

  it("numerote les sections en titres", () => {
    expect(titres(a.gauche)).toContain("7.1.5. Modalités de rémunération");
    expect(titres(a.gauche).some((t) => t.startsWith("7.1.3. Prestations optionnelles"))).toBe(true);
  });

  it("ajoute les conditions particulieres en fin de colonne droite, seulement si renseignees", () => {
    expect(titres(a.droite)).not.toContain("CONDITIONS PARTICULIÈRES");
    const b = arbreContrat(champs("Première année à -10 %."));
    const fin = b.droite.slice(-2);
    expect(fin[0]).toEqual({ type: "titre", texte: "CONDITIONS PARTICULIÈRES" });
    expect(fin[1]).toEqual({ type: "paragraphe", texte: "Première année à -10 %." });
  });
});

describe("htmlContrat", () => {
  it("echappe ce qui vient de la fiche", () => {
    const html = htmlContrat(champs("<script>alert(1)</script> & co"));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co");
  });
  it("porte la regle @page A4, des <thead> et le logo quand on le donne", () => {
    const html = htmlContrat(champs(), "data:image/png;base64,AAAA");
    expect(html).toContain("@page { size: A4;");
    expect(html).toContain("<thead>");
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).toContain("4 rue des Bleuets");
  });
});
