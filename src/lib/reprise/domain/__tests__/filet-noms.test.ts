// Filet sur les noms (etape 7). Le seul controle qui attrape une coquille de transcription :
// aucune arithmetique ne detecte VENDRAMBILI pour VENDRAMELLI, puisqu'aucun chiffre ne change.
// Les paires de test viennent de la fixture S0306 (contre-preuves.json).

import { describe, expect, it } from "vitest";
import {
  detecterCoquilles,
  distanceDamerau,
  DISTANCE_MAX_COQUILLE,
} from "@/lib/reprise/domain/filet-noms";

describe("distanceDamerau", () => {
  it("compte une TRANSPOSITION pour 1, pas 2 (sinon le filet raterait sa cible)", () => {
    // Les coquilles reelles sont surtout des inversions de lettres adjacentes. Avec une
    // Levenshtein simple, "LACSOTI" serait a distance 3 de "LACOSTE" et sortirait du seuil.
    expect(distanceDamerau("LACOSTE", "LACSOTE")).toBe(1);
    expect(distanceDamerau("TOURNIER", "TOURNEIR")).toBe(1);
  });

  it("est insensible a la casse, aux accents et a la ponctuation", () => {
    expect(distanceDamerau("D'ORNANO", "dornano")).toBe(0);
    expect(distanceDamerau("BESSIÈRE", "BESSIERE")).toBe(0);
  });

  it("garde les paires de la fixture sous le seuil", () => {
    for (const [vrai, corrompu] of [
      ["ABADIE", "ABAIDI"],
      ["TOURNIER", "TOUNRIEI"],
      ["LACOSTE", "LACSOTI"],
      ["IZARD", "IZARI"],
      ["BESSIERE", "BESISERI"],
    ]) {
      expect(distanceDamerau(vrai!, corrompu!)).toBeLessThanOrEqual(DISTANCE_MAX_COQUILLE);
    }
  });

  it("ne rapproche pas deux patronymes reellement differents", () => {
    expect(distanceDamerau("MARTIN", "BERNARD")).toBeGreaterThan(DISTANCE_MAX_COQUILLE);
  });
});

describe("detecterCoquilles", () => {
  it("demontre la coquille par la CONCORDANCE des tantiemes", () => {
    const c = detecterCoquilles({
      reference: [{ nom: "VENDRAMELLI", prenom: "Loic", tantiemes: 153 }],
      confrontee: [{ nom: "VENDRAMBILI", prenom: "Loic", tantiemes: 153 }],
    });
    expect(c).toHaveLength(1);
    expect(c[0]!.nomReference).toBe("VENDRAMELLI");
    expect(c[0]!.nomDivergent).toBe("VENDRAMBILI");
    expect(c[0]!.tantiemes).toBe(153);
    expect(c[0]!.message).toContain("coquille de transcription");
    expect(c[0]!.message).toContain("153");
  });

  it("ne dit rien quand les deux sources s'accordent", () => {
    expect(
      detecterCoquilles({
        reference: [{ nom: "TOURNIER", tantiemes: 2459 }],
        confrontee: [{ nom: "TOURNIER", tantiemes: 2459 }],
      }),
    ).toHaveLength(0);
  });

  it("ECARTE un total ambigu : deux personnes au meme total ne prouvent rien", () => {
    // 153 tantiemes est le total le plus courant (un lot standard) : apparier dessus
    // fabriquerait de fausses coquilles.
    const c = detecterCoquilles({
      reference: [
        { nom: "DUPONT", tantiemes: 153 },
        { nom: "DURAND", tantiemes: 153 },
      ],
      confrontee: [{ nom: "DUPOND", tantiemes: 153 }],
    });
    expect(c).toHaveLength(0);
  });

  it("distingue les deux REDISSI par leurs totaux DISTINCTS (1998 / 2459)", () => {
    // Le cas qui a fait perdre un owner : deux homonymes stricts. Leurs totaux differents
    // permettent un appariement non ambigu, et aucune coquille n'est signalee a tort.
    const c = detecterCoquilles({
      reference: [
        { nom: "TOURNIER", prenom: "Delphine", tantiemes: 1998 },
        { nom: "TOURNIER", prenom: "Delphine", tantiemes: 2459 },
      ],
      confrontee: [
        { nom: "TOURNIER", prenom: "Delphine", tantiemes: 1998 },
        { nom: "TOUNRIEI", prenom: "Delphine", tantiemes: 2459 },
      ],
    });
    expect(c).toHaveLength(1);
    expect(c[0]!.tantiemes).toBe(2459);
    expect(c[0]!.nomDivergent).toBe("TOUNRIEI");
  });

  it("ignore une personne absente de l'autre source (elle n'a pas vote)", () => {
    const c = detecterCoquilles({
      reference: [{ nom: "MARTIN", tantiemes: 500 }],
      confrontee: [],
    });
    expect(c).toHaveLength(0);
  });

  it("n'assimile pas deux patronymes trop eloignes malgre un total identique", () => {
    // Deux personnes differentes peuvent avoir le meme total : la distance tranche.
    const c = detecterCoquilles({
      reference: [{ nom: "MARTIN", tantiemes: 777 }],
      confrontee: [{ nom: "BERNARD", tantiemes: 777 }],
    });
    expect(c).toHaveLength(0);
  });
});
