// Tests de la projection Outlook des dates CS/AG (increment 1bis). La date
// structuree de l'intranet reste LA source ; on verifie que l'agenda Outlook
// recoit le bon reflet (POST a la pose, PATCH a la re-pose / confirmation,
// DELETE a l'effacement) et que Graph en echec ne bloque JAMAIS l'intranet.
// Le routeur est mocke : faux repo confirmation (en memoire), faux referentiel
// copro, faux provider calendrier qui enregistre les appels.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";
import { titreProjectionOutlook } from "@/lib/domain/confirmation-evenement";
import type { Copropriete } from "@/lib/domain/copropriete";

// --- Etat partage des fakes (hoiste car vi.mock est hoiste par vitest) ----------
const etat = vi.hoisted(() => {
  const confirmations = new Map<string, Record<string, unknown>>();
  const appels = {
    creer: [] as {
      boite: string;
      sujet: string;
      debut: string;
      fin?: string;
      ressources?: string[];
      participants?: string[];
      lieu?: string;
    }[],
    patch: [] as {
      boite: string;
      eventId: string;
      titre?: string;
      debut?: string;
      fin?: string;
      ressources?: string[];
      participants?: string[];
      lieu?: string;
    }[],
    suppr: [] as { boite: string; eventId: string }[],
    setDate: [] as unknown[],
  };
  const cle = (c: string, t: string) => `${c}__${t}`;
  const ref = {
    confirmations,
    appels,
    cle,
    // Dates du referentiel copro (relues par confirmerEvenement cote serveur).
    datesCopro: { ag: undefined as string | undefined, cs: undefined as string | undefined },
    // Heures de reunion du referentiel (accompagnent la date relue).
    heuresCopro: { ag: undefined as string | undefined, cs: undefined as string | undefined },
    // Simule un Graph en panne (403 Access Policy, timeout...) : tout appel throw.
    graphEnPanne: false,
    reset() {
      confirmations.clear();
      appels.creer.length = 0;
      appels.patch.length = 0;
      appels.suppr.length = 0;
      appels.setDate.length = 0;
      ref.datesCopro = { ag: undefined, cs: undefined };
      ref.heuresCopro = { ag: undefined, cs: undefined };
      ref.graphEnPanne = false;
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getConfirmationEvenementRepository: () => ({
    async getPourCopros(codes: string[]) {
      return [...etat.confirmations.values()].filter((c) =>
        codes.includes(c.coproCode as string),
      );
    },
    async get(coproCode: string) {
      return [...etat.confirmations.values()].filter((c) => c.coproCode === coproCode);
    },
    async confirmer(coproCode: string, type: string, date: string, par: string) {
      const avant = etat.confirmations.get(etat.cle(coproCode, type));
      etat.confirmations.set(etat.cle(coproCode, type), {
        ...avant, // la projection Outlook survit (comme l'upsert SQL)
        coproCode,
        type,
        date,
        statut: "confirme",
        confirmePar: par,
      });
    },
    async proposer(coproCode: string, type: string, date: string) {
      const avant = etat.confirmations.get(etat.cle(coproCode, type));
      etat.confirmations.set(etat.cle(coproCode, type), {
        coproCode,
        type,
        date,
        statut: "a_confirmer",
        ...(avant?.outlookEventId
          ? { outlookEventId: avant.outlookEventId, outlookBoite: avant.outlookBoite }
          : {}),
        // Salle / vehicule / mode / collegues survivent a la re-proposition (comme l'upsert SQL / le mock reel).
        ...(avant?.salleEmail ? { salleEmail: avant.salleEmail } : {}),
        ...(avant?.vehiculeEmail ? { vehiculeEmail: avant.vehiculeEmail } : {}),
        ...(avant?.modeReunion ? { modeReunion: avant.modeReunion } : {}),
        ...(avant?.collaborateursEmails ? { collaborateursEmails: avant.collaborateursEmails } : {}),
      });
    },
    async enregistrerProjection(
      coproCode: string,
      type: string,
      eventId: string | null,
      boite: string | null,
    ) {
      const c = etat.confirmations.get(etat.cle(coproCode, type));
      if (!c) return false; // pas de ligne -> id non memorise (comme l'UPDATE SQL 0 ligne)
      if (eventId && boite) {
        c.outlookEventId = eventId;
        c.outlookBoite = boite;
      } else {
        delete c.outlookEventId;
        delete c.outlookBoite;
      }
      return true;
    },
    async enregistrerRessources(
      coproCode: string,
      type: string,
      salleEmail: string | null,
      vehiculeEmail: string | null,
    ) {
      const c = etat.confirmations.get(etat.cle(coproCode, type));
      if (!c) return;
      delete c.salleEmail;
      delete c.vehiculeEmail;
      if (salleEmail) c.salleEmail = salleEmail;
      if (vehiculeEmail) c.vehiculeEmail = vehiculeEmail;
    },
    async enregistrerModeReunion(coproCode: string, type: string, mode: string | null) {
      const c = etat.confirmations.get(etat.cle(coproCode, type));
      if (!c) return;
      delete c.modeReunion;
      if (mode) c.modeReunion = mode;
    },
    async enregistrerCollaborateurs(coproCode: string, type: string, emails: string[]) {
      const c = etat.confirmations.get(etat.cle(coproCode, type));
      if (!c) return;
      delete c.collaborateursEmails;
      if (emails.length > 0) c.collaborateursEmails = [...emails];
    },
  }),
  getCoproRepository: () => ({
    async findByCode(code: string) {
      return {
        code,
        ...(etat.datesCopro.ag
          ? {
              prochaineAg: {
                date: etat.datesCopro.ag,
                ...(etat.heuresCopro.ag ? { heure: etat.heuresCopro.ag } : {}),
              },
            }
          : {}),
        ...(etat.datesCopro.cs ? { prochaineCsDate: etat.datesCopro.cs } : {}),
        ...(etat.heuresCopro.cs ? { prochaineCsHeure: etat.heuresCopro.cs } : {}),
      } as unknown as Copropriete;
    },
    async setDateEvenement(...args: unknown[]) {
      etat.appels.setDate.push(args);
    },
    async list() {
      return [];
    },
  }),
  getCalendrierOutboundProvider: () => ({
    async creerEvenement(p: {
      boite: string;
      sujet: string;
      debut: string;
      fin?: string;
      ressources?: string[];
      participants?: string[];
      lieu?: string;
    }) {
      if (etat.graphEnPanne) throw new Error("Graph creer evenement 403");
      etat.appels.creer.push(p);
      return { id: `evt-${etat.appels.creer.length}` };
    },
    async mettreAJourEvenement(
      boite: string,
      eventId: string,
      patch: {
        titre?: string;
        debut?: string;
        fin?: string;
        ressources?: string[];
        participants?: string[];
        lieu?: string;
      },
    ) {
      if (etat.graphEnPanne) throw new Error("Graph mettre a jour evenement 403");
      etat.appels.patch.push({ boite, eventId, ...patch });
    },
    async supprimerEvenement(boite: string, eventId: string) {
      if (etat.graphEnPanne) throw new Error("Graph supprimer evenement 403");
      etat.appels.suppr.push({ boite, eventId });
    },
    async disponibiliteSalle() {
      return "inconnu" as const;
    },
  }),
}));

import { definirDateEvenement } from "@/lib/services/coproprietes/definir-date-evenement";
import { confirmerEvenement } from "@/lib/services/coproprietes/confirmation-evenement";
import {
  deprojeterEvenementOutlook,
  projeterEvenementOutlook,
} from "@/lib/services/coproprietes/projeter-evenement-outlook";

const BOITE = "remi@real31.fr";

function confirmation(code: string, type: string): ConfirmationEvenement | undefined {
  return etat.confirmations.get(etat.cle(code, type)) as ConfirmationEvenement | undefined;
}

beforeEach(() => {
  etat.reset();
  // Gates mail : le service est desormais gate par mailModuleActifPour(boite). On pose
  // MAIL_SOURCE=graph + MAIL_PILOTES vide (tous emails autorises) pour tester la logique
  // metier de projection sans dependre du rollout pilote.
  process.env.MAIL_SOURCE = "graph";
  process.env.MAIL_PILOTES = "";
});

describe("titreProjectionOutlook", () => {
  it("genere les titres avec les vrais accents (AG feminin, CS masculin)", () => {
    expect(titreProjectionOutlook("S024", "AG", "a_confirmer")).toBe("S024 : AG à confirmer");
    expect(titreProjectionOutlook("S024", "AG", "confirme")).toBe("S024 : AG confirmée");
    expect(titreProjectionOutlook("S024", "CS", "a_confirmer")).toBe("S024 : CS à confirmer");
    expect(titreProjectionOutlook("S024", "CS", "confirme")).toBe("S024 : CS confirmé");
  });
});

describe("pose d'une prochaine date (definirDateEvenement)", () => {
  it("cree l'evenement Outlook 'a confirmer' et memorise eventId + boite", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);

    expect(etat.appels.creer).toHaveLength(1);
    expect(etat.appels.creer[0]).toMatchObject({
      boite: BOITE,
      sujet: "S024 : AG à confirmer",
      debut: "2026-09-15",
    });
    const c = confirmation("S024", "AG");
    expect(c?.statut).toBe("a_confirmer");
    expect(c?.outlookEventId).toBe("evt-1");
    expect(c?.outlookBoite).toBe(BOITE);
  });

  it("re-poser la date DEPLACE l'evenement existant (PATCH), sans 2e POST", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);
    await definirDateEvenement("S024", "ag", "prochaine", "2026-10-01", "g1", BOITE);

    expect(etat.appels.creer).toHaveLength(1); // un seul POST, jamais de doublon
    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]).toMatchObject({
      boite: BOITE,
      eventId: "evt-1",
      titre: "S024 : AG à confirmer", // le titre repasse / reste "a confirmer"
      debut: "2026-10-01",
    });
    expect(confirmation("S024", "AG")?.outlookEventId).toBe("evt-1");
  });

  it("une date 'derniere' (correction du referentiel) ne projette rien", async () => {
    await definirDateEvenement("S024", "ag", "derniere", "2026-04-16", "g1", BOITE);
    expect(etat.appels.creer).toHaveLength(0);
    expect(etat.appels.patch).toHaveLength(0);
  });

  it("sans boite (email de session inconnu) et sans projection existante : pas d'appel Graph", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1");
    expect(etat.appels.creer).toHaveLength(0);
    // le statut intranet est bien persiste malgre tout
    expect(confirmation("S024", "AG")?.statut).toBe("a_confirmer");
  });
});

describe("confirmation (confirmerEvenement)", () => {
  it("renomme l'evenement projete en 'confirmée' (PATCH titre)", async () => {
    etat.datesCopro.ag = "2026-09-15";
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);
    const date = await confirmerEvenement("S024", "AG", "EL", "g1", BOITE);

    expect(date).toBe("2026-09-15");
    expect(confirmation("S024", "AG")?.statut).toBe("confirme");
    expect(etat.appels.creer).toHaveLength(1); // pas de 2e evenement
    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]).toMatchObject({
      eventId: "evt-1",
      titre: "S024 : AG confirmée",
      debut: "2026-09-15",
    });
  });

  it("sans projection existante, confirmer cree l'evenement directement 'confirmé' (CS)", async () => {
    etat.datesCopro.cs = "2026-11-05";
    await confirmerEvenement("S031", "CS", "EL", "g1", BOITE);

    expect(etat.appels.creer).toHaveLength(1);
    expect(etat.appels.creer[0]).toMatchObject({
      sujet: "S031 : CS confirmé",
      debut: "2026-11-05",
    });
  });
});

describe("effacement de la date (RAZ)", () => {
  it("supprime l'evenement Outlook et efface la projection en base", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);
    await definirDateEvenement("S024", "ag", "prochaine", "", "g1", BOITE);

    expect(etat.appels.suppr).toHaveLength(1);
    expect(etat.appels.suppr[0]).toEqual({ boite: BOITE, eventId: "evt-1" });
    const c = confirmation("S024", "AG");
    expect(c?.outlookEventId).toBeUndefined();
    expect(c?.outlookBoite).toBeUndefined();
  });

  it("sans projection enregistree, effacer ne tente aucun DELETE", async () => {
    await deprojeterEvenementOutlook("S024", "AG");
    expect(etat.appels.suppr).toHaveLength(0);
  });
});

describe("degradation propre (Outlook ne bloque jamais l'intranet)", () => {
  it("Graph en echec a la pose : la date et le statut sont quand meme persistes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    etat.graphEnPanne = true;

    await expect(
      definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE),
    ).resolves.toBeUndefined();

    const c = confirmation("S024", "AG");
    expect(c?.statut).toBe("a_confirmer");
    expect(c?.date).toBe("2026-09-15");
    expect(c?.outlookEventId).toBeUndefined(); // pas de projection fantome
    expect(warn).toHaveBeenCalled();
    // warn SANS PII : ni email, ni date - code copro + type seulement
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(BOITE);
    warn.mockRestore();
  });

  it("Graph en echec a la confirmation : le statut confirme est quand meme persiste", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    etat.datesCopro.ag = "2026-09-15";
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);
    etat.graphEnPanne = true;

    const date = await confirmerEvenement("S024", "AG", "EL", "g1", BOITE);

    expect(date).toBe("2026-09-15");
    expect(confirmation("S024", "AG")?.statut).toBe("confirme");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("Graph en echec a l'effacement : la projection reste memorisee (retentee au prochain geste)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-15", "g1", BOITE);
    etat.graphEnPanne = true;

    await expect(deprojeterEvenementOutlook("S024", "AG")).resolves.toBeUndefined();
    expect(confirmation("S024", "AG")?.outlookEventId).toBe("evt-1");
    warn.mockRestore();
  });

  it("projeter directement sans provider fonctionnel n'a jamais d'effet de bord bloquant", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    etat.graphEnPanne = true;
    await expect(
      projeterEvenementOutlook("S024", "AG", "2026-09-15", "a_confirmer", BOITE),
    ).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe("heure de reunion (evenement timed vs journee entiere)", () => {
  it("date + heure -> POST avec un debut datetime et une fin +2h (evenement timed)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE);

    expect(etat.appels.creer).toHaveLength(1);
    expect(etat.appels.creer[0]).toMatchObject({
      debut: "2026-09-07T18:00:00",
      fin: "2026-09-07T20:00:00", // debut + DUREE_REUNION_HEURES (2h)
    });
    // La confirmation ne porte que sur le JOUR (pas l'heure).
    expect(confirmation("S024", "AG")?.date).toBe("2026-09-07");
  });

  it("passage de minuit : 23:00 + 2h -> fin le lendemain a 01:00", async () => {
    await definirDateEvenement("S031", "cs", "prochaine", "2026-09-07T23:00:00", "g1", BOITE);

    expect(etat.appels.creer[0]).toMatchObject({
      debut: "2026-09-07T23:00:00",
      fin: "2026-09-08T01:00:00",
    });
  });

  it("date sans heure -> POST journee entiere (aucune fin transmise)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07", "g1", BOITE);

    expect(etat.appels.creer[0]?.debut).toBe("2026-09-07");
    expect(etat.appels.creer[0]?.fin).toBeUndefined();
  });

  it("re-poser avec une heure DEPLACE l'evenement en timed (PATCH debut + fin +2h)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07", "g1", BOITE);
    await definirDateEvenement("S024", "ag", "prochaine", "2026-10-01T18:30:00", "g1", BOITE);

    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]).toMatchObject({
      debut: "2026-10-01T18:30:00",
      fin: "2026-10-01T20:30:00",
    });
  });

  it("confirmer recompose date + heure du referentiel pour la projection timed", async () => {
    etat.datesCopro.ag = "2026-09-07";
    etat.heuresCopro.ag = "18:00";
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE);
    const date = await confirmerEvenement("S024", "AG", "EL", "g1", BOITE);

    expect(date).toBe("2026-09-07"); // renvoie la date pure
    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]).toMatchObject({
      titre: "S024 : AG confirmée",
      debut: "2026-09-07T18:00:00",
      fin: "2026-09-07T20:00:00",
    });
  });
});

describe("reservation de salle / vehicule (ressources de l'evenement)", () => {
  const SALLE = "real31lgc@real31.fr";
  const ZOE = "zoe@real31.fr";

  it("pose avec salle + ZOE : le POST attache les deux ressources", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      salleEmail: SALLE,
      vehiculeEmail: ZOE,
    });

    expect(etat.appels.creer).toHaveLength(1);
    expect(etat.appels.creer[0]?.ressources).toEqual([SALLE, ZOE]);
    // Les ressources sont aussi persistees avec la confirmation.
    const c = confirmation("S024", "AG");
    expect(c?.salleEmail).toBe(SALLE);
    expect(c?.vehiculeEmail).toBe(ZOE);
  });

  it("pose sans salle : aucune ressource transmise", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      salleEmail: null,
      vehiculeEmail: null,
    });
    expect(etat.appels.creer[0]?.ressources).toBeUndefined();
  });

  it("re-poser conserve les ressources (PATCH avec la liste des salles / vehicules)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      salleEmail: SALLE,
      vehiculeEmail: ZOE,
    });
    // Re-pose SANS repasser les ressources : elles survivent (persistees), donc rejouees.
    await definirDateEvenement("S024", "ag", "prochaine", "2026-10-01T18:00:00", "g1", BOITE, {
      salleEmail: SALLE,
      vehiculeEmail: ZOE,
    });

    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]?.ressources).toEqual([SALLE, ZOE]);
  });

  it("confirmer conserve les ressources persistees (PATCH ressources)", async () => {
    etat.datesCopro.ag = "2026-09-07";
    etat.heuresCopro.ag = "18:00";
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      salleEmail: SALLE,
      vehiculeEmail: null,
    });
    await confirmerEvenement("S024", "AG", "EL", "g1", BOITE);

    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]?.ressources).toEqual([SALLE]);
  });
});

describe("mode de reunion -> lieu Outlook (bonus)", () => {
  const SALLE = "real31lgc@real31.fr";

  it("mode visio : le lieu de l'evenement est 'Visio'", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      modeReunion: "visio",
    });
    expect(etat.appels.creer[0]?.lieu).toBe("Visio");
  });

  it("mode presentiel avec salle : le lieu est le libelle de la salle", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      salleEmail: SALLE,
      modeReunion: "presentiel",
    });
    // Libelle depuis RESSOURCES_REAL31 (pas l'email brut).
    expect(etat.appels.creer[0]?.lieu).toBe("LGC - Salle de reunions");
  });

  it("sans mode ni salle : aucun lieu transmis (inchange)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE);
    expect(etat.appels.creer[0]?.lieu).toBeUndefined();
  });
});

describe("anti-doublon : jamais deux evenements pour une meme date", () => {
  it("evenement cree mais id non memorise (ligne absente) : on le SUPPRIME (pas d'orphelin)", async () => {
    // Projection directe SANS ligne de confirmation en base (simule proposer en echec /
    // colonne perdue) : l'id ne peut pas etre memorise -> l'evenement cree serait
    // introuvable au prochain geste (doublon). Il doit etre supprime dans la foulee.
    await projeterEvenementOutlook("S099", "AG", "2026-09-15", "a_confirmer", BOITE);

    expect(etat.appels.creer).toHaveLength(1);
    expect(etat.appels.suppr).toHaveLength(1);
    expect(etat.appels.suppr[0]).toEqual({ boite: BOITE, eventId: "evt-1" });
    expect(confirmation("S099", "AG")).toBeUndefined(); // aucune projection fantome
  });

  it("deux gestes sur une ligne absente : chaque evenement est nettoye (aucune accumulation)", async () => {
    await projeterEvenementOutlook("S099", "AG", "2026-09-15", "a_confirmer", BOITE);
    await projeterEvenementOutlook("S099", "AG", "2026-10-01", "a_confirmer", BOITE);

    // 2 creations tentees, 2 suppressions : au pire zero evenement, jamais deux.
    expect(etat.appels.creer).toHaveLength(2);
    expect(etat.appels.suppr).toHaveLength(2);
  });

  it("id connu mais boite perdue (etat incoherent) : on supprime l'ancien AVANT de recreer", async () => {
    // Ligne avec un id d'evenement mais SANS boite (ne peut pas etre PATCHee).
    etat.confirmations.set(etat.cle("S050", "AG"), {
      coproCode: "S050",
      type: "AG",
      date: "2026-09-15",
      statut: "a_confirmer",
      outlookEventId: "vieux-evt",
    });

    await projeterEvenementOutlook("S050", "AG", "2026-10-01", "a_confirmer", BOITE);

    // L'ancien evenement est supprime, puis un seul nouveau est cree (jamais deux).
    expect(etat.appels.suppr).toContainEqual({ boite: BOITE, eventId: "vieux-evt" });
    expect(etat.appels.creer).toHaveLength(1);
  });
});

describe("salle visible dans le rendez-vous du gestionnaire (lieu au PATCH)", () => {
  const SALLE = "real31lgc@real31.fr";

  it("re-poser reflete la salle dans le lieu de l'evenement (location suit l'etat)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      salleEmail: SALLE,
      modeReunion: "presentiel",
    });
    await definirDateEvenement("S024", "ag", "prochaine", "2026-10-01T18:00:00", "g1", BOITE, {
      salleEmail: SALLE,
      modeReunion: "presentiel",
    });

    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]?.lieu).toBe("LGC - Salle de reunions");
    expect(etat.appels.patch[0]?.ressources).toEqual([SALLE]);
  });

  it("retirer la salle : PATCH ressources [] ET lieu vide (l'ancien lieu ne reste pas)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      salleEmail: SALLE,
      modeReunion: "presentiel",
    });
    await definirDateEvenement("S024", "ag", "prochaine", "2026-10-01T18:00:00", "g1", BOITE, {
      salleEmail: null,
      vehiculeEmail: null,
      modeReunion: null,
    });

    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]?.ressources).toEqual([]);
    expect(etat.appels.patch[0]?.lieu).toBe("");
  });
});

describe("collaborateurs associes (participants de l'evenement)", () => {
  const COLLEGUE1 = "emmanuel@real31.fr";
  const COLLEGUE2 = "dimitri@real31.fr";

  it("pose avec collegues : le POST les attache en participants ET les persiste", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      collaborateursEmails: [COLLEGUE1, COLLEGUE2],
    });

    expect(etat.appels.creer).toHaveLength(1);
    expect(etat.appels.creer[0]?.participants).toEqual([COLLEGUE1, COLLEGUE2]);
    expect(confirmation("S024", "AG")?.collaborateursEmails).toEqual([COLLEGUE1, COLLEGUE2]);
  });

  it("pose sans collegue : aucun participant transmis", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      collaborateursEmails: [],
    });
    expect(etat.appels.creer[0]?.participants).toBeUndefined();
  });

  it("re-poser conserve les collegues (PATCH participants)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      collaborateursEmails: [COLLEGUE1],
    });
    await definirDateEvenement("S024", "ag", "prochaine", "2026-10-01T18:00:00", "g1", BOITE, {
      collaborateursEmails: [COLLEGUE1],
    });

    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]?.participants).toEqual([COLLEGUE1]);
  });

  it("retirer les collegues : PATCH participants [] (ils sont desinvites)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      collaborateursEmails: [COLLEGUE1, COLLEGUE2],
    });
    await definirDateEvenement("S024", "ag", "prochaine", "2026-10-01T18:00:00", "g1", BOITE, {
      collaborateursEmails: [],
    });

    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]?.participants).toEqual([]);
  });

  it("confirmer conserve les collegues persistes (PATCH participants)", async () => {
    etat.datesCopro.ag = "2026-09-07";
    etat.heuresCopro.ag = "18:00";
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-07T18:00:00", "g1", BOITE, {
      collaborateursEmails: [COLLEGUE1],
    });
    await confirmerEvenement("S024", "AG", "EL", "g1", BOITE);

    expect(etat.appels.patch).toHaveLength(1);
    expect(etat.appels.patch[0]?.participants).toEqual([COLLEGUE1]);
    expect(etat.appels.patch[0]?.titre).toBe("S024 : AG confirmée");
  });
});
