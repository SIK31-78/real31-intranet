// Tests des CRENEAUX DE TRAVAIL derives d'une date d'AG (Mise sous pli J-31 10h-12h,
// RELANCE DATE AG J-7 10h-10h30). La date d'AG de l'intranet reste LA source ; on
// verifie que l'agenda recoit le bon reflet (2 POST a la pose, 2 PATCH a la re-pose -
// JAMAIS de 2e POST -, 2 DELETE a l'effacement), que le CS n'a aucun creneau, et que
// Graph en echec ne bloque JAMAIS l'intranet.
// Modele : projeter-evenement-outlook.test.ts (routeur mocke, faux providers).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";

const etat = vi.hoisted(() => {
  // Memoire des creneaux : cle CODE__ROLE (comme intranet_projections_outlook).
  const projections = new Map<string, Record<string, unknown>>();
  const confirmations = new Map<string, Record<string, unknown>>();
  const appels = {
    creer: [] as { boite: string; sujet: string; debut: string; fin?: string; participants?: string[] }[],
    patch: [] as { boite: string; eventId: string; titre?: string; debut?: string; fin?: string; participants?: string[] }[],
    suppr: [] as { boite: string; eventId: string }[],
    dispo: [] as unknown[],
  };
  const ref = {
    projections,
    confirmations,
    appels,
    cle: (c: string, r: string) => `${c}__${r}`,
    datesCopro: { ag: undefined as string | undefined },
    heuresCopro: { ag: undefined as string | undefined },
    graphEnPanne: false,
    /** Simule la table intranet_projections_outlook absente (SQL pas lance). */
    memoireEnPanne: false,
    reset() {
      projections.clear();
      confirmations.clear();
      appels.creer.length = 0;
      appels.patch.length = 0;
      appels.suppr.length = 0;
      appels.dispo.length = 0;
      ref.datesCopro = { ag: undefined };
      ref.heuresCopro = { ag: undefined };
      ref.graphEnPanne = false;
      ref.memoireEnPanne = false;
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getProjectionsOutlookRepository: () => ({
    async get(coproCode: string) {
      if (etat.memoireEnPanne) return [];
      return [...etat.projections.values()].filter((p) => p.coproCode === coproCode);
    },
    async enregistrerProjection(
      coproCode: string,
      role: string,
      eventId: string | null,
      boite: string | null,
    ) {
      if (etat.memoireEnPanne) return false; // table absente -> rien memorise
      etat.projections.set(etat.cle(coproCode, role), {
        coproCode,
        role,
        ...(eventId && boite ? { outlookEventId: eventId, outlookBoite: boite } : {}),
      });
      return true;
    },
  }),
  getConfirmationEvenementRepository: () => ({
    async get(coproCode: string) {
      return [...etat.confirmations.values()].filter((c) => c.coproCode === coproCode);
    },
    async getPourCopros() {
      return [];
    },
    async confirmer(coproCode: string, type: string, date: string, par: string) {
      const avant = etat.confirmations.get(etat.cle(coproCode, type));
      etat.confirmations.set(etat.cle(coproCode, type), {
        ...avant,
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
        ...avant,
        coproCode,
        type,
        date,
        statut: "a_confirmer",
      });
    },
    async enregistrerProjection() {
      return true;
    },
    async enregistrerRessources() {},
    async enregistrerModeReunion() {},
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
      } as unknown as Copropriete;
    },
    async setDateEvenement() {},
    async list() {
      return [];
    },
  }),
  getCalendrierOutboundProvider: () => ({
    async creerEvenement(p: { boite: string; sujet: string; debut: string; fin?: string; participants?: string[] }) {
      if (etat.graphEnPanne) throw new Error("Graph creer evenement 403");
      etat.appels.creer.push(p);
      return { id: `evt-${etat.appels.creer.length}` };
    },
    async mettreAJourEvenement(boite: string, eventId: string, patch: Record<string, unknown>) {
      if (etat.graphEnPanne) throw new Error("Graph mettre a jour evenement 403");
      etat.appels.patch.push({ boite, eventId, ...patch });
    },
    async supprimerEvenement(boite: string, eventId: string) {
      if (etat.graphEnPanne) throw new Error("Graph supprimer evenement 403");
      etat.appels.suppr.push({ boite, eventId });
    },
    async disponibiliteSalle(...args: unknown[]) {
      etat.appels.dispo.push(args);
      return "inconnu" as const;
    },
  }),
}));

import { definirDateEvenement } from "@/lib/services/coproprietes/definir-date-evenement";
import { confirmerEvenement } from "@/lib/services/coproprietes/confirmation-evenement";
import {
  deprojeterCreneauxAg,
  projeterCreneauxAg,
} from "@/lib/services/coproprietes/projeter-creneaux-ag";
import { creneauxAg } from "@/lib/domain/jalons-ag/creneaux";

const BOITE = "remi@real31.fr";
// AG le mardi 15 septembre 2026. J-31 = 15 aout 2026 (SAMEDI, et le 15 aout est ferie)
// -> recule au vendredi 14 aout. J-7 = mardi 8 septembre 2026 (jour ouvre, inchange).
const AG = "2026-09-15";
const MISE_SOUS_PLI = "2026-08-14";
const RELANCE = "2026-09-08";

// Poser une date d'AG projette AUSSI l'evenement de l'AG lui-meme (chaine existante,
// meme faux provider). On ne compte donc QUE les creneaux derives : leur sujet porte un
// tiret ("S024 - Mise sous pli"), la projection AG/CS un deux-points ("S024 : AG à confirmer").
const estCreneau = (sujet?: string): boolean => Boolean(sujet && !sujet.includes(" : "));
/** POST de creneaux, du plus ancien au plus recent. */
const creerCreneaux = () => etat.appels.creer.filter((c) => estCreneau(c.sujet));
/** PATCH de creneaux. */
const patchCreneaux = () => etat.appels.patch.filter((p) => estCreneau(p.titre));
/** Les sujets des creneaux crees, dans l'ordre. */
const sujets = () => creerCreneaux().map((c) => c.sujet);
/** id Graph attribue au creneau `sujet` (le faux provider rend evt-<rang de creation>). */
const idDe = (sujet: string): string | undefined => {
  const i = etat.appels.creer.findIndex((c) => c.sujet === sujet);
  return i < 0 ? undefined : `evt-${i + 1}`;
};

beforeEach(() => {
  etat.reset();
});

describe("creneauxAg (domaine pur)", () => {
  it("derive les 2 creneaux des jalons CONVOC et RELANCE_POUVOIRS", () => {
    const c = creneauxAg("S024", AG);
    expect(c.map((x) => x.role)).toEqual(["MISE_SOUS_PLI", "RELANCE_DATE_AG"]);
  });

  it("sujets exactement comme demande (tiret, RELANCE DATE AG en capitales)", () => {
    const c = creneauxAg("S024", AG);
    expect(c[0]?.sujet).toBe("S024 - Mise sous pli");
    expect(c[1]?.sujet).toBe("S024 - RELANCE DATE AG");
  });

  it("horaires : mise sous pli 10h-12h, relance 10h-10h30", () => {
    const c = creneauxAg("S024", AG);
    expect(c[0]).toMatchObject({ debut: `${MISE_SOUS_PLI}T10:00:00`, fin: `${MISE_SOUS_PLI}T12:00:00` });
    expect(c[1]).toMatchObject({ debut: `${RELANCE}T10:00:00`, fin: `${RELANCE}T10:30:00` });
  });

  it("les cibles sont reculees au jour ouvre (J-31 tombait un samedi ferie du 15 aout)", () => {
    const c = creneauxAg("S024", AG);
    // 2026-08-15 = samedi ET Assomption -> recule au vendredi 14.
    expect(c[0]?.debut.slice(0, 10)).toBe("2026-08-14");
    const jour = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
    for (const creneau of c) {
      const j = jour(creneau.debut.slice(0, 10));
      expect(j).not.toBe(0);
      expect(j).not.toBe(6);
    }
  });

  it("l'heure de l'AG n'entre pas dans le calcul (seul le jour compte)", () => {
    expect(creneauxAg("S024", `${AG}T18:00:00`)).toEqual(creneauxAg("S024", AG));
  });
});

describe("pose d'une date d'AG", () => {
  it("cree les 2 creneaux et memorise les 2 (eventId + boite) par role", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);

    expect(creerCreneaux()).toHaveLength(2);
    expect(sujets()).toEqual(["S024 - Mise sous pli", "S024 - RELANCE DATE AG"]);
    expect(creerCreneaux()[0]).toMatchObject({
      boite: BOITE,
      debut: `${MISE_SOUS_PLI}T10:00:00`,
      fin: `${MISE_SOUS_PLI}T12:00:00`,
    });
    expect(creerCreneaux()[1]).toMatchObject({
      boite: BOITE,
      debut: `${RELANCE}T10:00:00`,
      fin: `${RELANCE}T10:30:00`,
    });
    expect(etat.projections.get(etat.cle("S024", "MISE_SOUS_PLI"))).toMatchObject({
      outlookEventId: idDe("S024 - Mise sous pli"),
      outlookBoite: BOITE,
    });
    expect(etat.projections.get(etat.cle("S024", "RELANCE_DATE_AG"))).toMatchObject({
      outlookEventId: idDe("S024 - RELANCE DATE AG"),
      outlookBoite: BOITE,
    });
  });

  it("aucune salle ni vehicule : ce ne sont pas des reunions", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE, {
      salleEmail: "real31lgc@real31.fr",
      vehiculeEmail: "zoe@real31.fr",
    });
    for (const c of creerCreneaux()) {
      expect(c).not.toHaveProperty("ressources");
    }
  });

  it("la disponibilite ne bloque pas : aucun controle de dispo n'est declenche", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);
    expect(etat.appels.dispo).toHaveLength(0);
    expect(creerCreneaux()).toHaveLength(2); // poses malgre tout
  });

  it("invite les collegues deja invites a l'AG (participants)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE, {
      collaborateursEmails: ["emmanuel@real31.fr"],
    });
    expect(creerCreneaux()[0]?.participants).toEqual(["emmanuel@real31.fr"]);
    expect(creerCreneaux()[1]?.participants).toEqual(["emmanuel@real31.fr"]);
  });

  it("sans collegue : aucun participant transmis (l'agenda du gestionnaire suffit)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);
    expect(creerCreneaux()[0]?.participants).toBeUndefined();
  });

  it("sans boite (email de session inconnu) : aucun creneau pose", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1");
    expect(creerCreneaux()).toHaveLength(0);
  });

  it("une date 'derniere' (correction du referentiel) ne projette aucun creneau", async () => {
    await definirDateEvenement("S024", "ag", "derniere", "2026-04-16", "g1", BOITE);
    expect(creerCreneaux()).toHaveLength(0);
  });
});

describe("CS : aucun creneau derive (c'est une regle AG)", () => {
  it("poser une date de CS ne cree aucun creneau", async () => {
    await definirDateEvenement("S031", "cs", "prochaine", AG, "g1", BOITE);
    expect(creerCreneaux()).toHaveLength(0); // seul l'evenement du CS lui-meme est pose
    expect(etat.projections.size).toBe(0);
  });

  it("effacer une date de CS ne supprime aucun creneau", async () => {
    await definirDateEvenement("S031", "cs", "prochaine", "", "g1", BOITE);
    expect(etat.appels.suppr).toHaveLength(0);
  });

  it("confirmer un CS ne cree aucun creneau", async () => {
    etat.datesCopro.ag = AG; // meme si la copro a une AG, confirmer le CS n'y touche pas
    await confirmerEvenement("S031", "CS", "EL", "g1", BOITE);
    expect(etat.projections.size).toBe(0);
  });
});

describe("deplacement de la date d'AG (LE test anti-doublon)", () => {
  it("re-poser DEPLACE les 2 MEMES evenements (PATCH), jamais de 2e POST", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);
    // AG deplacee du 15 au 22 septembre : la cle (copro, role) n'a pas de date, donc on
    // retrouve les memes evenements. Avec une cle datee, evt-1/evt-2 seraient orphelins.
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-22", "g1", BOITE);

    expect(creerCreneaux()).toHaveLength(2); // 2 POST au total, jamais 4
    expect(patchCreneaux()).toHaveLength(2);
    expect(patchCreneaux().map((p) => p.eventId)).toEqual([
      idDe("S024 - Mise sous pli"),
      idDe("S024 - RELANCE DATE AG"),
    ]);
    expect(etat.appels.suppr).toHaveLength(0); // rien d'abandonne derriere
  });

  it("les cibles se recalculent au deplacement (decalage jour ouvre compris)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);
    await definirDateEvenement("S024", "ag", "prochaine", "2026-09-22", "g1", BOITE);

    // AG 2026-09-22 : J-31 = 2026-08-22 (samedi) -> vendredi 21 ; J-7 = 2026-09-15 (mardi).
    expect(patchCreneaux()[0]).toMatchObject({
      titre: "S024 - Mise sous pli",
      debut: "2026-08-21T10:00:00",
      fin: "2026-08-21T12:00:00",
    });
    expect(patchCreneaux()[1]).toMatchObject({
      titre: "S024 - RELANCE DATE AG",
      debut: "2026-09-15T10:00:00",
      fin: "2026-09-15T10:30:00",
    });
  });

  it("confirmer l'AG re-projette les memes creneaux (PATCH, aucun doublon)", async () => {
    etat.datesCopro.ag = AG;
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);
    await confirmerEvenement("S024", "AG", "EL", "g1", BOITE);

    expect(creerCreneaux()).toHaveLength(2);
    expect(patchCreneaux()).toHaveLength(2);
    expect(patchCreneaux().map((p) => p.eventId)).toEqual([
      idDe("S024 - Mise sous pli"),
      idDe("S024 - RELANCE DATE AG"),
    ]);
  });
});

describe("effacement de la date d'AG / AG annulee", () => {
  it("supprime les 2 creneaux et efface la memoire", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);
    await definirDateEvenement("S024", "ag", "prochaine", "", "g1", BOITE);

    // 2 creneaux supprimes (+ l'evenement de l'AG lui-meme, chaine existante).
    expect(etat.appels.suppr).toContainEqual({
      boite: BOITE,
      eventId: idDe("S024 - Mise sous pli"),
    });
    expect(etat.appels.suppr).toContainEqual({
      boite: BOITE,
      eventId: idDe("S024 - RELANCE DATE AG"),
    });
    expect(etat.projections.get(etat.cle("S024", "MISE_SOUS_PLI"))?.outlookEventId).toBeUndefined();
    expect(etat.projections.get(etat.cle("S024", "RELANCE_DATE_AG"))?.outlookEventId).toBeUndefined();
  });

  it("sans projection memorisee, effacer ne tente aucun DELETE", async () => {
    await deprojeterCreneauxAg("S024");
    expect(etat.appels.suppr).toHaveLength(0);
  });

  it("re-poser apres effacement recree proprement (memoire videe, pas de PATCH fantome)", async () => {
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);
    await definirDateEvenement("S024", "ag", "prochaine", "", "g1", BOITE);
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);

    expect(creerCreneaux()).toHaveLength(4); // 2 + 2 recrees
    expect(patchCreneaux()).toHaveLength(0); // aucun PATCH sur des evenements supprimes
  });
});

describe("anti-doublon : jamais d'evenement orphelin", () => {
  it("memorisation en echec (table absente) : les 2 evenements crees sont SUPPRIMES", async () => {
    etat.memoireEnPanne = true;
    await projeterCreneauxAg("S024", AG, BOITE);

    expect(etat.appels.creer).toHaveLength(2);
    expect(etat.appels.suppr).toHaveLength(2); // au pire zero evenement, jamais deux
    expect(etat.appels.suppr).toContainEqual({ boite: BOITE, eventId: "evt-1" });
    expect(etat.appels.suppr).toContainEqual({ boite: BOITE, eventId: "evt-2" });
  });

  it("deux gestes avec memoire en panne : chaque evenement est nettoye (aucune accumulation)", async () => {
    etat.memoireEnPanne = true;
    await projeterCreneauxAg("S024", AG, BOITE);
    await projeterCreneauxAg("S024", "2026-09-22", BOITE);

    expect(etat.appels.creer).toHaveLength(4);
    expect(etat.appels.suppr).toHaveLength(4);
  });

  it("id connu mais boite perdue (etat incoherent) : on supprime l'ancien AVANT de recreer", async () => {
    etat.projections.set(etat.cle("S050", "MISE_SOUS_PLI"), {
      coproCode: "S050",
      role: "MISE_SOUS_PLI",
      outlookEventId: "vieux-evt",
    });

    await projeterCreneauxAg("S050", AG, BOITE);

    expect(etat.appels.suppr).toContainEqual({ boite: BOITE, eventId: "vieux-evt" });
    expect(etat.appels.creer).toHaveLength(2); // le remplacant + la relance, jamais deux MSP
    expect(sujets()).toEqual(["S050 - Mise sous pli", "S050 - RELANCE DATE AG"]);
  });
});

describe("degradation propre (Outlook ne bloque jamais l'intranet)", () => {
  it("Graph en echec a la pose : la date d'AG et le statut sont quand meme persistes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    etat.graphEnPanne = true;

    await expect(
      definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE),
    ).resolves.toBeUndefined();

    const c = etat.confirmations.get(etat.cle("S024", "AG"));
    expect(c?.statut).toBe("a_confirmer");
    expect(c?.date).toBe(AG);
    expect(etat.projections.size).toBe(0); // aucune projection fantome
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("warn SANS PII : ni email, ni date - code copro seulement", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    etat.graphEnPanne = true;
    await projeterCreneauxAg("S024", AG, BOITE);

    const messages = warn.mock.calls.map((c) => String(c[0])).join(" | ");
    expect(messages).toContain("S024");
    expect(messages).not.toContain(BOITE);
    expect(messages).not.toContain(AG);
    warn.mockRestore();
  });

  it("Graph en echec a l'effacement : la memoire reste (retentee au prochain geste)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);
    etat.graphEnPanne = true;

    await expect(deprojeterCreneauxAg("S024")).resolves.toBeUndefined();
    expect(etat.projections.get(etat.cle("S024", "MISE_SOUS_PLI"))?.outlookEventId).toBe(
      idDe("S024 - Mise sous pli"),
    );
    warn.mockRestore();
  });

  it("Graph en echec a la confirmation : le statut confirme est quand meme persiste", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    etat.datesCopro.ag = AG;
    await definirDateEvenement("S024", "ag", "prochaine", AG, "g1", BOITE);
    etat.graphEnPanne = true;

    await expect(confirmerEvenement("S024", "AG", "EL", "g1", BOITE)).resolves.toBe(AG);
    expect(etat.confirmations.get(etat.cle("S024", "AG"))?.statut).toBe("confirme");
    warn.mockRestore();
  });
});
