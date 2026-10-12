import { describe, expect, it } from "vitest";
import { surveillerAnnuaire } from "./surveiller-annuaire";

const MAINTENANT = new Date("2026-10-13T08:00:00Z");

describe("surveillerAnnuaire", () => {
  it("envoie un mail qui donne les raisons et la marche a suivre", async () => {
    const envois: { sujet: string; corps: string }[] = [];
    const r = await surveillerAnnuaire({
      etat: async () => null,
      alerter: async (sujet, corps) => void envois.push({ sujet, corps }),
      maintenant: MAINTENANT,
    });
    expect(r.alerteEnvoyee).toBe(true);
    expect(envois[0]?.corps).toContain("jamais été synchronisé");
    expect(envois[0]?.corps).toContain("sync-annuaire-crypto.cmd");
  });

  it("n'envoie rien quand tout va bien, ni sans destinataire", async () => {
    const etat = { passeLe: "2026-10-13T02:00:00Z", reussiLe: "2026-10-13T02:00:00Z", exportDu: "2026-10-12T22:00:00Z", statut: "reussi" as const, message: null, lignes: 1 };
    let envois = 0;
    expect((await surveillerAnnuaire({ etat: async () => etat, alerter: async () => void envois++, maintenant: MAINTENANT })).alerteEnvoyee).toBe(false);
    expect((await surveillerAnnuaire({ etat: async () => null, maintenant: MAINTENANT })).alerteEnvoyee).toBe(false);
    expect(envois).toBe(0);
  });

  it("transforme un compte rendu illisible en alerte", async () => {
    const r = await surveillerAnnuaire({ etat: async () => { throw new Error("table absente"); }, maintenant: MAINTENANT });
    expect(r.alerte).toBe(true);
    expect(r.raisons[0]).toContain("table absente");
  });
});
