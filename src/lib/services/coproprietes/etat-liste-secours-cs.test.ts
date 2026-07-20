// Tests de l'indicateur de SOURCE ACTIVE (etat-liste-secours-cs). La regle metier non
// negociable : si eStale fournit les emails du conseil, la liste de secours est INACTIVE
// (l'edition ne change pas le mail) ; sinon elle est ACTIVE. On derive cet etat de la VRAIE
// cascade (destinatairesConseilSyndical, mockee) + la liste Crypto brute (router mocke).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceDestinataires } from "@/lib/services/coproprietes/destinataires-conseil";

const etat = vi.hoisted(() => ({
  source: "aucune" as SourceDestinataires,
  emailsCascade: [] as string[],
  emailsSecours: null as string[] | null,
  reset() {
    etat.source = "aucune";
    etat.emailsCascade = [];
    etat.emailsSecours = null;
  },
}));

vi.mock("@/lib/services/coproprietes/destinataires-conseil", () => ({
  destinatairesConseilSyndical: async () => ({ source: etat.source, emails: etat.emailsCascade }),
}));
vi.mock("@/lib/adapters/router", () => ({
  getListesDiffusionProvider: () => ({
    async listeCSPourCopro() {
      return etat.emailsSecours
        ? { coproCode: "S46", designation: "CS", emails: etat.emailsSecours }
        : null;
    },
  }),
}));

import { etatListeSecoursCS } from "./etat-liste-secours-cs";

beforeEach(() => etat.reset());

describe("etatListeSecoursCS", () => {
  it("eStale fournit des emails -> secours INACTIF (mais liste de secours toujours editable)", async () => {
    etat.source = "estale";
    etat.emailsCascade = ["a@example.test"];
    etat.emailsSecours = ["secours@example.test"]; // existe mais n'alimente pas le mail
    const r = await etatListeSecoursCS("S46");
    expect(r.sourceActive).toBe("estale");
    expect(r.estaleFournitEmails).toBe(true);
    expect(r.emailsSecours).toEqual(["secours@example.test"]);
  });

  it("eStale sans email (source crypto) -> secours ACTIF", async () => {
    etat.source = "crypto";
    etat.emailsSecours = ["m1@example.test", "m2@example.test"];
    const r = await etatListeSecoursCS("S46");
    expect(r.estaleFournitEmails).toBe(false);
    expect(r.sourceActive).toBe("crypto");
    expect(r.emailsSecours).toEqual(["m1@example.test", "m2@example.test"]);
  });

  it("aucune source -> secours ACTIF (vide), pret a etre saisi", async () => {
    etat.source = "aucune";
    etat.emailsSecours = null;
    const r = await etatListeSecoursCS("S46");
    expect(r.estaleFournitEmails).toBe(false);
    expect(r.emailsSecours).toEqual([]);
  });
});
