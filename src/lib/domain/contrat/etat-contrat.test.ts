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
        dernierCycleEnregistreLeISO: "2026-07-22",
      }),
    ).toBe("genere");
  });

  it("S088 JBONAL7173 : AG tenue le 03/09 avec un contrat, aucun cycle ouvert depuis -> recap a faire", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: null,
        derniereEditionAgISO: "2026-09-03",
        dernierCycleEnregistreLeISO: "2026-07-22",
      }),
    ).toBe("recap-a-faire");
  });

  it("S270 le lendemain de l'AG, date jamais glissee : le contrat existe, le recap manque", () => {
    expect(
      etatContrat({
        aujourdhuiISO: "2026-09-16",
        prochaineAgISO: "2026-09-15",
        derniereEditionAgISO: "2026-09-15",
        dernierCycleEnregistreLeISO: "2026-07-22",
      }),
    ).toBe("recap-a-faire");
  });

  it("S013 MURGERS19 : contrat edite pour une AG a venir que le referentiel ignore -> genere", () => {
    // Le contrat existe ; c'est la date d'AG qui manque sur la fiche, pas le contrat.
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: null,
        derniereEditionAgISO: "2026-09-24",
        dernierCycleEnregistreLeISO: "2026-07-22",
      }),
    ).toBe("genere");
  });

  it("apres le recap (cycle ouvert apres l'AG), la copro retombe en « a planifier »", () => {
    expect(
      etatContrat({
        aujourdhuiISO: "2026-10-01",
        prochaineAgISO: null,
        derniereEditionAgISO: "2026-09-15",
        dernierCycleEnregistreLeISO: "2026-09-16",
      }),
    ).toBe("a-planifier");
  });

  it("AG a venir sans aucune edition -> a generer", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: "2026-10-20",
        derniereEditionAgISO: null,
        dernierCycleEnregistreLeISO: "2026-07-22",
      }),
    ).toBe("a-generer");
  });

  it("AG deplacee apres l'edition : le contrat porte la mauvaise date, il est a refaire", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: "2026-10-20",
        derniereEditionAgISO: "2026-10-13",
        dernierCycleEnregistreLeISO: "2026-07-22",
      }),
    ).toBe("a-generer");
  });

  it("une AG passee au referentiel sans aucune edition n'est ni un retard ni un recap : a planifier", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: "2026-06-11",
        derniereEditionAgISO: null,
        dernierCycleEnregistreLeISO: "2026-07-22",
      }),
    ).toBe("a-planifier");
  });

  it("S122 FOCH44LGC : AG le 07/07, cycle demarre le 01/07 mais ENREGISTRE le 22/07 -> recap fait", () => {
    // Le mandat est retroactif au 1er du mois : tester le debut du cycle dirait a tort
    // que rien n'a ete acte depuis l'AG.
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: null,
        derniereEditionAgISO: "2026-07-07",
        dernierCycleEnregistreLeISO: "2026-07-22",
      }),
    ).toBe("a-planifier");
  });

  it("un recap fait le jour meme de l'AG compte", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: null,
        derniereEditionAgISO: "2026-09-03",
        dernierCycleEnregistreLeISO: "2026-09-03",
      }),
    ).toBe("a-planifier");
  });

  it("une vieille edition dont le cycle a ete enregistre depuis ne reclame pas de recap", () => {
    expect(
      etatContrat({
        aujourdhuiISO: AUJOURDHUI,
        prochaineAgISO: null,
        derniereEditionAgISO: "2025-06-20",
        dernierCycleEnregistreLeISO: "2026-07-22",
      }),
    ).toBe("a-planifier");
  });
});
