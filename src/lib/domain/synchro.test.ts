import { describe, expect, it } from "vitest";
import { diagnostiquerAnnuaire, type EtatSynchro } from "./synchro";

const MAINTENANT = new Date("2026-10-13T08:00:00Z");
const ilYa = (h: number) => new Date(MAINTENANT.getTime() - h * 3600 * 1000).toISOString();
const ok = (p: Partial<EtatSynchro> = {}): EtatSynchro => ({
  passeLe: ilYa(4),
  reussiLe: ilYa(4),
  exportDu: ilYa(30),
  statut: "reussi",
  message: null,
  lignes: 32000,
  ...p,
});

describe("diagnostiquerAnnuaire", () => {
  it("ne dit rien quand la synchro de la nuit est passee", () => {
    expect(diagnostiquerAnnuaire(ok(), MAINTENANT)).toEqual({ alerte: false, raisons: [] });
    expect(diagnostiquerAnnuaire(ok({ statut: "inchange", exportDu: ilYa(60) }), MAINTENANT).alerte).toBe(false);
  });

  it("alerte si jamais synchronise, ou si aucun passage n'a reussi", () => {
    expect(diagnostiquerAnnuaire(null, MAINTENANT).alerte).toBe(true);
    expect(diagnostiquerAnnuaire(ok({ reussiLe: null, exportDu: null, statut: "echec", message: "x" }), MAINTENANT).raisons).toHaveLength(2);
  });

  it("alerte sur un echec, avec sa raison", () => {
    const d = diagnostiquerAnnuaire(ok({ statut: "echec", message: "Annuaire refusé : 10 lignes reçues" }), MAINTENANT);
    expect(d.alerte).toBe(true);
    expect(d.raisons[0]).toContain("Annuaire refusé");
  });

  it("alerte quand le script n'a pas tourne depuis plus de 36 h (PC eteint)", () => {
    const d = diagnostiquerAnnuaire(ok({ passeLe: ilYa(40), reussiLe: ilYa(40) }), MAINTENANT);
    expect(d.raisons.join()).toContain("n'a pas tourné");
  });

  it("alerte quand l'export du patron a plus de 4 jours", () => {
    const d = diagnostiquerAnnuaire(ok({ statut: "inchange", exportDu: ilYa(100) }), MAINTENANT);
    expect(d.raisons.join()).toContain("export Crypto n'a pas été renouvelé");
  });
});
