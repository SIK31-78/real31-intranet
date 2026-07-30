// Contre-preuve par copropriétaire (etape 4, bug report cause 4). Le cas S0306 : 118
// attributions pour 118 lots MAIS 5 orphelins -- donc 5 lots a double proprietaire. Le total
// qui "tombe juste" masquait la double erreur ; c'est le controle PAR OWNER qui la localise.

import { describe, expect, it } from "vitest";
import {
  anomaliesAttributions,
  messageEcartOwner,
  verifierTotauxParOwner,
} from "@/lib/reprise/domain/contre-preuve-owners";
import type { Attribution, Owner, Tantieme } from "@/lib/reprise/domain/patrimoine";
import { detecterDoublons } from "@/lib/reprise/domain/dedup";

const owner = (id: string): Owner =>
  ({ id, civilite: "m", nom: "PSEUDO", pro: false }) as Owner;
const t = (lot: number, valeur: number): Tantieme => ({ cleCode: "001", lot, valeur });
const a = (ownerId: string, lot: number): Attribution => ({ ownerId, lot });

describe("verifierTotauxParOwner", () => {
  const base = {
    owners: [owner("o1"), owner("o2")],
    attributions: [a("o1", 1), a("o1", 2), a("o2", 3)],
    tantiemes: [t(1, 100), t(2, 53), t(3, 153)],
    cleGeneraleCode: "001",
  };

  it("ne signale rien quand chaque owner tombe sur son total imprime", () => {
    const r = verifierTotauxParOwner({
      ...base,
      totauxImprimes: [
        { ownerId: "o1", total: 153 },
        { ownerId: "o2", total: 153 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.nbControles).toBe(2);
    expect(r.nbNonControles).toBe(0);
  });

  it("LOCALISE l'owner en ecart, avec ses lots (au lieu d'un orphelin en fin de course)", () => {
    const r = verifierTotauxParOwner({
      ...base,
      totauxImprimes: [
        { ownerId: "o1", total: 153 }, // juste
        { ownerId: "o2", total: 306 }, // il devrait porter 2 lots, un numero est faux
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.ecarts).toHaveLength(1);
    const e = r.ecarts[0]!;
    expect(e.ownerId).toBe("o2");
    expect(e.calcule).toBe(153);
    expect(e.imprime).toBe(306);
    expect(e.ecart).toBe(-153);
    expect(e.lots).toEqual([3]);
    expect(messageEcartOwner(e)).toContain("de moins");
    expect(messageEcartOwner(e)).toContain("feuille de présence");
  });

  it("un owner SANS total imprime est NON CONTROLE, pas en erreur", () => {
    const r = verifierTotauxParOwner({ ...base, totauxImprimes: [{ ownerId: "o1", total: 153 }] });
    expect(r.ok).toBe(true);
    expect(r.nbControles).toBe(1);
    expect(r.nbNonControles).toBe(1);
  });

  it("ne compte que la cle GENERALE : une cle speciale ne faussse pas le total", () => {
    const r = verifierTotauxParOwner({
      ...base,
      tantiemes: [...base.tantiemes, { cleCode: "200", lot: 1, valeur: 9999 }],
      totauxImprimes: [{ ownerId: "o1", total: 153 }],
    });
    expect(r.ok).toBe(true);
  });

  it("ne manipule aucune PII : le message ne porte qu'un id interne et des nombres", () => {
    const r = verifierTotauxParOwner({
      ...base,
      totauxImprimes: [{ ownerId: "o2", total: 1 }],
    });
    const m = messageEcartOwner(r.ecarts[0]!);
    expect(m).toContain("o2");
    expect(m).not.toContain("PSEUDO");
  });
});

describe("anomaliesAttributions", () => {
  it("lit ENSEMBLE orphelins et doublons - le cas S0306", () => {
    // 3 lots, 3 attributions : le compte "tombe juste" alors que le lot 3 est orphelin et
    // le lot 1 attribue deux fois. C'est exactement ce qui produisait 5 orphelins avec 118
    // attributions pour 118 lots.
    const r = anomaliesAttributions({
      lots: [{ numero: 1 }, { numero: 2 }, { numero: 3 }],
      attributions: [a("o1", 1), a("o2", 1), a("o1", 2)],
    });
    expect(r.orphelins).toEqual([3]);
    expect(r.multiAttribues).toEqual([{ lot: 1, nb: 2 }]);
  });

  it("signale un numero de lot inexistant (le cas '204' mal transcrit)", () => {
    const r = anomaliesAttributions({
      lots: [{ numero: 1 }, { numero: 2 }],
      attributions: [a("o1", 1), a("o1", 2), a("o2", 204)],
    });
    expect(r.inconnus).toEqual([204]);
    expect(r.orphelins).toEqual([]);
  });

  it("ne signale rien sur un jeu sain", () => {
    const r = anomaliesAttributions({
      lots: [{ numero: 1 }, { numero: 2 }],
      attributions: [a("o1", 1), a("o2", 2)],
    });
    expect(r).toEqual({ orphelins: [], multiAttribues: [], inconnus: [] });
  });
});

// --- Etape 5 : elements distinctifs de la dedup (bug report cause 3) ---------------

describe("dedup : la civilite, l'adresse et les lots sont DISTINCTIFS", () => {
  const homonyme = (id: string, p: Partial<Owner> = {}): Owner =>
    ({ id, civilite: "mme", nom: "CAZALS", prenom: "Eglantine", pro: false, ...p }) as Owner;

  it("ne propose PLUS la fusion de deux homonymes a adresses differentes (cas GOUGE)", () => {
    const groupes = detecterDoublons([
      homonyme("o1", { adrVoie: "rue Franklin", adrVille: "Toulouse" }),
      homonyme("o2", { adrVoie: "rue Charles Laffitte", adrVille: "Colomiers" }),
    ]);
    expect(groupes).toHaveLength(1);
    expect(groupes[0]!.type).toBe("doublon_non_tranchable");
  });

  it("ne propose PLUS la fusion quand la civilite differe (cas REDISSI Mme / Mlle)", () => {
    const groupes = detecterDoublons([homonyme("o1"), homonyme("o2", { civilite: "m" })]);
    expect(groupes[0]!.type).toBe("doublon_non_tranchable");
  });

  it("ne propose PLUS la fusion quand les LOTS sont disjoints", () => {
    const lots = new Map([
      ["o1", new Set([50, 112, 122])],
      ["o2", new Set([3, 55, 120])],
    ]);
    const groupes = detecterDoublons([homonyme("o1"), homonyme("o2")], lots);
    expect(groupes[0]!.type).toBe("doublon_non_tranchable");
  });

  it("propose ENCORE la fusion d'un vrai doublon (VIDAL n°1 / n°2, memes lots)", () => {
    // Le cas legitime ne doit pas etre casse : meme personne dedoublee par l'ancien syndic.
    const lots = new Map([
      ["o1", new Set([7])],
      ["o2", new Set([7])],
    ]);
    const groupes = detecterDoublons([homonyme("o1"), homonyme("o2")], lots);
    expect(groupes[0]!.type).toBe("fusion_proposee");
  });

  it("sans lots fournis, le critere est inactif (aucun appelant degrade)", () => {
    const groupes = detecterDoublons([homonyme("o1"), homonyme("o2")]);
    expect(groupes[0]!.type).toBe("fusion_proposee");
  });
});
