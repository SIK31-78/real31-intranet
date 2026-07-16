// Tests du domaine PUR de rapprochement des contacts d'annexe <-> owners. Noms SYNTHETIQUES
// (inventes) - aucune donnee reelle. Aucun reseau.
import { describe, expect, it } from "vitest";
import {
  rapprocherContacts,
  reciblerContact,
  marquerContact,
  noteVigilanceAnnexe,
} from "../rapprochement-contacts";
import { classerNote } from "../classement-notes";
import type { Owner } from "../patrimoine";
import type { ContactAnnexe } from "@/lib/reprise/ports/extraction-annexe-provider";

const owner = (id: string, nom: string, prenom?: string): Owner => ({
  id,
  civilite: "m",
  nom,
  ...(prenom ? { prenom } : {}),
  pro: false,
});

const OWNERS: Owner[] = [
  owner("o1", "MARTIN", "Paul"),
  owner("o2", "NOVAK", "Elena"),
  owner("o3", "DURAND", "Sophie"),
];

describe("rapprocherContacts", () => {
  it("appariement fort et non ambigu -> statut 'sur' avec ownerId", () => {
    const contacts: ContactAnnexe[] = [{ nom: "MARTIN Paul", email: "paul@example.test" }];
    const [c] = rapprocherContacts(contacts, OWNERS);
    expect(c.statut).toBe("sur");
    expect(c.ownerId).toBe("o1");
    expect(c.confiance).toBeCloseTo(1);
    expect(c.email).toBe("paul@example.test");
  });

  it("independant de l'ordre nom/prenom", () => {
    const [c] = rapprocherContacts([{ nom: "Paul MARTIN" }], OWNERS);
    expect(c.statut).toBe("sur");
    expect(c.ownerId).toBe("o1");
  });

  it("nom seul (sous-ensemble) -> statut 'ambigu' (proposition a confirmer)", () => {
    const [c] = rapprocherContacts([{ nom: "MARTIN" }], OWNERS);
    expect(c.statut).toBe("ambigu");
    expect(c.ownerId).toBe("o1");
  });

  it("aucun owner apparie -> statut 'inconnu' sans ownerId", () => {
    const [c] = rapprocherContacts([{ nom: "ZORGLUB Xavier", email: "x@example.test" }], OWNERS);
    expect(c.statut).toBe("inconnu");
    expect(c.ownerId).toBeUndefined();
  });

  it("owners homonymes -> jamais 'sur' automatique (ambigu force)", () => {
    const homonymes: Owner[] = [owner("a", "MARTIN", "Paul"), owner("b", "MARTIN", "Paul")];
    const [c] = rapprocherContacts([{ nom: "MARTIN Paul" }], homonymes);
    expect(c.statut).toBe("ambigu");
  });

  it("assigne un id stable par ordre d'apparition", () => {
    const out = rapprocherContacts([{ nom: "MARTIN Paul" }, { nom: "ZZZ" }], OWNERS);
    expect(out.map((c) => c.id)).toEqual(["contact-0", "contact-1"]);
  });

  it("aucun owner du tout -> tous inconnus", () => {
    const out = rapprocherContacts([{ nom: "MARTIN Paul" }], []);
    expect(out[0].statut).toBe("inconnu");
  });
});

describe("reciblerContact / marquerContact", () => {
  it("recibler pointe un autre owner et passe en 'sur'", () => {
    const base = rapprocherContacts([{ nom: "MARTIN" }], OWNERS);
    const maj = reciblerContact(base, "contact-0", "o3");
    expect(maj[0].ownerId).toBe("o3");
    expect(maj[0].statut).toBe("sur");
    // immuable : l'entree n'est pas mutee.
    expect(base[0].ownerId).toBe("o1");
  });

  it("marquer valide/ignore (additif) + fixe l'ownerId enrichi", () => {
    const base = rapprocherContacts([{ nom: "MARTIN Paul" }], OWNERS);
    expect(marquerContact(base, "contact-0", "valide", "o1")[0].traite).toBe("valide");
    expect(marquerContact(base, "contact-0", "ignore")[0].traite).toBe("ignore");
  });

  it("id inconnu -> no-op propre", () => {
    const base = rapprocherContacts([{ nom: "MARTIN Paul" }], OWNERS);
    expect(marquerContact(base, "contact-99", "ignore")).toEqual(base);
  });
});

describe("noteVigilanceAnnexe", () => {
  it("est classee en niveau 'vigilance'", () => {
    const note = noteVigilanceAnnexe("courrier", "contentieux en cours sur le lot 12");
    expect(classerNote(note).niveau).toBe("vigilance");
  });
});
