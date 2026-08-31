import { describe, expect, it } from "vitest";
import { HISTORIQUE_VIDE, annuler, pousserGeste, refaire } from "./odj-historique";

describe("odj-historique - annuler / refaire", () => {
  it("cycle : pousser -> annuler rend 'avant' -> refaire rend 'apres'", () => {
    let h = pousserGeste(HISTORIQUE_VIDE, { champId: "lieu", avant: "", apres: "Salle A" });
    h = pousserGeste(h, { champId: "lieu", avant: "Salle A", apres: "Salle B" });

    const a1 = annuler(h);
    expect(a1.geste).toMatchObject({ champId: "lieu", avant: "Salle A" }); // on resaisit "Salle A"
    const a2 = annuler(a1.historique);
    expect(a2.geste).toMatchObject({ avant: "" }); // retour a la valeur auto
    expect(annuler(a2.historique).geste).toBeUndefined(); // pile vide : rien ne se passe

    const r = refaire(a2.historique);
    expect(r.geste).toMatchObject({ apres: "Salle A" });
  });

  it("une nouvelle frappe invalide les refaisables (standard editeur)", () => {
    let h = pousserGeste(HISTORIQUE_VIDE, { champId: "lieu", avant: "", apres: "A" });
    h = annuler(h).historique;
    expect(h.refaisables).toHaveLength(1);
    h = pousserGeste(h, { champId: "budget", avant: "", apres: "100" });
    expect(h.refaisables).toHaveLength(0);
    expect(refaire(h).geste).toBeUndefined();
  });

  it("un geste sans changement n'encombre pas la pile", () => {
    const h = pousserGeste(HISTORIQUE_VIDE, { champId: "lieu", avant: "x", apres: "x" });
    expect(h.annulables).toHaveLength(0);
  });

  it("la pile est bornee a 100 gestes (les plus anciens tombent)", () => {
    let h = HISTORIQUE_VIDE;
    for (let i = 0; i < 120; i++) {
      h = pousserGeste(h, { champId: "lieu", avant: String(i), apres: String(i + 1) });
    }
    expect(h.annulables).toHaveLength(100);
    expect(h.annulables[0]!.avant).toBe("20");
  });
});
