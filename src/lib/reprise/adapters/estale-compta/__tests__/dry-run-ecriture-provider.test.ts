// Tests du dry-run compta : IDs deterministes, journal fidele a l'ordre d'appel, et le
// routeur qui ne rend l'adapter REEL que sous le double verrou (ESTALE_ECRITURE=reel +
// identifiants) - meme discipline que l'ecriture patrimoine.
import { afterEach, describe, expect, it } from "vitest";
import { DryRunEstaleComptaEcritureProvider } from "../dry-run-ecriture-provider";
import { getEstaleComptaEcritureProvider } from "@/lib/reprise/adapters/router";
import { ReelEstaleComptaEcritureProvider } from "../reel-ecriture-provider";

describe("DryRunEstaleComptaEcritureProvider", () => {
  it("ids deterministes + journal dans l'ordre d'appel", async () => {
    const dry = new DryRunEstaleComptaEcritureProvider();
    const e1 = await dry.creerEcriture({
      condoID: "c1",
      date: "2026-01-15",
      libelle: "A-nouveau 401",
      montant: 100,
      mouvement: "credit",
      journal: "carryforward",
      accountID: "acc-401",
    });
    const f1 = await dry.creerFournisseur({
      condoID: "c1",
      nom: "PLOMBERIE TEST",
      establishmentID: "etab-1",
      adresse: { postcode: "78600", city: "Maisons-Laffitte", country: "France" },
    });
    await dry.supprimerEcriture(e1.id);

    expect(e1.id).toBe("dry-ecriture-1");
    expect(f1.reference).toBe("F001");
    expect(dry.journal.map((j) => j.type)).toEqual([
      "creerEcriture",
      "creerFournisseur",
      "supprimerEcriture",
    ]);
  });

  it("deux instances repartent a zero (aucun etat partage)", async () => {
    const a = new DryRunEstaleComptaEcritureProvider();
    const b = new DryRunEstaleComptaEcritureProvider();
    const ea = await a.creerEcriture({
      condoID: "c1", date: "2026-01-15", libelle: "x", montant: 1,
      mouvement: "debit", journal: "general", accountID: "acc",
    });
    const eb = await b.creerEcriture({
      condoID: "c1", date: "2026-01-15", libelle: "y", montant: 2,
      mouvement: "credit", journal: "general", accountID: "acc",
    });
    expect(ea.id).toBe("dry-ecriture-1");
    expect(eb.id).toBe("dry-ecriture-1");
  });
});

describe("routeur - gate d'ecriture compta", () => {
  const sauvegarde = {
    ecriture: process.env.ESTALE_ECRITURE,
    email: process.env.ESTALE_EMAIL,
    motDePasse: process.env.ESTALE_PASSWORD,
  };
  afterEach(() => {
    if (sauvegarde.ecriture === undefined) delete process.env.ESTALE_ECRITURE;
    else process.env.ESTALE_ECRITURE = sauvegarde.ecriture;
    if (sauvegarde.email === undefined) delete process.env.ESTALE_EMAIL;
    else process.env.ESTALE_EMAIL = sauvegarde.email;
    if (sauvegarde.motDePasse === undefined) delete process.env.ESTALE_PASSWORD;
    else process.env.ESTALE_PASSWORD = sauvegarde.motDePasse;
  });

  it("DRY-RUN par defaut (ESTALE_ECRITURE absent), meme avec identifiants", () => {
    delete process.env.ESTALE_ECRITURE;
    process.env.ESTALE_EMAIL = "x@y.fr";
    process.env.ESTALE_PASSWORD = "secret";
    expect(getEstaleComptaEcritureProvider()).toBeInstanceOf(DryRunEstaleComptaEcritureProvider);
  });

  it("DRY-RUN si ESTALE_ECRITURE=reel mais identifiants absents", () => {
    process.env.ESTALE_ECRITURE = "reel";
    delete process.env.ESTALE_EMAIL;
    delete process.env.ESTALE_PASSWORD;
    expect(getEstaleComptaEcritureProvider()).toBeInstanceOf(DryRunEstaleComptaEcritureProvider);
  });

  it("REEL uniquement sous le double verrou", () => {
    process.env.ESTALE_ECRITURE = "reel";
    process.env.ESTALE_EMAIL = "x@y.fr";
    process.env.ESTALE_PASSWORD = "secret";
    expect(getEstaleComptaEcritureProvider()).toBeInstanceOf(ReelEstaleComptaEcritureProvider);
  });
});
