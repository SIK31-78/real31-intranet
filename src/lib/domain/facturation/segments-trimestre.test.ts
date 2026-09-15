// C (Sekou, 15/09/2026) : la gestion courante facture le contrat en vigueur PENDANT le
// trimestre, au prorata des jours quand le tarif change en cours de route.
// Cas de reference : ancien contrat 6 000 TTC, nouveau 6 400 TTC vote pour le 01/07/2026.

import { describe, expect, it } from "vitest";
import { attenduTrimestre, segmentsTrimestre, type CycleTarif } from "./filet-gestion-courante";
import { htDepuisTtc } from "./commun";

const ANCIEN: CycleTarif = { debutISO: "2025-07-01", honorairesAnnuelsTtc: 6000, forfaitPostauxAnnuel: 400, fraisPostauxReels: false };
const NOUVEAU: CycleTarif = { debutISO: "2026-07-01", honorairesAnnuelsTtc: 6400, forfaitPostauxAnnuel: 400, fraisPostauxReels: false };

describe("segmentsTrimestre", () => {
  it("T2 facture en retard (le 3 juillet) reste a l'ancien tarif : le nouveau cycle n'y est pas en vigueur", () => {
    const s = segmentsTrimestre([ANCIEN, NOUVEAU], "2026-T2");
    expect(s).toHaveLength(1);
    expect(s[0]!.cycle).toBe(ANCIEN);
    expect(s[0]!.honorairesHt).toBeCloseTo(htDepuisTtc(1500), 6);
  });

  it("T3 facture en avance (le 28 juin) est au nouveau tarif : c'est lui qui couvre juillet-septembre", () => {
    const s = segmentsTrimestre([ANCIEN, NOUVEAU], "2026-T3");
    expect(s).toHaveLength(1);
    expect(s[0]!.cycle).toBe(NOUVEAU);
    expect(s[0]!.honorairesHt).toBeCloseTo(htDepuisTtc(1600), 6);
  });

  it("RIVIERE5 : cycle qui demarre le 24/04 -> T2 en deux segments au prorata des jours", () => {
    const nouveau = { ...NOUVEAU, debutISO: "2026-04-24" };
    const s = segmentsTrimestre([ANCIEN, nouveau], "2026-T2");
    expect(s.map((x) => [x.debut, x.fin, x.jours])).toEqual([
      ["2026-04-01", "2026-04-23", 23],
      ["2026-04-24", "2026-06-30", 68],
    ]);
    // 1 500 x 23/91 + 1 600 x 68/91 (en TTC) = 1 574,73
    const ttc = s.reduce((t, x) => t + x.honorairesHt * 1.2, 0);
    expect(ttc).toBeCloseTo((1500 * 23 + 1600 * 68) / 91, 2);
  });

  it("le dernier cycle court sans fin : un renouvellement pas encore enregistre facture au dernier tarif connu", () => {
    // Un seul cycle, commence en 2025, sans successeur : T4 2026 lui est du en entier.
    const s = segmentsTrimestre([ANCIEN], "2026-T4");
    expect(s).toHaveLength(1);
    expect(s[0]!.jours).toBe(92);
  });

  it("se combine avec la prise en gestion : les segments demarrent a cette date", () => {
    const nouveau = { ...NOUVEAU, debutISO: "2026-05-15" };
    const s = segmentsTrimestre([ANCIEN, nouveau], "2026-T2", "2026-04-11");
    expect(s.map((x) => [x.debut, x.fin])).toEqual([
      ["2026-04-11", "2026-05-14"],
      ["2026-05-15", "2026-06-30"],
    ]);
  });

  it("rien n'est du avant le premier cycle, ni apres une prise en gestion posterieure au trimestre", () => {
    expect(segmentsTrimestre([NOUVEAU], "2026-T1")).toEqual([]);
    expect(segmentsTrimestre([ANCIEN], "2026-T2", "2026-08-01")).toEqual([]);
  });

  it("les frais postaux reels n'ont pas de timbres, meme sur un segment", () => {
    const reel = { ...NOUVEAU, fraisPostauxReels: true };
    const s = segmentsTrimestre([reel], "2026-T3");
    expect(s[0]!.timbres).toBe(0);
  });
});

describe("attenduTrimestre avec cycles", () => {
  const base = { honorairesAnnuelsTtc: 6000, forfaitPostauxAnnuel: 400, fraisPostauxReels: false };

  it("un seul cycle en vigueur = exactement la regle d'origine", () => {
    const sans = attenduTrimestre(base, "2026-T2");
    const avec = attenduTrimestre({ ...base, cycles: [ANCIEN] }, "2026-T2");
    expect(avec.honorairesHt).toBeCloseTo(sans.honorairesHt, 9);
    expect(avec.timbres).toBeCloseTo(sans.timbres, 9);
    expect(avec.totalPleinHt).toBeCloseTo(sans.totalPleinHt, 9);
    expect(avec.segments).toBeUndefined();
  });

  it("un seul cycle + prise en gestion en cours de trimestre = le prorata d'origine", () => {
    const sans = attenduTrimestre({ ...base, priseEnGestion: "2026-04-11" }, "2026-T2");
    const avec = attenduTrimestre({ ...base, priseEnGestion: "2026-04-11", cycles: [ANCIEN] }, "2026-T2");
    expect(avec.totalHt).toBeCloseTo(sans.totalHt, 9);
    expect(avec.prorata).toEqual(sans.prorata);
  });

  it("deux cycles sur le trimestre : segments exposes, total compose, plein = trimestre entier aux deux tarifs", () => {
    const nouveau = { ...NOUVEAU, debutISO: "2026-04-24" };
    const a = attenduTrimestre({ ...base, cycles: [ANCIEN, nouveau] }, "2026-T2");
    expect(a.segments).toHaveLength(2);
    expect(a.totalHt).toBeCloseTo(a.totalPleinHt, 9);
    expect(a.honorairesHt * 1.2).toBeCloseTo((1500 * 23 + 1600 * 68) / 91, 2);
  });
});
