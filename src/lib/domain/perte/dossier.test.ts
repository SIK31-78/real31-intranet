// La checklist vient de la fiche process (Loop) ; les tests verrouillent ce qui se date
// depuis l'AG et ce qui rend une etape « faite ».

import { describe, expect, it } from "vitest";
import {
  avancement,
  controlesComplets,
  echeanceEtape,
  estTermine,
  ETAPES_PERTE,
  etapesInitiales,
  prochaineEtape,
  retardEtape,
  type DossierPerte,
} from "./dossier";

function dossier(over: Partial<DossierPerte> = {}): DossierPerte {
  return {
    id: "d1",
    coproCode: "S182",
    coproNom: "LAPROMENAD",
    dateAgISO: "2026-06-25",
    finGestionISO: "2026-06-30",
    statut: "en_cours",
    etapes: etapesInitiales(),
    journal: [],
    creeParNom: "Sekou KOMA",
    creeLeISO: "2026-09-15",
    ...over,
  };
}

describe("checklist de perte", () => {
  it("reprend les 12 actions de gestion, les 4 de compta et la cloture a 5 ans", () => {
    expect(ETAPES_PERTE).toHaveLength(17);
    const codes = ETAPES_PERTE.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(ETAPES_PERTE.find((e) => e.code === "CO1")?.controles).toHaveLength(10);
  });

  it("date tout depuis l'AG : lendemain, J+15, 5 ans", () => {
    expect(echeanceEtape("2026-06-25", "LE1")).toBe("2026-06-26");
    expect(echeanceEtape("2026-06-25", "QZ1")).toBe("2026-07-10");
    expect(echeanceEtape("2026-06-25", "CO5")).toBe("2031-06-24");
    expect(echeanceEtape("2026-06-25", "TR1")).toBeNull();
  });

  it("compte le retard d'une etape datee, jamais d'une etape faite ou sans objet", () => {
    const d = dossier();
    const le1 = d.etapes.find((e) => e.code === "LE1")!;
    expect(retardEtape(d, le1, "2026-09-15")).toBe(81);
    expect(retardEtape(d, { ...le1, statut: "fait" }, "2026-09-15")).toBeNull();
    expect(retardEtape(d, { ...le1, statut: "ignore" }, "2026-09-15")).toBeNull();
    expect(retardEtape(d, d.etapes.find((e) => e.code === "TR1")!, "2026-09-15")).toBeNull();
  });

  it("la prochaine etape est la plus en retard, sinon la premiere ouverte dans l'ordre de la fiche", () => {
    const d = dossier();
    // Au 15/09, LE1..LE4 (J+1) et QZ1 (J+15) sont en retard ; LE1 a le meme retard que LE2-4, QZ1 moins.
    expect(prochaineEtape(d, "2026-09-15")?.code).toBe("LE1");
    const tout = dossier({ etapes: etapesInitiales().map((e) => (e.code.startsWith("LE") || e.code === "QZ1" ? { ...e, statut: "fait" } : e)) });
    expect(prochaineEtape(tout, "2026-09-15")?.code).toBe("TR1");
  });

  it("l'avancement compte le sans objet comme fait (regle du noyau), plus retards et blocages", () => {
    const etapes = etapesInitiales().map((e) =>
      e.code === "LE4" ? { ...e, statut: "ignore" as const } : e.code === "LE1" ? { ...e, statut: "fait" as const } : e.code === "TR2" ? { ...e, statut: "bloque" as const } : e,
    );
    const a = avancement(dossier({ etapes }), "2026-09-15");
    expect(a.total).toBe(17);
    expect(a.faites).toBe(2);
    expect(a.bloquees).toBe(1);
    // LE2, LE3, QZ1 en retard (LE1 faite, LE4 sans objet).
    expect(a.enRetard).toBe(3);
  });

  it("une liste de controle est complete quand toutes ses cases sont cochees", () => {
    const co1 = { code: "CO1", statut: "en_cours" as const, controles: { "3 derniers EDD": true } };
    expect(controlesComplets(co1)).toBe(false);
    const toutes = Object.fromEntries(ETAPES_PERTE.find((e) => e.code === "CO1")!.controles!.map((c) => [c, true]));
    expect(controlesComplets({ ...co1, controles: toutes })).toBe(true);
    expect(controlesComplets({ code: "TR1", statut: "a_faire" })).toBe(true);
  });

  it("le dossier n'est termine que quand tout est fait ou sans objet", () => {
    expect(estTermine(dossier())).toBe(false);
    expect(estTermine(dossier({ etapes: etapesInitiales().map((e) => ({ ...e, statut: "fait" })) }))).toBe(true);
  });
});
