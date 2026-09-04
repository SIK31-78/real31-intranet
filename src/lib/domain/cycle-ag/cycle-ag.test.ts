import { describe, it, expect } from "vitest";
import type { Copropriete } from "@/lib/domain/copropriete";
import { calculerCycleAg } from "./index";
import { etatCycleAg } from "./etat";
import {
  agDueDeadline,
  agTenuePourExerciceCourant,
  clotureLaPlusRecente,
  construireLigne,
  estEnParcours,
} from "./parcours";

// Fabrique une copro minimale (les champs non utilises par le cycle sont caste-ignores).
function copro(p: Partial<Copropriete>): Copropriete {
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
    ...p,
  } as Copropriete;
}

const TODAY = "2026-06-22";
// AG dans la fenetre de preparation (< 150 j), CS de prep planifie -> etape Dates faite.
const AG_PROCHE = {
  prochaineAg: { date: "2026-07-10", statut: "planifiee" as const },
  prochaineCsDate: "2026-06-25",
};

describe("calculerCycleAg - coherence etat <-> etape (chaque etat mappe la bonne etape)", () => {
  it("a_planifier -> etape 'dates'", () => {
    const cycle = calculerCycleAg(copro({}), new Set(), TODAY);
    expect(cycle.etat).toBe("a_planifier");
    expect(cycle.etapeCourante).toBe("dates");
  });

  it("a_venir (AG lointaine, prep pas commencee) -> etape 'dates' (poser le CS)", () => {
    const cycle = calculerCycleAg(
      copro({ prochaineAg: { date: "2026-12-31", statut: "planifiee" } }),
      new Set(),
      TODAY,
    );
    expect(cycle.etat).toBe("a_venir");
    expect(cycle.etapeCourante).toBe("dates");
  });

  it("en_preparation, jalon ODJ pas fait -> etape 'odj'", () => {
    const cycle = calculerCycleAg(copro(AG_PROCHE), new Set(), TODAY);
    expect(cycle.etat).toBe("en_preparation");
    expect(cycle.etapeCourante).toBe("odj");
  });

  it("en_preparation, ODJ fait -> etape 'convoc'", () => {
    const cycle = calculerCycleAg(copro(AG_PROCHE), new Set(["ODJ_CS"]), TODAY);
    expect(cycle.etat).toBe("en_preparation");
    expect(cycle.etapeCourante).toBe("convoc");
  });

  it("convoquee (jalon CONVOC coche) -> etape 'tenue'", () => {
    const cycle = calculerCycleAg(copro(AG_PROCHE), new Set(["ODJ_CS", "CONVOC"]), TODAY);
    expect(cycle.etat).toBe("convoquee");
    expect(cycle.etapeCourante).toBe("tenue");
  });

  it("tenue (date passee, PV pas notifie) -> etape 'pv'", () => {
    const cycle = calculerCycleAg(
      copro({ ...AG_PROCHE, prochaineAg: { date: "2026-06-10", statut: "planifiee" } }),
      new Set(["ODJ_CS", "CONVOC", "TENUE"]),
      TODAY,
    );
    expect(cycle.etat).toBe("tenue");
    expect(cycle.etapeCourante).toBe("pv");
  });

  it("tenue et conclue (prochaine date videe) -> cycle termine, aucune etape courante", () => {
    // AG du 16/04 conclue, exercice clos au 31/12 : rien a planifier avant la cloture.
    const cycle = calculerCycleAg(
      copro({ derniereAgDate: "2026-04-16" }),
      new Set(),
      "2026-07-17",
    );
    expect(cycle.etat).toBe("tenue");
    expect(cycle.etapeCourante).toBeNull();
    expect(cycle.etapes.every((e) => e.statut === "fait")).toBe(true);
  });
});

describe("calculerCycleAg - action du moment par etat", () => {
  it("a_planifier -> 'Fixer' vers la fiche copro (jamais la supervision)", () => {
    const { actionDuMoment } = calculerCycleAg(copro({}), new Set(), TODAY);
    expect(actionDuMoment?.label).toBe("Fixer");
    expect(actionDuMoment?.href).toBe("/copropriete/S001");
  });

  it("en_preparation, ODJ a faire -> 'ODJ' vers le composer", () => {
    const { actionDuMoment } = calculerCycleAg(copro(AG_PROCHE), new Set(), TODAY);
    expect(actionDuMoment?.label).toBe("ODJ");
    expect(actionDuMoment?.href).toBe("/odj/S001");
    expect(actionDuMoment?.action).toBe("préparer l'ODJ");
  });

  it("en_preparation, ODJ fait -> convocations via la supervision datee", () => {
    const { actionDuMoment } = calculerCycleAg(copro(AG_PROCHE), new Set(["ODJ_CS"]), TODAY);
    expect(actionDuMoment?.label).toBe("Supervision");
    expect(actionDuMoment?.href).toBe("/supervision-ag/S001__2026-07-10");
    expect(actionDuMoment?.action).toBe("envoyer les convocations");
  });

  it("convoquee -> tenir l'AG via la supervision datee", () => {
    const { actionDuMoment } = calculerCycleAg(
      copro(AG_PROCHE),
      new Set(["ODJ_CS", "CONVOC"]),
      TODAY,
    );
    expect(actionDuMoment?.label).toBe("Supervision");
    expect(actionDuMoment?.action).toBe("tenir l'AG et suivre");
  });

  it("tenue (date passee) -> notifier le PV via la supervision datee", () => {
    const { actionDuMoment } = calculerCycleAg(
      copro({ ...AG_PROCHE, prochaineAg: { date: "2026-06-10", statut: "planifiee" } }),
      new Set(["ODJ_CS", "CONVOC", "TENUE"]),
      TODAY,
    );
    expect(actionDuMoment?.action).toBe("publier et notifier le PV");
    expect(actionDuMoment?.href).toBe("/supervision-ag/S001__2026-06-10");
  });

  it("tenue et conclue -> AUCUNE action (pas de 'Fixer' a contre-temps)", () => {
    const { actionDuMoment } = calculerCycleAg(
      copro({ derniereAgDate: "2026-04-16" }),
      new Set(),
      "2026-07-17",
    );
    expect(actionDuMoment).toBeNull();
  });

  it("cycle complet (5 etapes faites) -> aucune action", () => {
    const { actionDuMoment, etapeCourante } = calculerCycleAg(
      copro(AG_PROCHE),
      new Set(["ODJ_CS", "CONVOC", "TENUE", "NOTIF_PV"]),
      TODAY,
    );
    expect(actionDuMoment).toBeNull();
    expect(etapeCourante).toBeNull();
  });
});

describe("calculerCycleAg - priorisation post-tenue (S2.D, param statutSupervision)", () => {
  // AG datee dans le passe (tenue) mais CS jamais saisi : SANS statut, l'heritage du
  // calcul fiche propose "fixer la date du CS" a contre-temps (le bug vise par S2.D).
  const AG_TENUE_CS_MANQUANT = {
    prochaineAg: { date: "2026-06-10", statut: "planifiee" as const },
  };

  it("defaut (statut absent) : comportement inchange - l'heritage 'fixer la date du CS' est preserve", () => {
    const { actionDuMoment } = calculerCycleAg(copro(AG_TENUE_CS_MANQUANT), new Set(), TODAY);
    expect(actionDuMoment?.action).toBe("fixer la date du CS");
  });

  it("tenue NON conclue (en_preparation) -> action 'Conclure l'AG' vers le fil d'AG date", () => {
    const { actionDuMoment } = calculerCycleAg(
      copro(AG_TENUE_CS_MANQUANT),
      new Set(),
      TODAY,
      "en_preparation",
    );
    expect(actionDuMoment?.label).toBe("Conclure");
    expect(actionDuMoment?.action).toBe("conclure l'AG");
    expect(actionDuMoment?.href).toBe("/supervision-ag/S001__2026-06-10");
  });

  it("tenue avec PV a notifier, NON conclue -> 'Conclure l'AG' (jamais 'notifier le PV' a contre-temps)", () => {
    const { actionDuMoment } = calculerCycleAg(
      copro({ ...AG_PROCHE, prochaineAg: { date: "2026-06-10", statut: "planifiee" } }),
      new Set(["ODJ_CS", "CONVOC", "TENUE"]),
      TODAY,
      "en_preparation",
    );
    expect(actionDuMoment?.label).toBe("Conclure");
    expect(actionDuMoment?.href).toBe("/supervision-ag/S001__2026-06-10");
  });

  it("tenue CONCLUE (conclue_archivee) meme avec une date encore posee -> aucune action", () => {
    const { actionDuMoment, etapeCourante } = calculerCycleAg(
      copro(AG_TENUE_CS_MANQUANT),
      new Set(),
      TODAY,
      "conclue_archivee",
    );
    expect(actionDuMoment).toBeNull();
    expect(etapeCourante).toBeNull();
  });

  it("statut sans effet hors 'tenue' : en_preparation sur une AG a venir garde son action normale", () => {
    const { actionDuMoment } = calculerCycleAg(copro(AG_PROCHE), new Set(), TODAY, "en_preparation");
    expect(actionDuMoment?.label).toBe("ODJ"); // etat en_preparation, pas tenue -> pas d'ecrasement
  });
});

describe("calculerCycleAg - jamais d'action 'supervision' sans date d'AG", () => {
  it("sans date, meme avec des jalons marques (donnees adverses), l'action reste 'Fixer'", () => {
    const { actionDuMoment } = calculerCycleAg(
      copro({}),
      new Set(["ODJ_CS", "CONVOC", "TENUE", "NOTIF_PV"]),
      TODAY,
    );
    // L'etape Dates n'est pas faite (pas d'AG datee) -> elle prime : jamais de bouton
    // Supervision a contre-temps (le bug audit du 2026-07-21).
    expect(actionDuMoment?.label).toBe("Fixer");
    expect(actionDuMoment?.href.startsWith("/supervision-ag/")).toBe(false);
  });

  it("sans date et AG conclue, aucune action du tout", () => {
    const cycle = calculerCycleAg(
      copro({ derniereAgDate: "2026-04-16" }),
      new Set(["TENUE"]),
      "2026-07-17",
    );
    expect(cycle.actionDuMoment).toBeNull();
  });
});

describe("calculerCycleAg - enRetard et echeance conserves", () => {
  it("a_planifier, delai legal depasse -> enRetard + echeance 'en retard'", () => {
    const cycle = calculerCycleAg(copro({}), new Set(), "2026-08-01");
    expect(cycle.etat).toBe("a_planifier");
    expect(cycle.enRetard).toBe(true); // cloture 31/12 + 6 mois = 30/06 < 01/08
    expect(cycle.echeance).toBe("en retard");
  });

  it("a_planifier dans les delais -> pas de retard", () => {
    const cycle = calculerCycleAg(copro({}), new Set(), TODAY);
    expect(cycle.enRetard).toBe(false);
  });

  it("etape en preparation -> echeance en J-x", () => {
    const cycle = calculerCycleAg(copro(AG_PROCHE), new Set(["ODJ_CS"]), TODAY);
    expect(cycle.echeance).toMatch(/^J-\d+$|^à confirmer$/);
  });
});

describe("calculerCycleAg = les DEUX anciennes projections, a l'identique", () => {
  const cas: [string, Copropriete, Set<string>, string][] = [
    ["a_planifier", copro({}), new Set(), TODAY],
    ["en_preparation", copro(AG_PROCHE), new Set(), TODAY],
    ["convoquee", copro(AG_PROCHE), new Set(["ODJ_CS", "CONVOC"]), TODAY],
    [
      "tenue datee",
      copro({ ...AG_PROCHE, prochaineAg: { date: "2026-06-10", statut: "planifiee" } }),
      new Set(["ODJ_CS", "CONVOC", "TENUE"]),
      TODAY,
    ],
  ];

  it.each(cas)("%s : etat identique a etatCycleAg", (_nom, c, accompli, today) => {
    const cycle = calculerCycleAg(c, accompli, today);
    const attendu = etatCycleAg(c, accompli.has("CONVOC"), today);
    expect(cycle.etat).toBe(attendu.etat);
    expect(cycle.enRetard).toBe(attendu.enRetard);
  });

  it.each(cas)("%s : etapes et action identiques a construireLigne", (_nom, c, accompli, today) => {
    const cycle = calculerCycleAg(c, accompli, today);
    const ligne = construireLigne(c, accompli, today)?.ligne;
    expect(cycle.etapes).toEqual(ligne?.etapes);
    expect(cycle.actionDuMoment?.action).toBe(ligne?.prochaineAction);
    expect(cycle.actionDuMoment?.label).toBe(ligne?.actionLabel);
    expect(cycle.actionDuMoment?.href).toBe(ligne?.lien);
  });
});

// ---------------------------------------------------------------------------
// BORNAGE FIN D'EXERCICE (retour collegues : "le bornage est faux")
//
// L'echeance legale d'AG = cloture du dernier exercice clos + 6 mois. Le calcul
// debordait en fin de mois : `new Date(Date.UTC(y, m - 1 + 6, 31))` pour un 31/12
// tombe le 1er JUILLET, pas le 30 juin - et un 31/08 tombe le 3 MARS. Les copros
// closes un 31 (soit presque toutes, 31/12 en tete) partaient donc avec 1 a 3 jours
// de delai en trop et n'etaient signalees en retard qu'apres coup.
// ---------------------------------------------------------------------------

describe("bornage fin d'exercice - la cloture la plus recente", () => {
  it("exercice au 31/12 : la cloture de reference est celle de l'annee precedente en debut d'annee", () => {
    expect(clotureLaPlusRecente("31/12", "2026-06-22")).toBe("2025-12-31");
  });

  it("exercice au 31/12 : le 31/12 lui-meme est deja la cloture du jour", () => {
    expect(clotureLaPlusRecente("31/12", "2026-12-31")).toBe("2026-12-31");
    expect(clotureLaPlusRecente("31/12", "2026-12-30")).toBe("2025-12-31");
  });

  it("exercice DECALE au 30/06 : bascule le 30 juin, pas le 1er janvier", () => {
    expect(clotureLaPlusRecente("30/06", "2026-06-29")).toBe("2025-06-30");
    expect(clotureLaPlusRecente("30/06", "2026-06-30")).toBe("2026-06-30");
    expect(clotureLaPlusRecente("30/06", "2027-01-05")).toBe("2026-06-30");
  });

  it("cloture au 29/02 : bornee au 28 les annees non bissextiles (jamais le 1er mars)", () => {
    expect(clotureLaPlusRecente("29/02", "2026-12-01")).toBe("2026-02-28");
    expect(clotureLaPlusRecente("29/02", "2024-12-01")).toBe("2024-02-29");
  });

  it("fin d'exercice non exploitable ('-', format date complet) : aucune cloture deduite", () => {
    expect(clotureLaPlusRecente("-", "2026-06-22")).toBeNull();
    expect(clotureLaPlusRecente("31/12/2025", "2026-06-22")).toBeNull();
  });
});

describe("bornage fin d'exercice - echeance legale (cloture + 6 mois)", () => {
  const sansAg = (fin: string, p: Partial<Copropriete> = {}) =>
    copro({ exercice: { debut: "01/01", fin }, ...p });

  it("cloture au 31/12 -> AG due le 30/06, PAS le 1er juillet", () => {
    // Fenetre de preparation : 150 j avant le 30/06/2026 = a partir du 31/01/2026.
    expect(agDueDeadline(sansAg("31/12"), "2026-06-22")).toBe("2026-06-30");
  });

  it("cloture au 31/12 : le 1er juillet, la copro est EN RETARD (elle ne l'etait pas avant)", () => {
    // LE test de non-regression du debordement : avec l'ancien calcul l'echeance tombait
    // le 01/07, donc au 01/07 la copro n'etait pas encore "en retard".
    const { enRetard } = etatCycleAg(sansAg("31/12"), false, "2026-07-01");
    expect(enRetard).toBe(true);
  });

  it("cloture au 31/12 : le 30/06 (jour de l'echeance) la copro n'est pas encore en retard", () => {
    expect(etatCycleAg(sansAg("31/12"), false, "2026-06-30").enRetard).toBe(false);
  });

  it("cloture au 31/08 -> AG due fin fevrier, jamais debordee sur mars", () => {
    expect(agDueDeadline(sansAg("31/08"), "2027-01-15")).toBe("2027-02-28");
    expect(etatCycleAg(sansAg("31/08"), false, "2027-03-01").enRetard).toBe(true);
  });

  it("cloture au 31/03 -> AG due le 30/09 (30 jours en septembre)", () => {
    expect(agDueDeadline(sansAg("31/03"), "2026-08-01")).toBe("2026-09-30");
  });

  it("exercice DECALE au 30/06 -> AG due le 30/12 (aucun bornage a appliquer)", () => {
    expect(agDueDeadline(sansAg("30/06"), "2026-09-04")).toBe("2026-12-30");
  });
});

describe("bornage fin d'exercice - qui entre et qui sort du pipeline", () => {
  const sansAg = (fin: string, p: Partial<Copropriete> = {}) =>
    copro({ exercice: { debut: "01/01", fin }, ...p });

  it("exercice decale au 30/06 : hors fenetre juste apres la cloture, dedans 5 mois plus tard", () => {
    // AG due le 30/12/2026. Fenetre de preparation = 150 j avant, soit a partir du 02/08.
    expect(agDueDeadline(sansAg("30/06"), "2026-07-05")).toBeNull(); // trop tot
    expect(agDueDeadline(sansAg("30/06"), "2026-09-04")).toBe("2026-12-30"); // dans la fenetre
  });

  it("AG tenue APRES la cloture : plus rien a planifier avant la cloture suivante", () => {
    const c = sansAg("30/06", { derniereAgDate: "2026-08-20" });
    expect(agTenuePourExerciceCourant(c, "2026-09-04")).toBe(true);
    expect(agDueDeadline(c, "2026-09-04")).toBeNull();
    expect(etatCycleAg(c, false, "2026-09-04").etat).toBe("tenue");
  });

  it("AG tenue AVANT la cloture (exercice precedent) : l'AG de l'exercice clos reste a planifier", () => {
    const c = sansAg("30/06", { derniereAgDate: "2025-11-10" });
    expect(agTenuePourExerciceCourant(c, "2026-09-04")).toBe(false);
    expect(agDueDeadline(c, "2026-09-04")).toBe("2026-12-30");
    expect(etatCycleAg(c, false, "2026-09-04").etat).toBe("a_planifier");
  });

  it("bascule d'annee (31/12) : la copro repasse a planifier des le 1er janvier, sans retard", () => {
    const c = sansAg("31/12", { derniereAgDate: "2026-06-10" });
    // 31/12 : au 20/12 l'AG de juin couvre l'exercice clos fin 2025 -> suivi post-AG.
    expect(etatCycleAg(c, false, "2026-12-20").etat).toBe("tenue");
    // Au 02/01 la cloture 2026 est passee : il y a de nouveau une AG a planifier,
    // mais l'echeance (30/06/2027) est encore loin -> aucun retard, hors parcours.
    const apres = etatCycleAg(c, false, "2027-01-02");
    expect(apres.etat).toBe("a_planifier");
    expect(apres.enRetard).toBe(false);
    expect(estEnParcours(c, "2027-01-02")).toBe(false);
  });

  it("une AG deja datee sort du calcul d'echeance legale (rien a planifier)", () => {
    const c = sansAg("31/12", { prochaineAg: { date: "2026-05-12", statut: "planifiee" } });
    expect(agDueDeadline(c, "2026-08-01")).toBeNull();
  });
});

describe("phase dates - action secondaire ODJ (preparation sans attendre la date)", () => {
  it("en phase Dates, l'action secondaire pointe vers l'ODJ de la copro", () => {
    const { actionDuMoment } = calculerCycleAg(copro({}), new Set(), TODAY);
    expect(actionDuMoment?.label).toBe("Fixer");
    expect(actionDuMoment?.secondaire).toEqual({ label: "Préparer l'ODJ", href: "/odj/S001" });
  });

  it("hors phase Dates (ODJ deja l'action principale), pas d'action secondaire", () => {
    const { actionDuMoment } = calculerCycleAg(copro(AG_PROCHE), new Set(), TODAY);
    expect(actionDuMoment?.secondaire).toBeUndefined();
  });
});
