// Tests de la cloture d'ODJ ("reunion terminee", Sekou 2026-07-28). La cloture est
// serialisee dans la table d'etat existante (une seule colonne `valeur`), d'ou un format
// "<ISO>|<initiales>" volontairement trivial -- mais qui doit survivre a une valeur
// corrompue sans figer l'ODJ (on prefere un ODJ ouvert a un ODJ bloque par une donnee sale).

import { describe, expect, it } from "vitest";
import { formatCloture, parseCloture } from "./odj";

describe("cloture d'ODJ", () => {
  it("fait l'aller-retour format -> parse", () => {
    const s = formatCloture("2026-07-28T14:05:00.000Z", "SK");
    expect(s).toBe("2026-07-28T14:05:00.000Z|SK");
    expect(parseCloture(s)).toEqual({ le: "2026-07-28T14:05:00.000Z", par: "SK" });
  });

  it("considere l'ODJ OUVERT quand rien n'est stocke", () => {
    expect(parseCloture(null)).toBeUndefined();
    expect(parseCloture(undefined)).toBeUndefined();
    expect(parseCloture("")).toBeUndefined();
  });

  it("tolere une valeur sans initiales plutot que de perdre la cloture", () => {
    expect(parseCloture("2026-07-28T14:05:00.000Z")).toEqual({
      le: "2026-07-28T14:05:00.000Z",
      par: "",
    });
  });

  it("ne fige pas l'ODJ sur une valeur vide de sens", () => {
    expect(parseCloture("|SK")).toBeUndefined();
    expect(parseCloture("   ")).toBeUndefined();
  });

  it("garde des initiales contenant un separateur improbable sans casser", () => {
    // Le split se fait au PREMIER "|" : l'horodatage n'en contient jamais.
    expect(parseCloture("2026-07-28T14:05:00.000Z|S|K")).toEqual({
      le: "2026-07-28T14:05:00.000Z",
      par: "S|K",
    });
  });
});
