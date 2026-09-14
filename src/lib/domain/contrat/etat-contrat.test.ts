// Les deux cas viennent de la base du 14/09/2026, pointes par Sekou comme tests.

import { describe, expect, it } from "vitest";
import { etatContrat } from "./etat-contrat";

const AUJOURDHUI = "2026-09-14";

describe("etatContrat", () => {
  it("S270 GAUTHEY34 : AG demain, contrat edite le 18/08 pour cette AG -> genere", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: "2026-09-15",
        derniereEditionAgISO: "2026-09-15",
        debutDernierCycleISO: "2025-10-01",
      }),
    ).toBe("genere");
  });

  it("S088 JBONAL7173 : AG tenue le 03/09 avec un contrat, aucun cycle ouvert depuis -> recap a faire", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: null,
        derniereEditionAgISO: "2026-09-03",
        debutDernierCycleISO: "2025-10-01",
      }),
    ).toBe("recap-a-faire");
  });

  it("S270 le lendemain de l'AG, date jamais glissee : le contrat existe, le recap manque", () => {
    expect(
      etatContrat({
        aujourdhuiISO: "2026-09-16",
        prochaineAgISO: "2026-09-15",
        derniereEditionAgISO: "2026-09-15",
        debutDernierCycleISO: "2025-10-01",
      }),
    ).toBe("recap-a-faire");
  });

  it("apres le recap (cycle ouvert apres l'AG), la copro retombe en « a planifier »", () => {
    expect(
      etatContrat({
        aujourdhuiISO: "2026-10-01",
        prochaineAgISO: null,
        derniereEditionAgISO: "2026-09-15",
        debutDernierCycleISO: "2026-11-01",
      }),
    ).toBe("a-planifier");
  });

  it("AG a venir sans aucune edition -> a generer", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: "2026-10-20",
        derniereEditionAgISO: null,
        debutDernierCycleISO: "2025-10-01",
      }),
    ).toBe("a-generer");
  });

  it("AG deplacee apres l'edition : le contrat porte la mauvaise date, il est a refaire", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: "2026-10-20",
        derniereEditionAgISO: "2026-10-13",
        debutDernierCycleISO: "2025-10-01",
      }),
    ).toBe("a-generer");
  });

  it("une AG passee au referentiel sans aucune edition n'est ni un retard ni un recap : a planifier", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: "2026-06-11",
        derniereEditionAgISO: null,
        debutDernierCycleISO: "2025-10-01",
      }),
    ).toBe("a-planifier");
  });

  it("une vieille edition dont le cycle a ete ouvert depuis ne reclame pas de recap", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: null,
        derniereEditionAgISO: "2025-06-20",
        debutDernierCycleISO: "2025-10-01",
      }),
    ).toBe("a-planifier");
  });
});
