// Ordre et contenu de la liste de l'écran E-mails. Pur, sans dépendance d'infrastructure.
//
// REA-422 (27/10/2026) : l'onglet « Conclus » est retiré, la liste est « À traiter » seule
// (cf. traitesAuChargement).
//
// REA-351 (16/10/2026) : le choix « collègues en haut / en bas » de la liste est retiré le
// 29/10/2026 (Sekou) : la liste reste dans l'ordre chronologique, collègues mêlés aux autres.

import type { MailEntrant, StatutTraitement } from "./mes-emails";
import { ongletDe, type BoiteMail } from "./boites-mail";
import type { EtatEquipeMail as EtatEquipeComplet, RelanceAffichee } from "./boite-equipe";

/**
 * Les mails déjà traités au chargement, absents de « À traiter » (REA-422, 27/10/2026). Boîte
 * PARTAGÉE : le statut commun « classe », posé par « Marquer traité » (le mail reste dans le
 * dossier du binôme, seul l'intranet sait qu'il est traité). Boîte PERSO : aucun, Outlook fait
 * foi. Un mail archivé a quitté la réception et n'est plus lu ; un mail qu'on y a remis
 * (glissé dans Outlook) est de nouveau à traiter, même si la base dit encore « classe ».
 * Un mail sans `boite` (fixture ancienne) est de la boîte perso.
 */
export function traitesAuChargement(
  mails: readonly Pick<MailEntrant, "id" | "boite" | "statutTraitement">[],
  boites: readonly Pick<BoiteMail, "id" | "personnelle">[],
): Set<string> {
  const partagees = new Set(boites.filter((b) => !b.personnelle).map((b) => b.id));
  return new Set(mails.filter((m) => m.statutTraitement === "classe" && m.boite !== undefined && partagees.has(m.boite)).map((m) => m.id));
}

// --- Le chiffre unique « À traiter » (décision de Sekou n° 1, 29/10/2026) ----------------
//
// UN nombre, le même partout (titre de l'écran, onglet de la boîte de travail, barre latérale,
// titre de l'onglet du navigateur) : les mails de la BOÎTE DE TRAVAIL (boîtes partagées triées,
// distribuées à mon binôme ; « Comptabilité » pour un comptable) qui ne sont ni marqués traités
// ni partis ailleurs (Comptabilité, Pas pour moi, autre agence : le rangement est alors annulé
// au journal et le mail n'est plus distribué), LUS OU NON, sans plafond de chargement. La boîte
// perso ne compte pas. Remplace le compteur de non-lus par onglet et la pastille rouge du
// 27/10/2026, qui comptaient des non-lus (et l'écran marquait lu tout seul).
//
// Révision de Sekou (29/10/2026, soir) : UN SEUL chiffre, celui des mails à traiter, attribués
// ou non. Le chiffre personnel (« à moi » en principal, « 3 à répartir » à côté) affichait
// « Rien à traiter pour vous · 22 à répartir » au-dessus de 22 mails tant que personne n'avait
// rien attribué : incompréhensible. « À moi » reste calculé, pour l'onglet du même nom. Un mail
// « en attente » ou « de côté » ne compte nulle part. L'état d'équipe de chaque mail
// (attributaire, en attente) vient d'un service à part : le calcul le prend en entrée.

/** Au-delà de ce nombre de jours ouvrés d'attente, un mail est « en retard » (rouge). */
export const SEUIL_RETARD_JOURS_OUVRES = 2;

const PARIS = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** « AAAA-MM-JJ » de cet instant à Paris ; la chaîne telle quelle si elle n'est pas une date. */
export function jourParisDe(instant: string | Date): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return Number.isNaN(d.getTime()) ? String(instant).slice(0, 10) : PARIS.format(d);
}

/**
 * Jours ouvrés (lundi à vendredi, jours fériés non retirés) écoulés depuis `depuis`, jours de
 * Paris : reçu lundi, mardi = 1, mercredi = 2, jeudi = 3. Le jour de réception ne compte pas.
 */
export function joursOuvresEcoules(depuis: string, maintenant: Date): number {
  const d0 = Date.parse(`${jourParisDe(depuis)}T00:00:00Z`);
  const d1 = Date.parse(`${jourParisDe(maintenant)}T00:00:00Z`);
  if (Number.isNaN(d0) || Number.isNaN(d1) || d1 <= d0) return 0;
  let n = 0;
  for (let t = d0 + 86_400_000; t <= d1; t += 86_400_000) {
    const j = new Date(t).getUTCDay();
    if (j !== 0 && j !== 6) n++;
  }
  return n;
}

/** En attente depuis plus de 2 jours ouvrés : le seul cas où le chiffre passe au rouge. */
export function enRetard(depuis: string | undefined, maintenant: Date): boolean {
  return depuis !== undefined && joursOuvresEcoules(depuis, maintenant) > SEUIL_RETARD_JOURS_OUVRES;
}

/** L'état d'équipe d'un mail, fourni par le service d'attribution (absent : rien de connu). */
export interface EtatEquipeMail {
  /** La personne à qui le mail est attribué ; null = non attribué. */
  attribueA: string | null;
  /** « En attente jusqu'au… » ou « de côté » : hors de tout chiffre tant que ça dure. */
  horsChiffre?: boolean;
}

/** « provisoire » : l'attribution n'est pas lisible (tables absentes), pas de part « à moi ». */
export type ModeChiffre = { type: "provisoire" } | { type: "attribution"; moi: string };

export const MODE_PROVISOIRE: ModeChiffre = { type: "provisoire" };

/**
 * Le mode du chiffre : « attribution » (on compte la part « à moi ») dès que l'état d'équipe est
 * lisible (tables créées) et qu'on sait qui regarde ; sinon provisoire. Adresse en minuscules.
 */
export function modeChiffre(actif: boolean, moi: string | null | undefined): ModeChiffre {
  const m = moi?.trim().toLowerCase();
  return actif && m ? { type: "attribution", moi: m } : MODE_PROVISOIRE;
}

/** L'état d'équipe complet d'un mail (service d'attribution) réduit à ce que compte le chiffre. */
export function etatPourChiffre(e: Pick<EtatEquipeComplet, "attributaire" | "horsATraiter">): EtatEquipeMail {
  return { attribueA: e.attributaire ? e.attributaire.email.trim().toLowerCase() : null, horsChiffre: e.horsATraiter };
}

/**
 * Une relance due (« Relancer si pas de réponse », décision 9) revient dans « À traiter » ; elle
 * est « à moi » pour la personne qui l'a posée.
 */
export function entreeRelance(r: Pick<RelanceAffichee, "parEmail">): EntreeChiffre {
  return { etat: { attribueA: r.parEmail.trim().toLowerCase() }, retard: false };
}

/** Le chiffre « À traiter », sa part en retard, et la part attribuée à moi (l'onglet « À moi »). */
export interface ChiffreATraiter {
  /** LE chiffre : les mails à traiter du binôme, lus ou non, hors en attente / de côté. */
  principal: number;
  /** Dont en attente depuis plus de 2 jours ouvrés (le rouge). */
  enRetard: number;
  /** Dont attribués à moi (0 en mode provisoire) : le nombre de l'onglet « À moi », jamais le titre. */
  aMoi: number;
}

/** Une entrée du calcul : un mail encore à traiter, son état d'équipe et son retard. */
export interface EntreeChiffre {
  etat?: EtatEquipeMail;
  retard: boolean;
}

/**
 * LA règle du chiffre, commune à l'écran et à la barre latérale. Chaque entrée est un mail de
 * la boîte de travail encore à traiter (ni traité ni parti). En attente / de côté : ignoré.
 * Un seul chiffre (Sekou, 29/10/2026, après la mise en ligne : « on comprend rien » avec un
 * chiffre personnel à 0 et 22 mails dans la liste) : tout ce qui est à traiter, attribué ou
 * non. Mode attribution : on compte en plus la part « à moi », pour l'onglet du même nom.
 */
export function repartirChiffre(entrees: Iterable<EntreeChiffre>, mode: ModeChiffre): ChiffreATraiter {
  const out: ChiffreATraiter = { principal: 0, enRetard: 0, aMoi: 0 };
  for (const e of entrees) {
    if (e.etat?.horsChiffre) continue;
    out.principal++;
    if (e.retard) out.enRetard++;
    if (mode.type === "attribution" && e.etat?.attribueA === mode.moi) out.aMoi++;
  }
  return out;
}

/** Une boîte de TRAVAIL : partagée (triée). La boîte perso, la mienne ou déléguée, ne compte pas. */
export function boiteDeTravail(boites: readonly Pick<BoiteMail, "id" | "personnelle">[], boiteId: string | undefined): boolean {
  return boiteId !== undefined && boites.some((b) => b.id === boiteId && !b.personnelle);
}

/**
 * Le chiffre de l'écran, depuis la liste chargée (29/10/2026). `sortis` : traités, archivés ou
 * partis ailleurs (dans cette session ou avant) ; il baisse donc dès le geste, sans recharger.
 * `onglet` : le chiffre d'un seul onglet (celui de la boîte de travail). `horsListe` : les mails
 * à traiter que la liste n'a pas chargés (au-delà du plafond de lecture, par boîte) ; ce sont
 * les plus anciens, comptés en retard, sans état d'équipe connu. `etatDe` : l'état d'équipe.
 */
export function chiffreATraiter<M extends Pick<MailEntrant, "id" | "boite" | "recuLe" | "date">>(
  mails: readonly M[],
  boites: readonly BoiteMail[],
  sortis: ReadonlySet<string>,
  opts: {
    maintenant: Date;
    onglet?: string;
    horsListe?: Readonly<Record<string, number>>;
    etatDe?: (m: M) => EtatEquipeMail | undefined;
    mode?: ModeChiffre;
    /** Les relances dues (mails envoyés), avec leur boîte : comptées comme leur boîte. */
    relances?: readonly Pick<RelanceAffichee, "boite" | "parEmail">[];
  },
): ChiffreATraiter {
  const dansOnglet = (boite: string) => opts.onglet === undefined || ongletDe(boites, boite) === opts.onglet;
  const entrees: EntreeChiffre[] = [];
  for (const m of mails) {
    if (!m.boite || !boiteDeTravail(boites, m.boite) || !dansOnglet(m.boite) || sortis.has(m.id)) continue;
    const etat = opts.etatDe?.(m);
    entrees.push({ ...(etat ? { etat } : {}), retard: enRetard(m.recuLe ?? m.date, opts.maintenant) });
  }
  for (const [boite, n] of Object.entries(opts.horsListe ?? {})) {
    if (boiteDeTravail(boites, boite) && dansOnglet(boite)) for (let i = 0; i < n; i++) entrees.push({ retard: true });
  }
  for (const r of opts.relances ?? []) {
    if (boiteDeTravail(boites, r.boite) && dansOnglet(r.boite)) entrees.push(entreeRelance(r));
  }
  return repartirChiffre(entrees, opts.mode ?? MODE_PROVISOIRE);
}

/** Le statut commun d'un mail distribué (cf. statutPartage, côté service), quand il y en a un. */
export interface StatutDistribue {
  statut: StatutTraitement;
  /** Quand il a été posé (« traités aujourd'hui »). */
  marqueAt?: string;
}

/** Ce que le journal et les statuts disent d'une boîte partagée, sans lire Outlook. */
export interface TravailDistribue {
  /** Les mails encore à traiter, en attente compris (l'état d'équipe les écarte du chiffre,
   *  cf. repartirChiffre), le plus récent rangement d'abord. */
  aTraiter: string[];
  /** Marqués traités aujourd'hui (jour de Paris). */
  traitesAujourdhui: number;
}

/**
 * Le travail d'une boîte partagée, sans plafond (décision n° 7 : un mail plus ancien que les 80
 * derniers reste à traiter). `distribues` : les mails distribués à mes binômes, le plus récent
 * d'abord ; un mail parti ailleurs n'y est plus. Traité = statut commun « classe ».
 */
export function travailDistribue(
  distribues: readonly string[],
  statutDe: (id: string) => StatutDistribue | null,
  aujourdhui: string,
): TravailDistribue {
  const aTraiter: string[] = [];
  let traitesAujourdhui = 0;
  for (const id of distribues) {
    const s = statutDe(id);
    if (s?.statut === "classe") {
      if (s.marqueAt && jourParisDe(s.marqueAt) === aujourdhui) traitesAujourdhui++;
    } else aTraiter.push(id);
  }
  return { aTraiter, traitesAujourdhui };
}

// --- Marquage « lu » (décision n° 2, 29/10/2026) --------------------------------------------

/** Comment un mail arrive dans le volet de lecture. */
export type OuvertureMail =
  /** Clic sur sa ligne dans la liste. */
  | "clic"
  /** Répondre, Répondre à tous ou Transférer sur le mail affiché. */
  | "reponse"
  /** Affiché d'office : arrivée sur l'écran, changement d'onglet, recherche, mail suivant
   *  après un « Traité », actualisation. */
  | "affichage";

/**
 * Le mail est-il marqué lu (dans l'intranet et dans Outlook) ? Seulement quand on l'ouvre
 * vraiment. Jusqu'au 29/10/2026 le premier mail affiché d'office l'était aussi, à chaque
 * frappe dans la recherche : un mail important pouvait passer pour lu sans avoir été vu.
 */
export function marqueLu(ouverture: OuvertureMail, dejaLu: boolean): boolean {
  return !dejaLu && ouverture !== "affichage";
}
