// Service d'annonce de l'AG par mailing ESTALE (REA-144) : routeur mocké, port mailing
// = un faux en mémoire. Aucun appel ESTALE.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";
import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";
import type { BrouillonMailing, MailingCree, MailingEstaleProvider } from "@/lib/ports/mailing-estale-provider";

const etat = vi.hoisted(() => ({
  copro: null as unknown,
  confirmations: [] as unknown[],
  mailing: null as unknown,
}));

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({ findByCode: async () => etat.copro }),
  getAgenceRepository: () => ({ listerAgences: async () => [{ id: "ag-lgc", code: "LGC" }] }),
  getMailingEstaleProvider: () => etat.mailing,
}));
vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({ exigerPerimetre: async () => undefined }));
vi.mock("@/lib/services/coproprietes/confirmation-evenement", () => ({
  getConfirmations: async () => etat.confirmations,
}));

import { apercuAnnonceAg, creerAnnonceAg } from "./annonce-ag-mailing";

const AUTEUR = { id: "u1", nomComplet: "Sekou Koma", email: "sekou.koma@real31.fr" };
const AUJ = "2026-10-12";

function copro(p: Partial<Copropriete> = {}): Copropriete {
  return {
    code: "SE999",
    source: "estale",
    agenceId: "ag-lgc",
    prochaineAg: { date: "2026-12-10", heure: "18:30", statut: "planifiee" },
    ...p,
  } as Copropriete;
}

// Faux port en mémoire (un service ne peut pas importer un adapter, règle boundaries).
class FauxMailing implements MailingEstaleProvider {
  readonly brouillons: BrouillonMailing[] = [];
  async creerBrouillon(b: BrouillonMailing): Promise<MailingCree> {
    this.brouillons.push(b);
    const reference = String(this.brouillons.length).padStart(5, "0");
    return { mailingId: `m-${reference}`, reference, titre: b.titre, destinatairesMail: 3, sansEmail: 0, coutEnvoi: 0, lien: "https://estale.app/" };
  }
}

let mock: FauxMailing;
const drapeau = process.env.ESTALE_MAILING_ACTIF;

beforeEach(() => {
  mock = new FauxMailing();
  etat.mailing = mock;
  etat.copro = copro();
  etat.confirmations = [];
  delete process.env.ESTALE_MAILING_ACTIF;
});
afterEach(() => {
  if (drapeau === undefined) delete process.env.ESTALE_MAILING_ACTIF;
  else process.env.ESTALE_MAILING_ACTIF = drapeau;
});

describe("apercuAnnonceAg", () => {
  it("copro Crypto : refus expliqué", async () => {
    etat.copro = copro({ source: "crypto" });
    const r = await apercuAnnonceAg("S104", AUTEUR, AUJ);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.raison).toMatch(/Crypto/);
  });

  it("sans date d'AG : refus", async () => {
    etat.copro = copro({ prochaineAg: undefined });
    const r = await apercuAnnonceAg("SE999", AUTEUR, AUJ);
    expect(!r.ok && r.raison).toMatch(/Aucune date/);
  });

  it("présentiel à l'agence LGC par défaut, titre daté", async () => {
    const r = await apercuAnnonceAg("SE999", AUTEUR, AUJ);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valeur.modele).toBe("presentiel");
    expect(r.valeur.titre).toBe("SE999 - Annonce de l'AG du 10/12/2026");
    expect(r.valeur.texte).toContain("13 rond-point du Souvenir Français");
    expect(r.valeur.dateLimiteISO).toBe("2026-10-26");
    expect(r.valeur.refusCreation).toBeNull(); // SE999 passe la garde
  });

  it("le mode et le lieu libre de la confirmation d'AG s'appliquent, pas ceux d'une autre date", async () => {
    const conf: ConfirmationEvenement = {
      coproCode: "SE999", type: "AG", date: "2026-12-10", statut: "confirme",
      modeReunion: "hybride", lieuLibre: "Salle des fêtes, 1 place X",
    };
    etat.confirmations = [conf];
    const r = await apercuAnnonceAg("SE999", AUTEUR, AUJ);
    expect(r.ok && r.valeur.modele).toBe("hybride");
    expect(r.ok && r.valeur.texte).toContain("En présentiel : Salle des fêtes, 1 place X");

    etat.confirmations = [{ ...conf, date: "2026-11-30" }];
    const r2 = await apercuAnnonceAg("SE999", AUTEUR, AUJ);
    expect(r2.ok && r2.valeur.modele).toBe("presentiel");
  });

  it("le gestionnaire peut forcer l'autre modèle", async () => {
    const r = await apercuAnnonceAg("SE999", AUTEUR, AUJ, "hybride");
    expect(r.ok && r.valeur.modele).toBe("hybride");
    expect(r.ok && r.valeur.modelePropose).toBe("presentiel");
  });

  it("annonce le refus de création d'une vraie copro tant que le drapeau est fermé", async () => {
    etat.copro = copro({ code: "S104" });
    const r = await apercuAnnonceAg("S104", AUTEUR, AUJ);
    expect(r.ok && r.valeur.refusCreation).toMatch(/ESTALE_MAILING_ACTIF/);
  });
});

describe("creerAnnonceAg", () => {
  it("refuse une vraie copro sans ESTALE_MAILING_ACTIF=1, sans appeler ESTALE", async () => {
    etat.copro = copro({ code: "S104" });
    const r = await creerAnnonceAg("S104", AUTEUR, AUJ);
    expect(r.ok).toBe(false);
    expect(mock.brouillons).toHaveLength(0);
  });

  it("SE999 : crée le brouillon avec le texte recalculé et la réponse au gestionnaire", async () => {
    const r = await creerAnnonceAg("SE999", AUTEUR, AUJ);
    expect(r.ok && r.valeur.reference).toBe("00001");
    expect(mock.brouillons[0]).toMatchObject({
      coproCode: "SE999",
      titre: "SE999 - Annonce de l'AG du 10/12/2026",
      repondreA: "sekou.koma@real31.fr",
    });
    expect(mock.brouillons[0]!.contenuHtml).toContain("<p>Madame, Monsieur,</p>");
  });

  it("vraie copro avec ESTALE_MAILING_ACTIF=1 : création permise", async () => {
    process.env.ESTALE_MAILING_ACTIF = "1";
    etat.copro = copro({ code: "S104" });
    const r = await creerAnnonceAg("S104", AUTEUR, AUJ);
    expect(r.ok).toBe(true);
  });

  it("une erreur ESTALE remonte en refus lisible", async () => {
    etat.mailing = { creerBrouillon: async () => { throw new Error("Oupss"); } };
    const r = await creerAnnonceAg("SE999", AUTEUR, AUJ);
    expect(!r.ok && r.raison).toMatch(/ESTALE a refusé.*Oupss/);
  });
});
