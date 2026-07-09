import { describe, it, expect } from "vitest";
import type { ConfirmationEvenement } from "./confirmation-evenement";
import { agMasqueeCarTenue, statutPourDate } from "./confirmation-evenement";

// Fabrique une confirmation minimale.
function conf(p: Partial<ConfirmationEvenement>): ConfirmationEvenement {
  return {
    coproCode: "S024",
    type: "AG",
    date: "2026-09-15",
    statut: "confirme",
    ...p,
  };
}

describe("statutPourDate", () => {
  it("aucune confirmation enregistree -> a_confirmer (toute date posee est provisoire)", () => {
    expect(statutPourDate(null, "2026-09-15")).toBe("a_confirmer");
  });

  it("confirmation sur la meme date -> statut enregistre (confirme)", () => {
    expect(statutPourDate(conf({ statut: "confirme" }), "2026-09-15")).toBe("confirme");
  });

  it("confirmation a_confirmer sur la meme date -> a_confirmer", () => {
    expect(statutPourDate(conf({ statut: "a_confirmer" }), "2026-09-15")).toBe("a_confirmer");
  });

  it("date replanifiee depuis la confirmation -> la confirmation est invalidee", () => {
    expect(statutPourDate(conf({ statut: "confirme", date: "2026-09-15" }), "2026-10-02")).toBe(
      "a_confirmer",
    );
  });
});

describe("agMasqueeCarTenue", () => {
  const civil = { debut: "01/01", fin: "31/12" };
  const cheval = { debut: "01/07", fin: "30/06" };

  it("cas nominal : AG passee dans l'exercice civil en cours -> masquee", () => {
    // Exercice courant = 2026-01-01 -> 2026-12-31 ; AG tenue le 16/04.
    expect(agMasqueeCarTenue("2026-04-16", civil, "2026-07-08")).toBe(true);
  });

  it("AG passee mais hors exercice courant (exercice precedent) -> pas masquee", () => {
    expect(agMasqueeCarTenue("2025-04-16", civil, "2026-07-08")).toBe(false);
  });

  it("AG future -> pas masquee", () => {
    expect(agMasqueeCarTenue("2026-09-10", civil, "2026-07-08")).toBe(false);
  });

  it("AG du jour meme -> pas masquee (pas encore passee)", () => {
    expect(agMasqueeCarTenue("2026-07-08", civil, "2026-07-08")).toBe(false);
  });

  it("AG passee le jour du debut d'exercice (borne debut incluse) -> masquee", () => {
    // Au 2026-01-05, l'exercice courant est 2026-01-01 -> 2026-12-31.
    expect(agMasqueeCarTenue("2026-01-01", civil, "2026-01-05")).toBe(true);
  });

  it("exercice a cheval (01/07 -> 30/06), today apres la borne debut : AG passee dans l'exercice courant -> masquee", () => {
    // Exercice courant = 2026-07-01 -> 2027-06-30.
    expect(agMasqueeCarTenue("2026-07-02", cheval, "2026-07-08")).toBe(true);
  });

  it("exercice a cheval : AG passee dans l'exercice PRECEDENT -> pas masquee", () => {
    // 2026-06-15 < 2026-07-01 (debut de l'exercice courant).
    expect(agMasqueeCarTenue("2026-06-15", cheval, "2026-07-08")).toBe(false);
  });

  it("exercice a cheval, today avant la borne debut de l'annee : le debut courant recule d'un an", () => {
    // today 2026-05-01 -> exercice courant = 2025-07-01 -> 2026-06-30.
    expect(agMasqueeCarTenue("2025-09-10", cheval, "2026-05-01")).toBe(true);
    expect(agMasqueeCarTenue("2025-06-20", cheval, "2026-05-01")).toBe(false);
  });

  it("exercice illisible -> false (prudence : on ne masque pas)", () => {
    expect(agMasqueeCarTenue("2026-04-16", { debut: "", fin: "31/12" }, "2026-07-08")).toBe(false);
    expect(agMasqueeCarTenue("2026-04-16", { debut: "01/01", fin: "n/a" }, "2026-07-08")).toBe(false);
    expect(agMasqueeCarTenue("2026-04-16", { debut: "31/13", fin: "31/12" }, "2026-07-08")).toBe(false);
    expect(agMasqueeCarTenue("2026-04-16", { debut: "2026-01-01", fin: "31/12" }, "2026-07-08")).toBe(
      false,
    );
  });
});
