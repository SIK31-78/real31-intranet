// Tests de la CLE d'etat de l'ODJ : la lecture et l'ECRITURE doivent resoudre la MEME
// date d'AG pour un meme id d'URL.
//
// Regression verrouillee ici (perte silencieuse constatee en base le 2026-08-17) : depuis
// une URL sans date (/odj/S273), l'ecriture repliait sur la sentinelle 0001-01-01 pendant
// que la lecture repliait sur la prochaine AG de la copro. Tout ce qui etait saisi partait
// sur une ligne jamais relue -- sans erreur, sans rien a l'ecran. Le test 1 echoue sur
// l'ancien code (agDate = "0001-01-01"), le test 5 aussi (le verrou de cloture regardait
// la sentinelle et laissait modifier un ODJ pourtant clos).
//
// Session, cloisonnement, Estale et routeur sont mockes ; la table d'etat est un Map en
// memoire cle par (code, ag_date) -- exactement l'unicite de intranet_odj_champs.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => {
  const ecritures: { code: string; agDate: string; champId: string; valeur: string | null }[] = [];
  const lignes = new Map<string, { champId: string; valeur: string | null }[]>();
  const cle = (code: string, agDate: string) => `${code}::${agDate}`;
  const ref = {
    session: { id: "g1", email: "remi@real31.fr", initiales: "RL", nomComplet: "Rémi" } as {
      id: string;
      email: string;
      initiales: string;
      nomComplet: string;
    } | null,
    // Cloisonnement : la copro est-elle dans le perimetre du gestionnaire courant ?
    appartient: true,
    // Prochaine AG du referentiel ; undefined = copro sans date d'AG (cas legitime).
    prochaineAgDate: "2026-10-14" as string | undefined,
    ecritures,
    lignes,
    cle,
    reset() {
      ref.session = { id: "g1", email: "remi@real31.fr", initiales: "RL", nomComplet: "Rémi" };
      ref.appartient = true;
      ref.prochaineAgDate = "2026-10-14";
      ecritures.length = 0;
      lignes.clear();
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
// Estale et les confirmations d'evenement ne jouent aucun role dans la cle : neutralises.
vi.mock("@/lib/services/estale/donnees-copro-estale", () => ({
  donneesCoproEstale: async () => null,
}));
vi.mock("@/lib/services/coproprietes/confirmation-evenement", () => ({
  getConfirmations: async () => [],
}));
vi.mock("@/lib/adapters/router", () => ({
  getCoproRepository: () => ({
    async findByCode(code: string) {
      return {
        code,
        source: "supabase",
        nom: "Résidence des Tilleuls",
        adresse: { ligne1: "12 rue des Tilleuls", codePostal: "31000", ville: "Toulouse" },
        statut: "actif",
        lotsPrincipaux: 24,
        lotsAutres: 3,
        exercice: { debut: "01/01", fin: "31/12" },
        priseEnGestion: "mars 2018",
        equipe: [],
        ...(etat.prochaineAgDate
          ? { prochaineAg: { date: etat.prochaineAgDate, statut: "planifiee" } }
          : {}),
      };
    },
  }),
  // La cloture marque aussi le jalon ODJ_CS (cf. cloturer-odj) : hors sujet ici, on
  // se contente d'un repo inerte pour ne pas casser l'appel.
  getJalonRepository: () => ({
    async marquer() {},
  }),
  getOdjRepository: () => ({
    async getEtat(code: string, agDate: string) {
      return etat.lignes.get(etat.cle(code, agDate)) ?? [];
    },
    async setChamp(code: string, agDate: string, champId: string, valeur: string | null) {
      etat.ecritures.push({ code, agDate, champId, valeur });
      const k = etat.cle(code, agDate);
      const restantes = (etat.lignes.get(k) ?? []).filter((l) => l.champId !== champId);
      etat.lignes.set(k, [...restantes, { champId, valeur }]);
    },
  }),
}));

import { cloturerOdjAction, saisirChampAction, togglePointAction } from "@/app/odj/[id]/actions";
import { getOdj } from "@/lib/services/odj/get-odj";
import { ODJ_SANS_DATE } from "@/lib/ports/odj-repository";

/** Valeur relue par l'ecran pour un champ d'en-tete. */
async function lireEnTete(id: string, champId: string): Promise<string | undefined> {
  const odj = await getOdj(id, "g1");
  return odj?.enTete.find((c) => c.id === champId)?.valeur;
}

const source = process.env.COPRO_SOURCE;
beforeEach(() => {
  etat.reset();
  // Cloisonnement reel (le mode mock court-circuite la garde).
  process.env.COPRO_SOURCE = "supabase";
});
afterEach(() => {
  if (source === undefined) delete process.env.COPRO_SOURCE;
  else process.env.COPRO_SOURCE = source;
});

describe("cle d'ecriture de l'ODJ (id d'URL sans date)", () => {
  it("ecrit sur la prochaine AG de la copro, jamais sur la sentinelle", async () => {
    await saisirChampAction("S273", "lieu", "Salle des fêtes");

    expect(etat.ecritures).toHaveLength(1);
    expect(etat.ecritures[0]?.agDate).toBe("2026-10-14");
    expect(etat.ecritures[0]?.agDate).not.toBe(ODJ_SANS_DATE);
  });

  it("relit ce qui vient d'etre ecrit (lecture et ecriture partagent la cle)", async () => {
    await saisirChampAction("S273", "lieu", "Salle des fêtes");

    expect(await lireEnTete("S273", "lieu")).toBe("Salle des fêtes");
  });

  it("produit la meme cle avec ou sans date dans l'id", async () => {
    await saisirChampAction("S273", "lieu", "Salle des fêtes");
    await saisirChampAction("S273__2026-10-14", "presents-syndic", "MARTIN Paul");

    expect(new Set(etat.ecritures.map((e) => e.agDate))).toEqual(new Set(["2026-10-14"]));
    // Ecrit depuis l'id nu, relu depuis l'id date : c'est le meme document.
    expect(await lireEnTete("S273__2026-10-14", "lieu")).toBe("Salle des fêtes");
  });

  it("retire un point legal sur la vraie date d'AG", async () => {
    await togglePointAction("S273", "irve", true);

    expect(etat.ecritures[0]?.agDate).toBe("2026-10-14");
    const odj = await getOdj("S273", "g1");
    expect(odj?.pointsLegaux.find((p) => p.id === "irve")?.applicable).toBe(false);
  });

  it("verrouille l'ODJ des la cloture, meme cloturee depuis l'id nu", async () => {
    await cloturerOdjAction("S273", true);
    expect(etat.ecritures[0]?.agDate).toBe("2026-10-14");

    await saisirChampAction("S273", "lieu", "Salle des fêtes");
    await togglePointAction("S273", "irve", true);

    // Aucune ecriture n'a suivi la cloture : le verrou serveur lit bien la meme ligne.
    expect(etat.ecritures).toHaveLength(1);
    expect((await getOdj("S273", "g1"))?.cloture).toBeTruthy();
  });

  it("garde la sentinelle quand la copro n'a aucune date d'AG", async () => {
    etat.prochaineAgDate = undefined;

    await saisirChampAction("S273", "lieu", "À définir");

    expect(etat.ecritures[0]?.agDate).toBe(ODJ_SANS_DATE);
    expect(await lireEnTete("S273", "lieu")).toBe("À définir");
  });

  it("n'ecrit rien hors du perimetre du gestionnaire", async () => {
    etat.appartient = false;

    await saisirChampAction("S273", "lieu", "Salle des fêtes");
    await togglePointAction("S273", "irve", true);
    await cloturerOdjAction("S273", true);

    expect(etat.ecritures).toHaveLength(0);
  });

  it("n'ecrit rien sans session", async () => {
    etat.session = null;

    await saisirChampAction("S273", "lieu", "Salle des fêtes");
    await cloturerOdjAction("S273", true);

    expect(etat.ecritures).toHaveLength(0);
  });
});
