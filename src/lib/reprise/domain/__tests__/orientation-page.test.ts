// Assertion d'orientation + decision OSD.
//
// RECALIBRE LE 30/07 SUR LA CHAINE REELLE. La premiere version bloquait sur trois signaux
// calibres a la main (93 de confiance pour une page droite, 58 pour une renversee). Confrontes
// aux vrais rendus pdfjs + tesseract.js du lot S0306, DEUX de ces trois signaux refusaient des
// pages parfaitement saines. Les valeurs de ces tests sont desormais MESUREES :
//
//   RCP 2 p30, /Rotate 180 honore    BONNE      conf 47,3   long. 1,67   60 numeriques
//   CONVOC p15, /Rotate 90 honore    BONNE      conf 16,5   long. 2,52    0 numerique
//   Feuille de presence p1           BONNE      conf 72,1
//   rgd p1                           BONNE      conf 91,9
//   RCP 2 p30, metadonnee perdue     MAUVAISE   conf 35,9   long. 1,71   34 numeriques

import { describe, expect, it } from "vitest";
import {
  decisionOsd,
  SEUIL_CONFIANCE_OSD,
  SEUIL_CONFIANCE_PAGE,
  verifierOrientationPage,
  type TokenOcr,
} from "@/lib/reprise/domain/orientation-page";

const tok = (texte: string, confiance = 93): TokenOcr => ({ texte, confiance });

/** Page redressee : en-tete lisible + colonne de "56", a la confiance MESUREE. */
const PAGE_REDRESSEE: TokenOcr[] = [
  tok("TABLEAU"), tok("DE"), tok("REPARTITION"), tok("DES"), tok("CHARGES"), tok("D'ASCENSEUR"),
  ...Array.from({ length: 40 }, () => tok("56", 47.3)),
];

/** Meme page a l'envers : miroir de l'en-tete, a la confiance MESUREE. */
const PAGE_ENVERS: TokenOcr[] = [
  tok("TIALYAV.L", 35.9), tok("dd", 35.9), tok("LibaVdda", 35.9), tok("SAC", 35.9), tok("SAOUVHO", 35.9),
  ...Array.from({ length: 40 }, () => tok("9S", 35.9)),
];

describe("verifierOrientationPage - l'ANCRE est le seul signal bloquant", () => {
  it("accepte la page redressee", () => {
    const r = verifierOrientationPage({
      tokens: PAGE_REDRESSEE,
      ancresAttendues: ["TABLEAU", "REPARTITION"],
      tableauAttendu: true,
    });
    expect(r.verdict).toBe("vraisemblable");
    expect(r.ancresTrouvees).toEqual(["TABLEAU", "REPARTITION"]);
  });

  it("REFUSE la page a l'envers, et le message ne suppose pas 180", () => {
    const r = verifierOrientationPage({
      tokens: PAGE_ENVERS,
      ancresAttendues: ["TABLEAU", "REPARTITION"],
      tableauAttendu: true,
    });
    expect(r.verdict).toBe("suspecte");
    expect(r.ancresTrouvees).toEqual([]);
    expect(r.raison).toContain("MAL ORIENTEE");
    expect(r.raison).toContain("/Rotate");
    expect(r.raison).toContain("90"); // la convocation porte des pages a 90 degres
  });

  it("l'ancre prime sur une confiance ELEVEE : un moteur peut etre sur de lire du miroir", () => {
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
  });
});

describe("verifierOrientationPage - les signaux invalides par la mesure ne refusent plus", () => {
  it("une bonne page a 47,3 de confiance passe (l'ancien seuil de 75 la refusait)", () => {
    const tokens = Array.from({ length: 60 }, (_, i) => tok(i % 2 === 0 ? "56" : "lot", 47.3));
    expect(verifierOrientationPage({ tokens, tableauAttendu: true }).verdict).toBe("vraisemblable");
  });

  it("une bonne page pauvre a 16,5 de confiance passe (CONVOC p15)", () => {
    const tokens = Array.from({ length: 21 }, () => tok("Article", 16.5));
    expect(verifierOrientationPage({ tokens }).verdict).toBe("vraisemblable");
  });

  it("une bonne page SANS aucun numerique passe (CONVOC p15 en a zero)", () => {
    const tokens = Array.from({ length: 21 }, () => tok("Article", 16.5));
    const r = verifierOrientationPage({ tokens, tableauAttendu: true });
    expect(r.nbNumeriques).toBe(0);
    expect(r.verdict).toBe("vraisemblable");
  });

  it("une bonne page de tableau a des tokens TRES courts : ce n'est pas un signe de rotation", () => {
    // Longueur moyenne mesuree : 1,67 sur une page SAINE. L'ancien signal "fragments -> 90
    // degres" la refusait ; c'est simplement une colonne de nombres a deux chiffres.
    const tokens = Array.from({ length: 60 }, () => tok("56", 47.3));
    expect(verifierOrientationPage({ tokens }).verdict).toBe("vraisemblable");
  });

  it("sans ancre, la confiance ne separe PAS le bon du mauvais (47,3 contre 35,9)", () => {
    // Le constat le plus dur du recalibrage : sur la MEME page, les deux versions sont
    // indiscernables par la confiance seule. C'est l'ancre, ou rien -- et on l'assume.
    expect(verifierOrientationPage({ tokens: PAGE_REDRESSEE }).verdict).toBe("vraisemblable");
    expect(verifierOrientationPage({ tokens: PAGE_ENVERS }).verdict).toBe("vraisemblable");
  });
});

describe("verifierOrientationPage - garde-fous du garde-fou", () => {
  it("ne conclut RIEN sur une page trop pauvre (verso blanc, page de garde)", () => {
    const r = verifierOrientationPage({
      tokens: [tok("2", 40), tok("-", 30)],
      ancresAttendues: ["TABLEAU"],
      tableauAttendu: true,
    });
    expect(r.verdict).toBe("vraisemblable");
    expect(r.raison).toBe("");
  });

  it("garde un plancher d'ILLISIBILITE, distinct d'un diagnostic d'orientation", () => {
    const tokens = Array.from({ length: 30 }, () => tok("~", 4));
    const r = verifierOrientationPage({ tokens });
    expect(r.verdict).toBe("suspecte");
    expect(r.raison).toContain("quasi illisible");
    expect(r.raison).not.toContain("MAL ORIENTEE");
  });

  it("le plancher est SOUS les pages saines les plus mediocres (16,5)", () => {
    expect(SEUIL_CONFIANCE_PAGE).toBeLessThan(16.5);
  });
});

describe("decisionOsd - l'OSD ne se croit pas sur parole", () => {
  it("redresse quand l'angle est fiable (cas mesures RCP 2 et CONVOC)", () => {
    expect(decisionOsd(180, 11.5)).toEqual({ action: "redresser", angle: 180 });
    expect(decisionOsd(90, 15.1)).toEqual({ action: "redresser", angle: 90 });
  });

  it("ne touche a rien quand l'OSD dit 0 avec assez de confiance", () => {
    expect(decisionOsd(0, 11.2)).toEqual({ action: "laisser", angle: 0 });
    expect(decisionOsd(0, 5.02)).toEqual({ action: "laisser", angle: 0 });
  });

  it("NON-REGRESSION du faux positif : RCP.pdf p1, OSD 180 a confiance 0,04", () => {
    // Sans seuil, un correcteur automatique retournerait de 180 degres la premiere page du
    // RCP, qui est DROITE (couverture notariee avec une mention manuscrite verticale).
    const d = decisionOsd(180, 0.04);
    expect(d.action).toBe("arbitrage_humain");
    expect(d.angle).toBe(180);
    if (d.action === "arbitrage_humain") {
      expect(d.raison).toContain("ORIENTATIONS MIXTES");
      expect(d.raison).toContain("manuscrite");
    }
  });

  it("le seuil se situe SOUS le plancher des verdicts justes mesures (5,02)", () => {
    expect(SEUIL_CONFIANCE_OSD).toBeLessThan(5.02);
    expect(SEUIL_CONFIANCE_OSD).toBeGreaterThan(0.04);
  });

  it("normalise un angle hors des quatre quadrants plutot que de le propager", () => {
    expect(decisionOsd(359, 10).angle).toBe(0);
    expect(decisionOsd(-90, 10).angle).toBe(270);
  });
});
