// Tests du bouton "Resynchroniser Outlook" (service). Routeur mocke : referentiel copro,
// confirmations et projections en memoire, faux provider calendrier qui enregistre les
// appels. On verifie que la date COURANTE est rejouee (evenement + creneaux AG), avec le
// bon statut, et qu'un echec Graph est RENDU au lieu d'etre avale.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => {
  const ref = {
    copro: null as Record<string, unknown> | null,
    confirmations: [] as Record<string, unknown>[],
    projections: new Map<string, Record<string, unknown>>(),
    creer: [] as { sujet: string; debut: string }[],
    patch: [] as { eventId: string; titre?: string; debut?: string }[],
    panne: null as string | null,
    reset() {
      ref.copro = { code: "S024", prochaineAg: { date: "2026-11-20", heure: "18:00" } };
      ref.confirmations = [];
      ref.projections.clear();
      ref.creer.length = 0;
      ref.patch.length = 0;
      ref.panne = null;
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async findByCode() {
      return etat.copro;
    },
  }),
  getConfirmationEvenementRepository: () => ({
    async get(code: string) {
      return etat.confirmations.filter((c) => c.coproCode === code);
    },
    async enregistrerProjection() {
      return true;
    },
  }),
  getProjectionsOutlookRepository: () => ({
    async get(code: string) {
      return [...etat.projections.values()].filter((p) => p.coproCode === code);
    },
    async enregistrerProjection(coproCode: string, role: string, id: string, boite: string) {
      etat.projections.set(role, { coproCode, role, outlookEventId: id, outlookBoite: boite });
      return true;
    },
  }),
  getCalendrierOutboundProvider: () => ({
    async creerEvenement(p: { sujet: string; debut: string }) {
      if (etat.panne) throw new Error(etat.panne);
      etat.creer.push(p);
      return { id: `evt-${etat.creer.length}` };
    },
    async mettreAJourEvenement(_b: string, eventId: string, patch: { titre?: string; debut?: string }) {
      if (etat.panne) throw new Error(etat.panne);
      etat.patch.push({ eventId, ...patch });
    },
    async supprimerEvenement() {},
  }),
}));

import { creneauxAg } from "@/lib/domain/jalons-ag/creneaux";
import { resynchroniserOutlook } from "./resynchroniser-outlook";

const BOITE = "remi@real31.fr";

beforeEach(() => {
  etat.reset();
  process.env.MAIL_SOURCE = "graph";
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("resynchroniserOutlook", () => {
  it("AG confirmee : re-PATCHe l'evenement a la date courante, titre 'confirmée', et les creneaux", async () => {
    etat.confirmations = [
      { coproCode: "S024", type: "AG", date: "2026-11-20", statut: "confirme", outlookEventId: "evt-ag", outlookBoite: BOITE },
    ];

    const r = await resynchroniserOutlook("S024", "AG", "g1", BOITE);

    expect(r).toEqual({ ok: true });
    expect(etat.patch[0]).toMatchObject({
      eventId: "evt-ag",
      titre: "S024 : AG confirmée",
      debut: "2026-11-20T18:00:00",
    });
    // Les creneaux derives de l'AG sont poses (autant que le domaine en definit).
    expect(etat.creer.length).toBe(creneauxAg("S024", "2026-11-20").length);
    expect(etat.creer.length).toBeGreaterThan(0);
  });

  it("confirmation portant sur une autre date : l'evenement repasse 'à confirmer'", async () => {
    etat.confirmations = [
      { coproCode: "S024", type: "AG", date: "2026-10-01", statut: "confirme", outlookEventId: "evt-ag", outlookBoite: BOITE },
    ];
    await resynchroniserOutlook("S024", "AG", "g1", BOITE);
    expect(etat.patch[0]?.titre).toBe("S024 : AG à confirmer");
  });

  it("CS : aucun creneau derive", async () => {
    etat.copro = { code: "S024", prochaineCsDate: "2026-10-05" };
    etat.confirmations = [{ coproCode: "S024", type: "CS", date: "2026-10-05", statut: "a_confirmer" }];
    const r = await resynchroniserOutlook("S024", "CS", "g1", BOITE);
    expect(r).toEqual({ ok: true });
    expect(etat.creer).toHaveLength(1);
    expect(etat.creer[0]).toMatchObject({ sujet: "S024 : CS à confirmer", debut: "2026-10-05" });
  });

  it("Graph en echec : l'erreur est RENDUE (code HTTP, sans extrait de reponse)", async () => {
    etat.confirmations = [
      { coproCode: "S024", type: "AG", date: "2026-11-20", statut: "confirme", outlookEventId: "evt-ag", outlookBoite: BOITE },
    ];
    etat.panne = "Graph mettre a jour evenement 403 : {\"error\":\"remi@real31.fr\"}";

    const r = await resynchroniserOutlook("S024", "AG", "g1", BOITE);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreur).toContain("403");
      expect(r.erreur).not.toContain(BOITE);
    }
  });

  it("sans date courante : rien a synchroniser", async () => {
    etat.copro = { code: "S024" };
    const r = await resynchroniserOutlook("S024", "AG", "g1", BOITE);
    expect(r).toEqual({ ok: false, erreur: "Aucune date à synchroniser." });
    expect(etat.creer).toHaveLength(0);
  });

  it("module Outlook inactif : message explicite, aucun appel", async () => {
    process.env.MAIL_SOURCE = "noop";
    const r = await resynchroniserOutlook("S024", "AG", "g1", BOITE);
    expect(r.ok).toBe(false);
    expect(etat.creer).toHaveLength(0);
    expect(etat.patch).toHaveLength(0);
  });
});
