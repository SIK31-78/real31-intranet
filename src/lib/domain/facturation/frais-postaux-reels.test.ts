import { describe, expect, it } from "vitest";
import {
  codeCoproDuDetail,
  libelleEnvoi,
  lignesFactureFraisPostaux,
  natureFrais,
  regrouperFraisPostaux,
  type LigneConsommationEstale,
} from "./frais-postaux-reels";

function ligne(p: Partial<LigneConsommationEstale> & Pick<LigneConsommationEstale, "categorie">): LigneConsommationEstale {
  return {
    scope: "Mailing",
    dateISO: "2026-07-21",
    prixUnitaireHtCentimes: 0,
    prixUnitaireTtcCentimes: 0,
    quantite: 1,
    sourceId: "pv",
    detail: "S305 - Diffusion PV AG ~ [Copropriétaire] X",
    ...p,
  };
}

describe("natureFrais", () => {
  it("classe les catégories ESTALE, accents ou pas", () => {
    expect(natureFrais("Timbre LRAR")).toBe("timbre");
    expect(natureFrais("Timbre Ecopli")).toBe("timbre");
    expect(natureFrais("Service LRAR")).toBe("service");
    expect(natureFrais("Envoi Recommandé Electronique")).toBe("lre");
    expect(natureFrais("Envoi Recommande Electronique")).toBe("lre");
    expect(natureFrais("Abo. Essentiel")).toBeNull();
  });
});

describe("codeCoproDuDetail et libelleEnvoi", () => {
  it("lisent les deux formes du détail ESTALE", () => {
    expect(codeCoproDuDetail("[S0302] Appel de fonds du 16/06/2026 ~ [0007] X")).toBe("S302");
    expect(codeCoproDuDetail("S302 - Diffusion PV AG ~ [Copropriétaire] X")).toBe("S302");
    expect(libelleEnvoi("[S0302] Appel de fonds du 16/06/2026 ~ [0007] X")).toBe("[S0302] Appel de fonds du 16/06/2026");
  });
  it("ignorent la copro de test et un détail sans code", () => {
    expect(codeCoproDuDetail("[SE999] Convocation AGO du 19/11/2026")).toBeNull();
    expect(codeCoproDuDetail("Faisons connaissance en quelques minutes...")).toBeNull();
  });
});

describe("regrouperFraisPostaux", () => {
  it("retrouve la facture S305 du 23/10/2026 sur le PV : 21 LRAR + 7 LRE = 188,09 € HT", () => {
    const lignes = [
      ligne({ categorie: "Timbre LRAR", prixUnitaireHtCentimes: 796, prixUnitaireTtcCentimes: 796, quantite: 21 }),
      ligne({ categorie: "Service LRAR", prixUnitaireHtCentimes: 713, prixUnitaireTtcCentimes: 856, quantite: 21 }),
      ligne({ categorie: "Envoi Recommandé Electronique", prixUnitaireHtCentimes: 299, prixUnitaireTtcCentimes: 359, quantite: 7 }),
      ligne({ categorie: "Abo. Essentiel", prixUnitaireHtCentimes: 35, prixUnitaireTtcCentimes: 42 }),
    ];
    const { parCopro, nonRattaches } = regrouperFraisPostaux(lignes, new Set(["S305"]));
    expect(nonRattaches).toEqual([]);
    expect(parCopro).toHaveLength(1);
    const s305 = parCopro[0]!;
    expect(s305.timbresEtLreHtCentimes).toBe(18809);
    expect(s305.serviceHtCentimes).toBe(14973);
    expect(s305.serviceTtcCentimes).toBe(17976);
    expect(s305.envois).toEqual([
      {
        sourceId: "pv",
        libelle: "S305 - Diffusion PV AG",
        scope: "Mailing",
        dateISO: "2026-07-21",
        affranchissements: [
          { categorie: "Timbre LRAR", plis: 21, htCentimes: 16716 },
          { categorie: "Envoi Recommandé Electronique", plis: 7, htCentimes: 2093 },
        ],
        plis: 28,
        timbresHtCentimes: 16716,
        lreHtCentimes: 2093,
        serviceHtCentimes: 14973,
        serviceTtcCentimes: 17976,
      },
    ]);
  });

  it("sépare les envois d'une même copro, du plus ancien au plus récent", () => {
    const lignes = [
      ligne({ categorie: "Timbre Ecopli", sourceId: "af", scope: "Appel de fonds", dateISO: "2026-09-17", detail: "[S0305] Appel de fonds du 16/09/2026 ~ X", prixUnitaireHtCentimes: 74 }),
      ligne({ categorie: "Timbre LRAR", sourceId: "pv", prixUnitaireHtCentimes: 796 }),
    ];
    const s305 = regrouperFraisPostaux(lignes, new Set(["S305"])).parCopro[0]!;
    expect(s305.envois.map((e) => e.sourceId)).toEqual(["pv", "af"]);
    expect(s305.timbresEtLreHtCentimes).toBe(870);
  });

  it("écarte les copros au forfait et la copro de test", () => {
    const lignes = [
      ligne({ categorie: "Timbre Ecopli", detail: "[S0304] Appel de fonds", prixUnitaireHtCentimes: 74 }),
      ligne({ categorie: "Envoi Recommandé Electronique", detail: "[SE999] Convocation AGO ~ X", sourceId: "ag" }),
    ];
    expect(regrouperFraisPostaux(lignes, new Set(["S305"]))).toEqual({ parCopro: [], nonRattaches: [] });
  });

  it("rattache un envoi sans code à la copro unique de son mailing", () => {
    const lignes = [
      ligne({ categorie: "Timbre Ecopli", detail: "Faisons connaissance ~ X", sourceId: "m306", prixUnitaireHtCentimes: 74, quantite: 2 }),
    ];
    const r = regrouperFraisPostaux(lignes, new Set(["S306"]), new Map([["m306", ["S306"]]]));
    expect(r.parCopro[0]).toMatchObject({ coproCode: "S306", timbresEtLreHtCentimes: 148 });
  });

  it("laisse non rattaché un mailing à plusieurs copros dont une au réel", () => {
    const lignes = [
      ligne({ categorie: "Timbre Ecopli", detail: "Fiche de renseignements ~ X", sourceId: "m2", prixUnitaireTtcCentimes: 74, quantite: 3 }),
    ];
    const r = regrouperFraisPostaux(lignes, new Set(["S303"]), new Map([["m2", ["S303", "S304"]]]));
    expect(r.parCopro).toEqual([]);
    expect(r.nonRattaches).toEqual([
      { sourceId: "m2", libelle: "Fiche de renseignements", coprosPossibles: ["S303", "S304"], quantite: 3, montantTtcCentimes: 222 },
    ]);
  });

  it("ignore un mailing sans code dont aucune copro n'est au réel", () => {
    const lignes = [ligne({ categorie: "Timbre Ecopli", detail: "Fiche ~ X", sourceId: "m2" })];
    const r = regrouperFraisPostaux(lignes, new Set(["S305"]), new Map([["m2", ["S303", "S304"]]]));
    expect(r).toEqual({ parCopro: [], nonRattaches: [] });
  });
});

describe("lignesFactureFraisPostaux", () => {
  const copro = regrouperFraisPostaux(
    [
      ligne({ categorie: "Timbre LRAR", prixUnitaireHtCentimes: 796, prixUnitaireTtcCentimes: 796, quantite: 21 }),
      ligne({ categorie: "Service LRAR", prixUnitaireHtCentimes: 713, prixUnitaireTtcCentimes: 856, quantite: 21 }),
      ligne({ categorie: "Envoi Recommandé Electronique", prixUnitaireHtCentimes: 299, prixUnitaireTtcCentimes: 359, quantite: 7 }),
      ligne({ categorie: "Timbre LRAR", sourceId: "med", detail: "mise en demeure 3F ~ X", prixUnitaireHtCentimes: 612 }),
    ],
    new Set(["S305"]),
    new Map([["med", ["S305"]]]),
  ).parCopro[0]!;

  it("reprend la facture de Clémentine : affranchissement exonéré, détaillé par catégorie", () => {
    expect(lignesFactureFraisPostaux(copro, new Set(["pv"]), false, "juillet 2026")).toEqual([
      {
        description: "Frais postaux juillet 2026\n21 LRAR : 167,16 €\n7 Recommandés électroniques : 20,93 €",
        prixUnitaireHtCentimes: 18809,
        tauxTva: 0,
      },
    ]);
  });

  it("ajoute le service ESTALE à 20 % seulement sur demande", () => {
    const lignes = lignesFactureFraisPostaux(copro, new Set(["pv"]), true, "juillet 2026");
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toMatchObject({ prixUnitaireHtCentimes: 14973, tauxTva: 0.2 });
  });

  it("cumule les envois retenus et ignore les autres", () => {
    const lignes = lignesFactureFraisPostaux(copro, new Set(["pv", "med"]), false, "juillet 2026");
    expect(lignes[0]!.description).toContain("22 LRAR : 173,28 €");
    expect(lignesFactureFraisPostaux(copro, new Set(), true, "juillet 2026")).toEqual([]);
  });
});
