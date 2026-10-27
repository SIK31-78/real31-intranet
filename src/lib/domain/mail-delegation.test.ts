import { describe, expect, it } from "vitest";
import { avecBoitesPersoDeleguees, nomCourtTitulaire, titulairesDelegantsActifs, type DelegationLue } from "./mail-delegation";

const d = (x: Partial<DelegationLue>): DelegationLue => ({
  id: "d1",
  deUserId: "fanny",
  aUserId: "emmanuel",
  portee: "portefeuille",
  depuisISO: "2026-10-20",
  jusquaISO: "2026-11-15",
  ...x,
});

describe("titulairesDelegantsActifs (les délégations ouvrent les mails, 27/10/2026)", () => {
  const jour = "2026-10-27";

  it("une délégation de portefeuille active vers moi ouvre les mails du titulaire", () => {
    expect(titulairesDelegantsActifs([d({})], "emmanuel", jour)).toEqual(["fanny"]);
  });

  it("bornes comprises, sans fin possible", () => {
    expect(titulairesDelegantsActifs([d({ depuisISO: jour, jusquaISO: jour })], "emmanuel", jour)).toEqual(["fanny"]);
    expect(titulairesDelegantsActifs([d({ jusquaISO: null })], "emmanuel", jour)).toEqual(["fanny"]);
  });

  it("expirée, à venir ou clôturée : rien", () => {
    expect(titulairesDelegantsActifs([d({ jusquaISO: "2026-10-26" })], "emmanuel", jour)).toEqual([]);
    expect(titulairesDelegantsActifs([d({ depuisISO: "2026-10-28" })], "emmanuel", jour)).toEqual([]);
    expect(titulairesDelegantsActifs([d({ clotureeLeISO: "2026-10-25T10:00:00Z" })], "emmanuel", jour)).toEqual([]);
  });

  it("une délégation d'agence ou de copro n'ouvre aucun mail", () => {
    expect(titulairesDelegantsActifs([d({ portee: "agence", agenceCode: "LGC" }), d({ portee: "copro", coproCode: "S077" })], "emmanuel", jour)).toEqual([]);
  });

  it("seulement les délégations dont je suis le bénéficiaire, sans doublon ni moi-même", () => {
    const liste = [d({}), d({ id: "d2" }), d({ aUserId: "galiano" }), d({ deUserId: "emmanuel" })];
    expect(titulairesDelegantsActifs(liste, "emmanuel", jour)).toEqual(["fanny"]);
  });
});

describe("nomCourtTitulaire", () => {
  it("prénom et initiale du nom", () => {
    expect(nomCourtTitulaire("Fanny SORIVELLE")).toBe("Fanny S.");
    expect(nomCourtTitulaire("SORIVELLE Fanny")).toBe("Fanny S.");
    expect(nomCourtTitulaire("Jean-Marc de la Tour")).toBe("Jean-Marc de la T.");
    expect(nomCourtTitulaire("Wilfrid-Huang TOHOUBI")).toBe("Wilfrid-Huang T.");
    expect(nomCourtTitulaire("Fanny")).toBe("Fanny");
    expect(nomCourtTitulaire("  ")).toBe("");
  });
});

describe("avecBoitesPersoDeleguees (option a de Sekou, 27/10/2026)", () => {
  const miennes = [
    { id: "emmanuel@real31.fr", adresse: "emmanuel@real31.fr", libelle: "Ma boîte", personnelle: true },
    { id: "syndic2@real31.fr", adresse: "syndic2@real31.fr", libelle: "syndic2 · mes mails", personnelle: false },
  ];
  const fanny = { email: "Fanny@real31.fr", nomComplet: "Fanny SORIVELLE" };

  it("ajoute l'onglet « Boîte de Fanny S. (délégation) » après mes boîtes", () => {
    expect(avecBoitesPersoDeleguees(miennes, [fanny], false).at(-1)).toEqual({
      id: "fanny@real31.fr",
      adresse: "fanny@real31.fr",
      libelle: "Boîte de Fanny S. (délégation)",
      personnelle: true,
      pour: "Fanny S.",
    });
  });

  it("jamais en incarnation, jamais une boîte déjà présente", () => {
    expect(avecBoitesPersoDeleguees(miennes, [fanny], true)).toEqual(miennes);
    expect(avecBoitesPersoDeleguees(miennes, [{ email: "syndic2@real31.fr", nomComplet: "X" }], false)).toEqual(miennes);
  });

  it("de bout en bout : portefeuille actif oui ; agence ou expirée, non", () => {
    const jour = "2026-10-27";
    const ouvre = (x: Partial<DelegationLue>) => titulairesDelegantsActifs([d(x)], "emmanuel", jour).length > 0;
    expect(ouvre({})).toBe(true);
    expect(ouvre({ portee: "agence", agenceCode: "LGC" })).toBe(false);
    expect(ouvre({ jusquaISO: "2026-10-01" })).toBe(false);
  });
});
