// Assertion d'orientation (30/07). Ne teste pas un moteur : teste que le HARNAIS refuse une
// page dont la lecture est invraisemblable, au lieu de rendre un chiffre qui ne mesure rien.
//
// Cas de reference : RCP 2.pdf p. 30 de S0306, /Rotate 180 sur 36 pages sur 36. Redressee,
// la page rend 40 cellules "56" a 300 dpi et une confiance de 93,2 ; a l'envers, ZERO cellule
// et une confiance de 58,0 -- et "TABLEAU" y est lu "TIALYAV.L".

import { describe, expect, it } from "vitest";
import {
  SEUIL_CONFIANCE_PAGE,
  verifierOrientationPage,
  type TokenOcr,
} from "@/lib/reprise/domain/orientation-page";

const tok = (texte: string, confiance = 93): TokenOcr => ({ texte, confiance });

/** Page redressee : l'en-tete lisible + une colonne de "56" a bonne confiance. */
const PAGE_REDRESSEE: TokenOcr[] = [
  tok("TABLEAU"), tok("DE"), tok("REPARTITION"), tok("DES"), tok("CHARGES"), tok("D'ASCENSEUR"),
  ...Array.from({ length: 40 }, () => tok("56", 93.2)),
];

/** Meme page a l'envers : miroir de l'en-tete, aucun numerique, confiance effondree. */
const PAGE_ENVERS: TokenOcr[] = [
  tok("TIALYAV.L", 58), tok("dd", 58), tok("LibaVdda", 58), tok("SAC", 58), tok("SAOUVHO", 58),
  ...Array.from({ length: 40 }, () => tok("9S", 58)),
];

describe("verifierOrientationPage", () => {
  it("accepte la page redressee", () => {
    const r = verifierOrientationPage({
      tokens: PAGE_REDRESSEE,
      ancresAttendues: ["TABLEAU", "REPARTITION"],
      tableauAttendu: true,
    });
    expect(r.verdict).toBe("vraisemblable");
    expect(r.raison).toBe("");
    expect(r.nbNumeriques).toBe(40);
    expect(r.ancresTrouvees).toEqual(["TABLEAU", "REPARTITION"]);
  });

  it("REFUSE la page a l'envers et designe l'orientation comme premiere hypothese", () => {
    const r = verifierOrientationPage({
      tokens: PAGE_ENVERS,
      ancresAttendues: ["TABLEAU", "REPARTITION"],
      tableauAttendu: true,
    });
    expect(r.verdict).toBe("suspecte");
    expect(r.ancresTrouvees).toEqual([]);
    expect(r.raison).toContain("à l'envers");
    expect(r.raison).toContain("/Rotate");
  });

  it("attrape l'envers par l'ABSENCE de numerique, meme sans ancre fournie", () => {
    // C'est le symptome exact mesure : 0 cellule "56" sur 50 attendues.
    const r = verifierOrientationPage({ tokens: PAGE_ENVERS, tableauAttendu: true });
    expect(r.verdict).toBe("suspecte");
    expect(r.raison).toContain("Aucune valeur numérique");
    expect(r.raison).toContain("« 9S »");
  });

  it("attrape l'envers par la CONFIANCE seule, dernier filet", () => {
    // Ni ancre ni tableau declare : il reste l'effondrement de 93 a 58.
    const r = verifierOrientationPage({ tokens: PAGE_ENVERS });
    expect(r.verdict).toBe("suspecte");
    expect(r.confianceMoyenne).toBeLessThan(SEUIL_CONFIANCE_PAGE);
    expect(r.raison).toContain("orientation");
  });

  it("ne refuse PAS une page de texte sans chiffres quand aucun tableau n'est attendu", () => {
    // Un article de reglement n'a pas a contenir des nombres : refuser la ferait redemander
    // des pieces sans raison.
    const texte = "L'article XVII du reglement de copropriete prevoit la repartition des charges relatives aux ascenseurs entre les proprietaires des lots desservis".split(" ").map((m) => tok(m));
    const r = verifierOrientationPage({ tokens: texte });
    expect(r.verdict).toBe("vraisemblable");
  });

  it("ne conclut RIEN sur une page trop pauvre (verso blanc, page de garde)", () => {
    const r = verifierOrientationPage({
      tokens: [tok("2", 40), tok("-", 30)],
      ancresAttendues: ["TABLEAU"],
      tableauAttendu: true,
    });
    expect(r.verdict).toBe("vraisemblable"); // pas de refus sur du vide
    expect(r.raison).toBe("");
  });

  it("tolere un scan legitimement mediocre mais lisible (le seuil n'est pas serre)", () => {
    // 80 de confiance moyenne : mediocre mais au-dessus du seuil, et les ancres sont la.
    const r = verifierOrientationPage({
      tokens: [
        ...["TABLEAU", "DE", "REPARTITION", "DES", "CHARGES"].map((m) => tok(m, 80)),
        ...Array.from({ length: 20 }, () => tok("56", 80)),
      ],
      ancresAttendues: ["TABLEAU"],
      tableauAttendu: true,
    });
    expect(r.verdict).toBe("vraisemblable");
  });

  it("l'ancre prime sur la confiance : lecture sure mais page miroir", () => {
    // Un moteur peut etre CONFIANT sur du miroir. L'ancre absente tranche quand meme.
    const r = verifierOrientationPage({
      tokens: [
        ...["TIALYAV.L", "dd", "LibaVdda"].map((m) => tok(m, 95)),
        ...Array.from({ length: 20 }, () => tok("9S", 95)),
      ],
      ancresAttendues: ["TABLEAU"],
      tableauAttendu: true,
    });
    expect(r.verdict).toBe("suspecte");
    expect(r.confianceMoyenne).toBeGreaterThan(SEUIL_CONFIANCE_PAGE);
    expect(r.raison).toContain("Aucun des mots attendus");
  });
});
