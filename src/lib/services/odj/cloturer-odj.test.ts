// Cloture de l'ODJ = l'etape ODJ du cycle AG avance.
//
// Bug remonte DEUX FOIS par les collegues : "la progression des AG reste en ODJ meme si on
// valide - ca reste 'a confirmer' et on ne debloque jamais la phase convocation". Diagnostic :
// "Marquer la reunion terminee" n'ecrivait QUE la cle __cloture de l'ODJ, tandis que le cycle
// (parcours.etapeFaite) lit `accompli.has("ODJ_CS")`. Aucun chemin de l'app ne marquait ce
// jalon (le seul bouton, BoutonConfirmerJalon, vit dans un composant que plus rien ne rend
// depuis le demantelement du dashboard). L'etape ODJ etait donc DEFINITIVEMENT bloquee, avec
// l'echeance "a confirmer" une fois la cible J-45 passee.
//
// Les deux derniers tests sont la reproduction du bug : sans le marquage, `accompli` reste
// vide et calculerCycleAg garde etapeCourante = "odj".

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { MarquageJalon } from "@/lib/ports/jalon-repository";

const etat = vi.hoisted(() => ({
  champs: [] as { champId: string; valeur: string | null }[],
  marquages: [] as MarquageJalon[],
  echouerMarquage: false,
}));

vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({
  exigerPerimetre: async () => {},
}));
vi.mock("@/lib/adapters/router", () => ({
  getOdjRepository: () => ({
    async setChamp(_c: string, _a: string, champId: string, valeur: string | null) {
      etat.champs.push({ champId, valeur });
    },
  }),
  getJalonRepository: () => ({
    async marquer(input: MarquageJalon) {
      if (etat.echouerMarquage) throw new Error("intranet_jalons indisponible");
      etat.marquages.push(input);
    },
  }),
}));

import { cloturerOdj } from "./cloturer-odj";
import { calculerCycleAg } from "@/lib/domain/cycle-ag";
import { ODJ_SANS_DATE } from "@/lib/ports/odj-repository";
import type { Copropriete } from "@/lib/domain/copropriete";

const AG = "2026-07-10";
const TODAY = "2026-06-22";

function clore(clore: boolean, agDateISO = AG) {
  return cloturerOdj({
    coproCode: "S001",
    agDateISO,
    clore,
    initiales: "RL",
    managerId: "g1",
    maintenantISO: "2026-06-22T09:00:00.000Z",
  });
}

/** Copro dont l'etape "Dates" est faite (AG proche + CS de prep pose). */
function copro(): Copropriete {
  return {
    code: "S001",
    source: "crypto",
    nom: "Test",
    adresse: { ligne1: "", codePostal: "", ville: "" },
    statut: "active",
    lotsPrincipaux: 0,
    lotsAutres: 0,
    exercice: { debut: "01/01", fin: "31/12" },
    priseEnGestion: "-",
    equipe: [],
    prochaineAg: { date: AG, statut: "planifiee" },
    prochaineCsDate: "2026-06-25",
  } as Copropriete;
}

/** Le Set `accompli` que les services derivent des jalons marques accomplis. */
function accompliDepuisMarquages(): Set<string> {
  const parType = new Map(etat.marquages.map((m) => [m.type as string, m.statut]));
  return new Set([...parType].filter(([, s]) => s === "accompli").map(([t]) => t));
}

beforeEach(() => {
  etat.champs = [];
  etat.marquages = [];
  etat.echouerMarquage = false;
});

describe("cloturerOdj - la cloture fait avancer le cycle AG", () => {
  it("marque le jalon ODJ_CS accompli sur la date d'AG de l'ODJ", async () => {
    await clore(true);

    expect(etat.marquages).toEqual([
      { coproCode: "S001", agDate: AG, type: "ODJ_CS", statut: "accompli", par: "RL" },
    ]);
  });

  it("rouvrir l'ODJ remet le jalon a faire (la cloture reste reversible)", async () => {
    await clore(true);
    await clore(false);

    expect(etat.marquages.at(-1)?.statut).toBe("a_faire");
  });

  it("ne marque aucun jalon quand l'ODJ n'a pas encore de date d'AG (sentinelle)", async () => {
    await clore(true, ODJ_SANS_DATE);

    expect(etat.champs).toHaveLength(1); // la cloture, elle, est bien ecrite
    expect(etat.marquages).toHaveLength(0);
  });

  it("un echec du marquage ne defait pas la cloture (best-effort)", async () => {
    etat.echouerMarquage = true;

    await expect(clore(true)).resolves.toBeUndefined();
    expect(etat.champs).toHaveLength(1);
  });
});

describe("cloturerOdj - le bug remonte par les collegues (frise bloquee sur ODJ)", () => {
  it("AVANT toute cloture, l'etape courante est 'odj'", () => {
    const cycle = calculerCycleAg(copro(), accompliDepuisMarquages(), TODAY);

    expect(cycle.etapeCourante).toBe("odj");
  });

  it("APRES la cloture, l'etape ODJ est faite et la convocation se debloque", async () => {
    await clore(true);

    const cycle = calculerCycleAg(copro(), accompliDepuisMarquages(), TODAY);
    expect(cycle.etapes.find((e) => e.code === "odj")?.statut).toBe("fait");
    expect(cycle.etapeCourante).toBe("convoc");
    expect(cycle.actionDuMoment?.action).toBe("envoyer les convocations");
  });

  it("rouvrir l'ODJ ramene la frise sur l'etape 'odj'", async () => {
    await clore(true);
    await clore(false);

    expect(calculerCycleAg(copro(), accompliDepuisMarquages(), TODAY).etapeCourante).toBe("odj");
  });
});
