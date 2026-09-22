// Test d'INTEGRATION : le gabarit du repo se rend vraiment (balises toutes connues,
// sections conditionnelles retirees). Il lit le .docx par chemin, comme en production.
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import type { DonneesOdjCsDocx } from "@/lib/domain/odj-docx";
import { DocxtemplaterOdjCsRenderer } from "./odj-cs-docx-renderer";

const DONNEES: DonneesOdjCsDocx = {
  adresse: "31 rue de l'Estale, 92250 La Garenne-Colombes",
  dateCs: "05/10/2026",
  heureCs: "18h30",
  equipeSyndic: "KOMA Sekou",
  dateAg: "19/11/2026",
  heureAg: "19h00",
  lieuAg: "Salle Molière",
  modeAg: "présentiel",
  dateLimitePoints: "09/10/2026",
  dateMiseSousPli: "19/10/2026",
  depenses: "41 200,00 €",
  budget: "45 000,00 €",
  ecartLibelle: "un trop-perçu",
  ecart: "3 800,00 €",
  travauxIntitule: "Ravalement",
  travauxBudget: "120 000,00 €",
  travauxDepenses: "98 000,00 €",
  debiteurs: "MARTIN 1 200,00 €",
  fondsTravaux: "8 000,00 €",
  exercicePrecedent: "2025",
  gazDebut: "01/01/2025",
  gazFin: "31/12/2026",
  gazPrix: "",
  elecDebut: "",
  elecFin: "",
  elecPrix: "",
  anneeBudget: "2027",
  budgetPropose: "46 500,00",
  contratSyndicActuel: "4 800,00 €",
  membresCs: "DURAND Paul (président)",
  ppt: true,
  dpe: false,
  irve: false,
  velo: false,
  stationnement: false,
  agHybride: true,
  locationTouristique: true,
};

function texteDu(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")!.asText();
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("DocxtemplaterOdjCsRenderer", () => {
  it("rend le gabarit du cabinet avec les valeurs et sans balise résiduelle", async () => {
    const docx = await new DocxtemplaterOdjCsRenderer().rendre(DONNEES);
    const texte = texteDu(docx);
    expect(texte).toContain("Conseil syndical du 05/10/2026");
    expect(texte).toContain("Début de CS à 18h30");
    expect(texte).toContain("19/11/2026");
    expect(texte).toContain("19h00");
    expect(texte).toContain("un trop-perçu");
    expect(texte).toContain("3 800,00 €");
    expect(texte).toContain("Budget pour 2027");
    expect(texte).not.toMatch(/\{[#/]?\w+\}/);
  });

  it("retire les sections légales non applicables et garde les autres", async () => {
    const texte = texteDu(await new DocxtemplaterOdjCsRenderer().rendre(DONNEES));
    expect(texte).toContain("PPT");
    expect(texte).toContain("AG en hybride");
    expect(texte).not.toContain("DPE Collectif");
    expect(texte).not.toContain("IRVE");
    expect(texte).not.toContain("Local vélo");
    expect(texte).not.toContain("Les 2 points suivants concernent");
  });

  it("une valeur vide rend un blanc (le libellé reste)", async () => {
    const texte = texteDu(await new DocxtemplaterOdjCsRenderer().rendre({ ...DONNEES, lieuAg: "", debiteurs: "" }));
    expect(texte).toContain("adresse suivante");
    expect(texte).not.toContain("undefined");
  });
});

describe("archive OOXML", () => {
  it("aucune entrée de dossier, [Content_Types].xml en tête, mêmes entrées que le gabarit (Word refuse sinon)", async () => {
    const docx = await new DocxtemplaterOdjCsRenderer().rendre(DONNEES);
    const z = new PizZip(docx);
    const noms = Object.keys(z.files);
    expect(noms.filter((n) => z.files[n]!.dir)).toEqual([]);
    expect(noms[0]).toBe("[Content_Types].xml");
    expect(noms).toHaveLength(37);
  });
});
