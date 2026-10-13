import { describe, expect, it } from "vitest";
import { ajouterMois, controlerDateRecap, dateRecapSuggeree, refusDateRecap } from "./controle-date";

const AUJ = "2026-10-12";

describe("ajouterMois", () => {
  it("borne le jour a la fin du mois", () => {
    expect(ajouterMois("2026-08-31", 6)).toBe("2027-02-28");
    expect(ajouterMois("2025-12-15", 10)).toBe("2026-10-15");
  });
});

describe("dateRecapSuggeree (REA-166 a)", () => {
  it("propose la prochaine AG deja passee, avec son origine", () => {
    expect(dateRecapSuggeree({ prochaineAgDate: "2026-10-06", derniereAgDate: "2025-09-16", datesRecaps: [], aujourdhui: AUJ })).toEqual({
      date: "2026-10-06",
      origine: "prochaine",
    });
  });

  it("le cas S176 : prochaine AG non planifiee, derniere AG de l'an dernier -> rien", () => {
    expect(dateRecapSuggeree({ derniereAgDate: "2025-09-16", datesRecaps: [], aujourdhui: AUJ })).toBeUndefined();
  });

  it("ne repropose pas une AG qui a deja son recap (a quelques jours pres)", () => {
    expect(dateRecapSuggeree({ prochaineAgDate: "2026-10-06", datesRecaps: ["2026-10-06"], aujourdhui: AUJ })).toBeUndefined();
    expect(dateRecapSuggeree({ derniereAgDate: "2026-09-20", datesRecaps: ["2026-09-24"], aujourdhui: AUJ })).toBeUndefined();
  });

  it("propose la derniere AG recente sans recap", () => {
    expect(dateRecapSuggeree({ prochaineAgDate: "2027-06-01", derniereAgDate: "2026-09-24", datesRecaps: ["2025-09-24"], aujourdhui: AUJ })).toEqual({
      date: "2026-09-24",
      origine: "derniere",
    });
  });

  it("aucune AG connue : rien", () => {
    expect(dateRecapSuggeree({ datesRecaps: [], aujourdhui: AUJ })).toBeUndefined();
  });
});

describe("controlerDateRecap (REA-166 b)", () => {
  it("date propre : aucune alerte", () => {
    expect(controlerDateRecap({ agDate: "2026-10-06", datesRecaps: ["2025-09-30"], aujourdhui: AUJ })).toEqual([]);
  });

  it("meme date : refus sans confirmation possible", () => {
    const a = controlerDateRecap({ agDate: "2026-10-06", datesRecaps: ["2026-10-06"], aujourdhui: AUJ });
    expect(a.map((x) => x.motif)).toEqual(["meme_date"]);
    expect(refusDateRecap(a, true)).toMatch(/une assemblée n'a qu'un récap/);
  });

  it("un autre recap a moins de 10 mois, dans un sens ou dans l'autre", () => {
    const apres = controlerDateRecap({ agDate: "2026-09-16", datesRecaps: ["2026-06-10"], aujourdhui: AUJ });
    expect(apres.map((x) => x.motif)).toEqual(["recap_proche"]);
    expect(apres[0].message).toMatch(/10\/06\/2026/);
    // Le cas reel : AG 2026 saisie en 2025 alors que le recap 2025 existe deja.
    const avant = controlerDateRecap({ agDate: "2025-09-24", datesRecaps: ["2025-10-01"], aujourdhui: AUJ });
    expect(avant.map((x) => x.motif)).toEqual(["recap_proche", "ag_ancienne"]);
  });

  it("a 10 mois pile ou plus, pas d'alerte de proximite", () => {
    expect(controlerDateRecap({ agDate: "2026-08-10", datesRecaps: ["2025-10-10"], aujourdhui: AUJ })).toEqual([]);
  });

  it("AG de plus de 6 mois : alerte, avec le bareme qui serait applique", () => {
    const a = controlerDateRecap({ agDate: "2025-09-16", datesRecaps: [], aujourdhui: AUJ });
    expect(a.map((x) => x.motif)).toEqual(["ag_ancienne"]);
    expect(a[0].message).toMatch(/exercice 2024/);
    expect(controlerDateRecap({ agDate: "2026-04-13", datesRecaps: [], aujourdhui: AUJ })).toEqual([]);
  });

  it("une alerte confirmable bloque tant que la date n'est pas confirmee", () => {
    const a = controlerDateRecap({ agDate: "2025-09-16", datesRecaps: [], aujourdhui: AUJ });
    expect(refusDateRecap(a, false)).toMatch(/Confirmez la date/);
    expect(refusDateRecap(a, true)).toBeNull();
    expect(refusDateRecap([], false)).toBeNull();
  });
});
