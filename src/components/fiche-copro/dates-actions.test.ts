// Tests de l'action definirDateAg/Cs : OCCUPE = BLOQUANT cote SERVEUR (defense en
// profondeur, on ne fait pas confiance au client). Session, cloisonnement, services et
// router sont mockes ; le controle de dispo est mocke pour piloter refus / passage, et on
// CAPTURE le plan transmis pour verifier le cas replanification (creneau inchange ->
// aucune cible controlee, notre propre evenement Outlook ne bloque pas).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanControlesDispo } from "@/lib/domain/disponibilite-reunion";

const etat = vi.hoisted(() => {
  const ref = {
    // Session courante (null = deconnecte).
    session: { id: "g1", email: "remi@real31.fr", initiales: "RL", nomComplet: "Rémi" } as {
      id: string;
      email: string;
      initiales: string;
      nomComplet: string;
    } | null,
    // Cloisonnement : la copro appartient-elle au gestionnaire courant ?
    appartient: true,
    // Reponse du controle de dispo serveur (salle = dur, agenda = forcable) + plan capture.
    controle: { salle: null as string | null, agenda: null as string | null },
    planCapture: null as PlanControlesDispo | null,
    controlerAppels: 0,
    // Referentiel : copro renvoyee par findByCode (ancien creneau).
    copro: {} as Record<string, unknown>,
    // Confirmation existante (ancienne salle / anciens collegues).
    confirmations: [] as Record<string, unknown>[],
    // Ecritures.
    definirAppels: [] as unknown[][],
    reset() {
      ref.session = { id: "g1", email: "remi@real31.fr", initiales: "RL", nomComplet: "Rémi" };
      ref.appartient = true;
      ref.controle = { salle: null, agenda: null };
      ref.planCapture = null;
      ref.controlerAppels = 0;
      ref.copro = { code: "S024" };
      ref.confirmations = [];
      ref.definirAppels.length = 0;
    },
  };
  return ref;
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
}));
vi.mock("@/lib/services/coproprietes/copro-appartient", () => ({
  coproAppartient: async () => etat.appartient,
}));
vi.mock("@/lib/services/coproprietes/definir-date-evenement", () => ({
  definirDateEvenement: async (...args: unknown[]) => {
    etat.definirAppels.push(args);
  },
}));
vi.mock("@/lib/services/coproprietes/confirmation-evenement", () => ({
  getConfirmations: async () => etat.confirmations,
  confirmerEvenement: async () => null,
}));
vi.mock("@/lib/services/coproprietes/controler-dispo-reunion", () => ({
  controlerDisposReunion: async (
    _code: string,
    _type: string,
    _debut: string,
    _boite: string,
    plan: PlanControlesDispo,
  ) => {
    etat.controlerAppels += 1;
    etat.planCapture = plan;
    return etat.controle;
  },
}));
vi.mock("@/lib/services/supervision-ag/reporter-sans-date", () => ({
  reporterSupervisionSansDate: async () => undefined,
}));
vi.mock("@/lib/services/odj/saisir-champ-odj", () => ({
  reporterOdjSansDate: async () => undefined,
}));
vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async findByCode() {
      return etat.copro;
    },
  }),
  getGestionnaireRepository: () => ({
    async list() {
      return [
        { id: "g1", email: "remi@real31.fr", nomComplet: "Rémi" },
        { id: "g2", email: "emmanuel@real31.fr", nomComplet: "Emmanuel" },
        { id: "g3", email: "dimitri@real31.fr", nomComplet: "Dimitri" },
      ];
    },
  }),
  getCalendrierOutboundProvider: () => ({
    async disponibiliteSalle() {
      return "inconnu" as const;
    },
  }),
}));

import { definirDateAg } from "@/components/fiche-copro/dates-actions";

const SALLE = "real31lgc@real31.fr";
const COLLEGUE = "emmanuel@real31.fr";

beforeEach(() => {
  etat.reset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("definirDateAg - controle serveur : salle = DUR, agenda/collegue = FORCABLE", () => {
  it("SALLE occupee -> {ok:false} NON forcable, AUCUNE ecriture (blocage dur)", async () => {
    etat.controle = { salle: "La salle LGC est occupée sur ce créneau", agenda: null };
    const r = await definirDateAg("S024", "2026-09-15T18:00:00", "prochaine", SALLE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreur).toContain("La salle LGC est occupée");
      expect(r.forcable).toBeFalsy(); // une salle occupee ne se force jamais
    }
    expect(etat.definirAppels).toHaveLength(0);
  });

  it("AGENDA occupe SANS forcer -> {ok:false, forcable:true}, AUCUNE ecriture", async () => {
    etat.controle = { salle: null, agenda: "ton agenda est occupé sur ce créneau" };
    const r = await definirDateAg("S024", "2026-09-15T18:00:00", "prochaine", SALLE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.forcable).toBe(true);
      expect(r.erreur).toContain("agenda est occupé");
    }
    expect(etat.definirAppels).toHaveLength(0);
  });

  it("AGENDA occupe AVEC forcer=true -> {ok:true}, ecriture faite (on passe outre)", async () => {
    etat.controle = { salle: null, agenda: "ton agenda est occupé sur ce créneau" };
    const r = await definirDateAg(
      "S024",
      "2026-09-15T18:00:00",
      "prochaine",
      SALLE,
      undefined,
      undefined,
      [],
      true, // forcer
    );
    expect(r).toEqual({ ok: true });
    expect(etat.definirAppels).toHaveLength(1);
  });

  it("SALLE occupee AVEC forcer=true -> {ok:false} quand meme (dur, jamais forcable)", async () => {
    etat.controle = { salle: "La salle LGC est occupée sur ce créneau", agenda: null };
    const r = await definirDateAg(
      "S024",
      "2026-09-15T18:00:00",
      "prochaine",
      SALLE,
      undefined,
      undefined,
      [],
      true, // forcer NE contourne PAS la salle
    );
    expect(r.ok).toBe(false);
    expect(etat.definirAppels).toHaveLength(0);
  });

  it("controle en passage (tout null : libre / inconnu / panne) -> {ok:true}, ecriture faite", async () => {
    etat.controle = { salle: null, agenda: null };
    const r = await definirDateAg("S024", "2026-09-15T18:00:00", "prochaine", SALLE);
    expect(r).toEqual({ ok: true });
    expect(etat.controlerAppels).toBe(1);
    expect(etat.definirAppels).toHaveLength(1);
  });

  it("date SANS heure (journee entiere) : pas de creneau cadrable -> aucun controle, ecriture ok", async () => {
    const r = await definirDateAg("S024", "2026-09-15", "prochaine");
    expect(r).toEqual({ ok: true });
    expect(etat.controlerAppels).toBe(0);
  });

  it("date 'derniere' (correction du referentiel) : jamais de controle de dispo", async () => {
    const r = await definirDateAg("S024", "2026-04-16", "derniere");
    expect(r).toEqual({ ok: true });
    expect(etat.controlerAppels).toBe(0);
  });

  it("effacer la date (valeur vide) : aucun controle, deplanification ok", async () => {
    const r = await definirDateAg("S024", "", "prochaine");
    expect(r).toEqual({ ok: true });
    expect(etat.controlerAppels).toBe(0);
  });
});

describe("definirDateAg - replanification, creneau inchange (faux positif exclu)", () => {
  it("meme date+heure+salle+collegues : le plan transmis ne controle RIEN", async () => {
    etat.copro = {
      code: "S024",
      prochaineAg: { date: "2026-09-15", heure: "18:00", statut: "planifiee" },
    };
    etat.confirmations = [
      { coproCode: "S024", type: "AG", salleEmail: SALLE, collaborateursEmails: [COLLEGUE] },
    ];
    const r = await definirDateAg(
      "S024",
      "2026-09-15T18:00:00",
      "prochaine",
      SALLE,
      undefined,
      undefined,
      [COLLEGUE],
    );
    expect(r).toEqual({ ok: true });
    expect(etat.planCapture).toEqual({
      verifierAgenda: false,
      salleAverifier: null,
      collaborateursAverifier: [],
    });
  });

  it("le creneau bouge : le plan re-controle tout (agenda + salle + collegues)", async () => {
    etat.copro = {
      code: "S024",
      prochaineAg: { date: "2026-09-15", heure: "18:00", statut: "planifiee" },
    };
    etat.confirmations = [
      { coproCode: "S024", type: "AG", salleEmail: SALLE, collaborateursEmails: [COLLEGUE] },
    ];
    await definirDateAg("S024", "2026-10-01T18:00:00", "prochaine", SALLE, undefined, undefined, [
      COLLEGUE,
    ]);
    expect(etat.planCapture).toEqual({
      verifierAgenda: true,
      salleAverifier: SALLE,
      collaborateursAverifier: [COLLEGUE],
    });
  });
});

describe("definirDateAg - cloisonnement (l'action date reste fermee aux non-gestionnaires)", () => {
  it("copro hors perimetre (ex. un comptable qui tente) -> refus propre, aucune ecriture", async () => {
    vi.stubEnv("COPRO_SOURCE", "supabase");
    etat.appartient = false; // la copro ne releve pas du compte connecte
    const r = await definirDateAg("S024", "2026-09-15T18:00:00", "prochaine");
    expect(r).toEqual({ ok: false, erreur: "Copropriété hors de votre périmètre." });
    expect(etat.definirAppels).toHaveLength(0);
    expect(etat.controlerAppels).toBe(0);
  });

  it("session expiree -> refus propre", async () => {
    etat.session = null;
    const r = await definirDateAg("S024", "2026-09-15", "prochaine");
    expect(r).toEqual({ ok: false, erreur: "Session expirée, reconnectez-vous." });
  });
});
