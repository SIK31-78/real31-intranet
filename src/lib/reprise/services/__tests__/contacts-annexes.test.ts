// Tests des decisions humaines sur les contacts d'annexe : validation (-> owner.modifier
// transactionnel) et ignore. Adapter memoire (aucun reseau). Donnees SYNTHETIQUES.
import { describe, expect, it } from "vitest";
import { DossierRepositoryMemoire } from "@/lib/reprise/adapters/memoire/dossier-repository-memoire";
import { validerContactAnnexeDossier, ignorerContactAnnexeDossier } from "../suivi-dossier";
import { creerDossier, type Dossier } from "@/lib/reprise/domain/dossier";
import type { ContactRapproche } from "@/lib/reprise/domain/rapprochement-contacts";

const NOW = "2026-07-16T10:00:00.000Z";

function dossierAvecContact(contact: ContactRapproche): Dossier {
  const d = creerDossier("S9999", "Copro test");
  d.jeu = {
    lots: [],
    cles: [],
    tantiemes: [],
    owners: [
      { id: "o1", civilite: "m", nom: "MARTIN", prenom: "Paul", pro: false },
      { id: "o2", civilite: "mme", nom: "NOVAK", prenom: "Elena", pro: false },
    ],
    attributions: [],
  };
  d.compteurs.contactsAnnexes = [contact];
  return d;
}

describe("validerContactAnnexeDossier", () => {
  it("ecrit email + telephone sur l'owner (via owner.modifier) et marque le contact valide", async () => {
    const d = dossierAvecContact({
      id: "contact-0",
      nom: "MARTIN Paul",
      email: "paul@example.test",
      telephone: "0600000000",
      ownerId: "o1",
      confiance: 1,
      statut: "sur",
    });
    const repo = new DossierRepositoryMemoire([d]);

    const r = await validerContactAnnexeDossier(repo, "S9999", "contact-0", "o1", NOW);
    const o1 = r.jeu!.owners.find((o) => o.id === "o1")!;
    expect(o1.email).toBe("paul@example.test");
    expect(o1.telPortable).toBe("0600000000");
    expect(r.contacts[0].traite).toBe("valide");

    // Persiste : relecture du dossier.
    const relu = await repo.obtenir("S9999");
    expect(relu!.jeu!.owners.find((o) => o.id === "o1")!.email).toBe("paul@example.test");
    expect(relu!.compteurs.contactsAnnexes![0].traite).toBe("valide");
  });

  it("peut ecrire sur un AUTRE owner (correction humaine)", async () => {
    const d = dossierAvecContact({
      id: "contact-0",
      nom: "MARTIN Paul",
      email: "paul@example.test",
      ownerId: "o1",
      confiance: 1,
      statut: "sur",
    });
    const repo = new DossierRepositoryMemoire([d]);
    const r = await validerContactAnnexeDossier(repo, "S9999", "contact-0", "o2", NOW);
    expect(r.jeu!.owners.find((o) => o.id === "o2")!.email).toBe("paul@example.test");
    expect(r.jeu!.owners.find((o) => o.id === "o1")!.email).toBeUndefined();
    expect(r.contacts[0].ownerId).toBe("o2");
  });

  it("refuse si le contact ne porte ni email ni telephone", async () => {
    const d = dossierAvecContact({ id: "contact-0", nom: "MARTIN Paul", ownerId: "o1", confiance: 1, statut: "sur" });
    const repo = new DossierRepositoryMemoire([d]);
    await expect(validerContactAnnexeDossier(repo, "S9999", "contact-0", "o1", NOW)).rejects.toThrow(/ni email ni telephone/i);
  });

  it("refuse un owner inconnu", async () => {
    const d = dossierAvecContact({ id: "contact-0", nom: "X", email: "x@example.test", confiance: 0, statut: "inconnu" });
    const repo = new DossierRepositoryMemoire([d]);
    await expect(validerContactAnnexeDossier(repo, "S9999", "contact-0", "zzz", NOW)).rejects.toThrow(/introuvable/i);
  });
});

describe("ignorerContactAnnexeDossier", () => {
  it("marque le contact ignore sans toucher au jeu", async () => {
    const d = dossierAvecContact({ id: "contact-0", nom: "X", email: "x@example.test", confiance: 0, statut: "inconnu" });
    const repo = new DossierRepositoryMemoire([d]);
    const contacts = await ignorerContactAnnexeDossier(repo, "S9999", "contact-0", NOW);
    expect(contacts[0].traite).toBe("ignore");
    const relu = await repo.obtenir("S9999");
    expect(relu!.jeu!.owners.every((o) => o.email === undefined)).toBe(true);
  });
});
