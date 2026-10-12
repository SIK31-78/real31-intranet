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
  /** Referentiel Copropriete simule : les deux dates de CS que la cloture fait glisser. */
  derniereCsDate: undefined as string | undefined,
  prochaineCsDate: undefined as string | undefined,
  /** Titulaire de la fiche : le referentiel reel filtre lecture ET ecriture scopees sur lui. */
  titulaire: "g1",
}));

vi.mock("@/lib/services/coproprietes/exiger-perimetre", () => ({
  exigerPerimetre: async () => {},
}));
vi.mock("@/lib/adapters/router", () => ({
  getOdjRepository: () => ({
    async setChamp(_c: string, _a: string, champId: string, valeur: string | null) {
      etat.champs.push({ champId, valeur });
    },
    // getEtat rejoue les setChamp : la derniere valeur ecrite pour une cle gagne, comme
    // la vraie table (upsert). Sert a la RELECTURE du marqueur de glissement.
    // Report sans date -> vraie date : dans ce faux, l'etat n'a pas de date, rien a deplacer.
    async reporterSansDate() {},
    async getEtat() {
      const parCle = new Map(etat.champs.map((c) => [c.champId, c.valeur]));
      return [...parCle].map(([champId, valeur]) => ({ champId, valeur }));
    },
  }),
  getCoproRepository: () => ({
    // Comme l'adapter Supabase : une lecture SCOPEE hors portefeuille rend null.
    async findByCode(_c: string, managerId?: string) {
      if (managerId && managerId !== etat.titulaire) return null;
      return {
        code: "S001",
        managerId: etat.titulaire,
        derniereCsDate: etat.derniereCsDate,
        prochaineCsDate: etat.prochaineCsDate,
      };
    },
    // Et une ecriture hors portefeuille leve (idCoproUnique + filtrePerimetre).
    async setDateEvenement(
      _c: string,
      _type: "ag" | "cs",
      quand: "prochaine" | "derniere",
      dateISO: string | null,
      managerId: string,
    ) {
      if (managerId !== etat.titulaire) throw new Error("hors perimetre");
      if (quand === "prochaine") etat.prochaineCsDate = dateISO ?? undefined;
      else etat.derniereCsDate = dateISO ?? undefined;
    },
  }),
  getJalonRepository: () => ({
    async marquer(input: MarquageJalon) {
      if (etat.echouerMarquage) throw new Error("intranet_jalons indisponible");
      etat.marquages.push(input);
    },
  }),
}));

import { AVERTISSEMENT_FRISE, cloturerOdj, poserJalonOdjSiClos } from "./cloturer-odj";
import { calculerCycleAg } from "@/lib/domain/cycle-ag";
import { ODJ_SANS_DATE } from "@/lib/ports/odj-repository";
import type { Copropriete } from "@/lib/domain/copropriete";

const AG = "2026-07-10";
const TODAY = "2026-06-22";

function clore(
  clore: boolean,
  agDateISO = AG,
  maintenantISO = "2026-06-22T09:00:00.000Z",
  managerId = "g1",
) {
  return cloturerOdj({
    coproCode: "S001",
    agDateISO,
    clore,
    initiales: "RL",
    managerId,
    maintenantISO,
  });
}

/** Le jour ou Sekou a remonte le bug : le CS du 3 septembre etait deja passe. */
const LE_10_SEPTEMBRE = "2026-09-10T09:00:00.000Z";

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
  etat.derniereCsDate = undefined;
  etat.prochaineCsDate = undefined;
  etat.titulaire = "g1";
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

  it("un echec du marquage ne defait pas la cloture, mais il est dit a l'ecran", async () => {
    etat.echouerMarquage = true;

    await expect(clore(true)).resolves.toEqual({ avertissement: AVERTISSEMENT_FRISE });
    expect(etat.champs).toHaveLength(1);
  });

  it("sans incident, aucun avertissement", async () => {
    await expect(clore(true)).resolves.toEqual({});
  });
});

// ODJ clos AVANT que la date d'AG soit fixee : la cloture n'a pas pu poser le jalon (pas
// de date). Il est pose au report de l'ODJ sur sa vraie date (reporterOdjSansDate).
describe("poserJalonOdjSiClos - ODJ clos sans date, puis date d'AG fixee", () => {
  it("pose le jalon ODJ_CS accompli quand l'ODJ reporte est clos", async () => {
    // Etat tel qu'apres le report : la cloture vit desormais sous la vraie date.
    etat.champs.push({ champId: "__cloture", valeur: "2026-06-20T18:00:00.000Z|RL" });

    await poserJalonOdjSiClos("S001", AG);

    expect(etat.marquages).toEqual([
      { coproCode: "S001", agDate: AG, type: "ODJ_CS", statut: "accompli", par: "RL" },
    ]);
    expect(calculerCycleAg(copro(), accompliDepuisMarquages(), TODAY).etapeCourante).toBe("convoc");
  });

  it("est branche sur le report de l'ODJ sans date (fixation de la date d'AG)", async () => {
    const { reporterOdjSansDate } = await import("./saisir-champ-odj");
    etat.champs.push({ champId: "__cloture", valeur: "2026-06-20T18:00:00.000Z|RL" });

    await reporterOdjSansDate("S001", AG, "g1");

    expect(etat.marquages.map((m) => [m.type, m.statut, m.agDate])).toEqual([["ODJ_CS", "accompli", AG]]);
  });

  it("ne pose rien si l'ODJ reporte n'est pas clos", async () => {
    await poserJalonOdjSiClos("S001", AG);
    expect(etat.marquages).toHaveLength(0);
  });

  it("ne pose rien sur la sentinelle, et un echec ne leve pas", async () => {
    await poserJalonOdjSiClos("S001", ODJ_SANS_DATE);
    expect(etat.marquages).toHaveLength(0);

    etat.champs.push({ champId: "__cloture", valeur: "2026-06-20T18:00:00.000Z|RL" });
    etat.echouerMarquage = true;
    await expect(poserJalonOdjSiClos("S001", AG)).resolves.toBeUndefined();
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

// Le CS annonce comme "a venir" alors qu'il s'est tenu : bug remonte par Sekou le
// 2026-09-10 sur BLEUETS4 (dernier CS au 5 sept. 2025, prochain CS au 3 sept. 2026, alors
// qu'on etait le 10). "Marquer la reunion terminee" est le declencheur qu'il a choisi.
describe("cloturerOdj - la date de CS glisse quand la reunion est terminee", () => {
  it("passe la prochaine date de CS en derniere date et libere la prochaine", async () => {
    etat.derniereCsDate = "2025-09-05";
    etat.prochaineCsDate = "2026-09-03";

    await clore(true, AG, LE_10_SEPTEMBRE);

    expect(etat.derniereCsDate).toBe("2026-09-03");
    expect(etat.prochaineCsDate).toBeUndefined();
  });

  it("memorise l'ancienne derniere date pour pouvoir revenir en arriere", async () => {
    etat.derniereCsDate = "2025-09-05";
    etat.prochaineCsDate = "2026-09-03";

    await clore(true, AG, LE_10_SEPTEMBRE);

    expect(etat.champs.find((c) => c.champId === "__cs-glisse")?.valeur).toBe(
      "2026-09-03|2025-09-05",
    );
  });

  it("rouvrir l'ODJ remet les deux dates exactement comme avant", async () => {
    etat.derniereCsDate = "2025-09-05";
    etat.prochaineCsDate = "2026-09-03";

    await clore(true, AG, LE_10_SEPTEMBRE);
    await clore(false, AG, LE_10_SEPTEMBRE);

    expect(etat.derniereCsDate).toBe("2025-09-05");
    expect(etat.prochaineCsDate).toBe("2026-09-03");
    expect(etat.champs.at(-1)).toEqual({ champId: "__cs-glisse", valeur: null });
  });

  it("ne deplace RIEN quand le CS est encore a venir (ODJ cloture en avance)", async () => {
    etat.derniereCsDate = "2025-09-05";
    etat.prochaineCsDate = "2026-06-25"; // maintenantISO = 2026-06-22

    await clore(true);

    expect(etat.derniereCsDate).toBe("2025-09-05");
    expect(etat.prochaineCsDate).toBe("2026-06-25");
    expect(etat.champs.some((c) => c.champId === "__cs-glisse")).toBe(false);
  });

  it("rouvrir un ODJ qui n'avait rien fait glisser ne touche pas au referentiel", async () => {
    etat.derniereCsDate = "2025-09-05";
    etat.prochaineCsDate = "2026-06-25";

    await clore(true);
    await clore(false);

    expect(etat.derniereCsDate).toBe("2025-09-05");
    expect(etat.prochaineCsDate).toBe("2026-06-25");
  });
});

// Un ADMIN ou un delegue (ADR-041) clot l'ODJ d'une copro hors de son portefeuille : son
// autorite est verifiee en amont (exigerPerimetre). La lecture scopee rendait null et le
// CS ne glissait pas, en silence.
describe("cloturerOdj - glissement du CS par un utilisateur hors portefeuille", () => {
  it("fait glisser le CS quand un admin / delegue clot l'ODJ", async () => {
    etat.titulaire = "titulaire-1";
    etat.derniereCsDate = "2025-09-05";
    etat.prochaineCsDate = "2026-09-03";

    await clore(true, AG, LE_10_SEPTEMBRE, "admin-1");

    expect(etat.derniereCsDate).toBe("2026-09-03");
    expect(etat.prochaineCsDate).toBeUndefined();
  });

  it("et la reouverture par le meme utilisateur remet les dates", async () => {
    etat.titulaire = "titulaire-1";
    etat.derniereCsDate = "2025-09-05";
    etat.prochaineCsDate = "2026-09-03";

    await clore(true, AG, LE_10_SEPTEMBRE, "admin-1");
    await clore(false, AG, LE_10_SEPTEMBRE, "admin-1");

    expect(etat.derniereCsDate).toBe("2025-09-05");
    expect(etat.prochaineCsDate).toBe("2026-09-03");
  });
});
