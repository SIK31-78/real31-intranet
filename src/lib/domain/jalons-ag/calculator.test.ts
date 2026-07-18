import { describe, it, expect } from "vitest";
import { calculerJalons } from "./calculator";
import { joursFeries } from "./jours-feries";
import type { JalonCode } from "./types";

function joursEntre(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split("-").map(Number);
  const [by, bm, bd] = bISO.split("-").map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000;
}
function estChomme(isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number);
  const jour = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return jour === 0 || jour === 6 || joursFeries(y).has(isoDate);
}
function jalon(jalons: ReturnType<typeof calculerJalons>, code: JalonCode) {
  return jalons.find((j) => j.code === code)!;
}

// Dates couvrant : cas normal, aout, annee bissextile, debut d'annee (recul cross-annee).
const AG_DATES = ["2026-06-15", "2026-08-20", "2024-03-15", "2027-01-04", "2026-12-28"];

describe("calculerJalons", () => {
  it("renvoie les 9 jalons attendus (pre + post-AG, ordre chronologique)", () => {
    const codes = calculerJalons("2026-06-15").map((j) => j.code);
    expect(codes).toEqual([
      "ODJ_CS", "DEVIS", "CONVOC", "RELANCE_POUVOIRS", "POUVOIRS", "TENUE",
      "SCAN_CONTRAT", "NOTIF_PV", "ARCHIVAGE",
    ]);
  });

  for (const ag of AG_DATES) {
    describe(`AG ${ag}`, () => {
      const j = calculerJalons(ag);

      it("TENUE = jour de l'AG", () => {
        expect(jalon(j, "TENUE").cibleDate).toBe(ag);
      });

      it("ODJ_CS et DEVIS a J-45 (gere mois/bissextile)", () => {
        expect(joursEntre(jalon(j, "ODJ_CS").cibleDate, ag)).toBe(45);
        expect(joursEntre(jalon(j, "DEVIS").cibleDate, ag)).toBe(45);
      });

      it("POUVOIRS a J-2", () => {
        expect(joursEntre(jalon(j, "POUVOIRS").cibleDate, ag)).toBe(2);
      });

      it("RELANCE_POUVOIRS (relance date AG) a J-7", () => {
        expect(joursEntre(jalon(j, "RELANCE_POUVOIRS").cibleDate, ag)).toBe(7);
      });

      it("post-AG : scan contrat J+2, notif PV J+30, archivage J+180", () => {
        expect(joursEntre(ag, jalon(j, "SCAN_CONTRAT").cibleDate)).toBe(2);
        expect(joursEntre(ag, jalon(j, "NOTIF_PV").cibleDate)).toBe(30);
        expect(joursEntre(ag, jalon(j, "ARCHIVAGE").cibleDate)).toBe(180);
      });

      it("CONVOC : cible cabinet J-31 (mise sous pli = envoi des convocations)", () => {
        const c = jalon(j, "CONVOC");
        expect(joursEntre(c.cibleDate, ag)).toBeGreaterThanOrEqual(31);
        expect(c.source).toBe("cabinet");
      });

      it("CONVOC : le plancher legal des 21 jours francs est tenu (cabinet plus strict)", () => {
        // Le point le plus important du lot : passer la regle cabinet de J-30 a J-31 ne
        // doit JAMAIS relacher le delai legal de convocation (21 jours francs, art. 9
        // decret 67-223) - un envoi trop tardif fait annuler l'AG.
        // La cible retenue = la plus contraignante = la plus TOT. J-31 (cabinet) est
        // avant J-22 (legal), donc le cabinet gagne et la convocation part PLUS TOT que
        // le minimum legal : le plancher est tenu avec 9 jours de marge.
        const c = jalon(j, "CONVOC");
        expect(c.cibleDate <= c.dateLegale!).toBe(true); // jamais apres la limite legale
        expect(joursEntre(c.cibleDate, ag)).toBeGreaterThanOrEqual(22); // >= 21 jours francs
        expect(c.source).toBe("cabinet"); // c'est bien la regle cabinet qui prime
      });

      it("CONVOC : la cible (mise sous pli) tombe toujours un jour ouvre", () => {
        expect(estChomme(jalon(j, "CONVOC").cibleDate)).toBe(false);
      });

      it("CONVOC : la date legale reste calculee (>= 21 jours francs, jour ouvre)", () => {
        const c = jalon(j, "CONVOC");
        // Jours francs : ni l'envoi ni l'AG ne comptent -> ecart calendaire >= 22.
        expect(joursEntre(c.dateLegale!, ag)).toBeGreaterThanOrEqual(22);
        expect(estChomme(c.dateLegale!)).toBe(false);
        // La cible (la plus contraignante) est toujours <= a la date legale.
        expect(c.cibleDate <= c.dateLegale!).toBe(true);
      });
    });
  }
});
