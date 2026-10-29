// Pastille de l'entrée « E-mails » de la barre latérale : le chiffre unique « À traiter »
// (décision de Sekou n° 1, 29/10/2026 ; règle pure : `repartirChiffre`, domaine). Le même nombre
// que le titre de l'écran : les mails de la boîte de travail (boîtes partagées triées,
// distribués à mon binôme) ni traités ni partis ailleurs, lus ou non, sans plafond. La boîte
// perso ne compte plus (jusqu'au 29/10/2026 : ses non-lus d'Outlook, et la pastille comptait
// des non-lus partout).
//
// Même contrainte que la pastille du tri : la barre latérale s'affiche sur TOUTES les pages et
// ne doit jamais les ralentir. Gardé une minute par personne, abandonné au-delà de 1,5 s (pas
// de pastille plutôt qu'une page lente). Supabase seulement (journal du tri, statut commun) :
// AUCUN appel Graph depuis le 29/10/2026.
//
// Écarts connus avec l'écran (qui compte sa liste) : un mail effacé d'Outlook à la main reste
// distribué ici ; le retard se mesure depuis le rangement par le tri (l'écran : depuis la
// réception, en général le même jour) ; la mise en service du tri se juge sur la date de
// rangement. Sur l'écran E-mails lui-même, la pastille prend le chiffre de l'écran.
//
// Chiffre PERSONNEL (révision de Sekou du 29/10/2026, ADR-053) : `optionsEquipe` branche l'état
// d'équipe (attribution, en attente / de côté) et les relances dues ; le principal devient « à
// moi », les non attribués « à répartir ». Tant que les tables ne sont pas créées (lecture
// null), le chiffre reste celui du binôme (provisoire), sans erreur.

import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import {
  enRetard,
  entreeRelance,
  etatPourChiffre,
  modeChiffre,
  MODE_PROVISOIRE,
  repartirChiffre,
  travailDistribue,
  type ChiffreATraiter,
  type EntreeChiffre,
  type EtatEquipeMail,
  type ModeChiffre,
} from "@/lib/domain/mes-emails-liste";
import { recuDepuisDebutTri } from "@/lib/domain/mail-gate";
import { getMesEmailsEtatRepository } from "@/lib/adapters/router";
import { jourParis } from "@/lib/services/date-du-jour";
import type { BoiteMail } from "@/lib/domain/boites-mail";
import { boitesVisibles, distributionDatee } from "./boites-visibles";
import { etatEquipeDesMails, relancesDesBoites } from "./boite-equipe";
import { statutPartage, type StatutEcrit } from "./statut-partage";

const TTL_MS = 60_000;
const DELAI_MAX_MS = 1_500;

/** Le chiffre de la pastille, et les traités du jour (l'écran à 0 : « Tout est traité »). */
export type CompteurEmails = ChiffreATraiter & { traitesAujourdhui: number };

const cache = new Map<string, { valeur: CompteurEmails; expire: number }>();

/** `role` : la pastille d'un comptable compte le dossier « Comptabilité » des boîtes triées (28/10/2026). */
type Personne = Pick<Gestionnaire, "id" | "email" | "agencyId" | "role">;

/** L'état d'équipe des mails d'une boîte (attribution, en attente) ; null = tables absentes. */
export type LireEtatEquipe = (boite: string, internetMessageIds: string[]) => Promise<ReadonlyMap<string, EtatEquipeMail> | null>;

/** Les relances dues des boîtes partagées (mails envoyés sans réponse) ; null = tables absentes. */
export type LireRelances = (boites: BoiteMail[]) => Promise<EntreeChiffre[] | null>;

export interface OptionsCompteur {
  superAdmin: boolean;
  incarnation: boolean;
  etatEquipe?: LireEtatEquipe;
  relances?: LireRelances;
  /** Le mode quand l'état d'équipe est lisible ; une lecture null ramène au provisoire. */
  mode?: ModeChiffre;
}

/**
 * Le chiffre personnel de cette personne : l'état d'équipe et les relances dues lus dans les
 * tables de la boîte d'équipe (ADR-053). Sans les tables : provisoire (le binôme).
 */
export function optionsEquipe(g: Pick<Personne, "email" | "role">): Pick<OptionsCompteur, "etatEquipe" | "relances" | "mode"> {
  const lecteur = { ...(g.email ? { email: g.email } : {}), ...(g.role ? { role: g.role } : {}) };
  return {
    mode: modeChiffre(true, g.email),
    etatEquipe: async (boite, ids) => {
      const r = await etatEquipeDesMails(
        ids.map((internetMessageId) => ({ internetMessageId, boite })),
        { lecteur },
      );
      if (!r.actif) return null;
      return new Map([...r.parMail].map(([id, e]) => [id, etatPourChiffre(e)]));
    },
    relances: async (boites) => {
      const r = await relancesDesBoites(
        boites.filter((b) => !b.personnelle).map((b) => ({ id: b.id, personnelle: false })),
        { lecteur },
      );
      return r === null ? null : r.filter((x) => x.statut === "a-traiter").map(entreeRelance);
    },
  };
}

/** Le compte, sans cache ni délai : toutes les boîtes partagées en parallèle. */
async function compter(g: Personne, opts: OptionsCompteur): Promise<CompteurEmails> {
  const boites = await boitesVisibles(g, { superAdmin: opts.superAdmin, sansBoitePerso: opts.incarnation });
  const etats = getMesEmailsEtatRepository();
  const maintenant = new Date();
  const aujourdhui = jourParis(maintenant);
  const parBoite = await Promise.all(
    boites
      .filter((b) => !b.personnelle)
      .map(async (b) => {
        const dates = await distributionDatee(g, b.adresse);
        // Rien d'avant la mise en service du tri (comme l'écran), jugé sur la date de rangement.
        const ids = [...dates].filter(([, faitLe]) => recuDepuisDebutTri(faitLe, b.adresse)).map(([id]) => id);
        if (ids.length === 0) return { entrees: [] as EntreeChiffre[], traitesAujourdhui: 0, equipeLue: true };
        const statuts = await etats.getStatutsDesMails(ids);
        const parMail = new Map<string, StatutEcrit[]>();
        for (const l of statuts) parMail.set(l.emailId, [...(parMail.get(l.emailId) ?? []), l]);
        const travail = travailDistribue(ids, (id) => statutPartage(b.adresse, parMail.get(id) ?? []), aujourdhui);
        const equipe = opts.etatEquipe ? await opts.etatEquipe(b.adresse, travail.aTraiter) : null;
        const entrees = travail.aTraiter.map((id): EntreeChiffre => {
          const etat = equipe?.get(id);
          return { ...(etat ? { etat } : {}), retard: enRetard(dates.get(id), maintenant) };
        });
        return { entrees, traitesAujourdhui: travail.traitesAujourdhui, equipeLue: !opts.etatEquipe || equipe !== null };
      }),
  );
  const relances = opts.relances ? await opts.relances(boites) : [];
  // Une lecture d'équipe impossible (tables absentes) : tout le monde au provisoire, sans les
  // états partiels (un chiffre personnel à moitié serait faux).
  const equipeLue = relances !== null && parBoite.every((p) => p.equipeLue);
  const entrees = equipeLue ? [...parBoite.flatMap((p) => p.entrees), ...(relances ?? [])] : parBoite.flatMap((p) => p.entrees.map((e) => ({ retard: e.retard })));
  return {
    ...repartirChiffre(entrees, equipeLue ? (opts.mode ?? MODE_PROVISOIRE) : MODE_PROVISOIRE),
    traitesAujourdhui: parBoite.reduce((n, p) => n + p.traitesAujourdhui, 0),
  };
}

const cle = (g: Personne, incarnation: boolean) => `${g.id}|${incarnation ? "incarne" : "moi"}`;

/**
 * Le chiffre de la pastille, ou null (rien à afficher : délai dépassé, panne). `superAdmin` et
 * `incarnation` viennent de l'appelant (auth), que les services n'importent pas.
 */
export async function compterMailsATraiter(g: Personne, opts: OptionsCompteur): Promise<CompteurEmails | null> {
  const k = cle(g, opts.incarnation);
  const deja = cache.get(k);
  if (deja && Date.now() < deja.expire) return deja.valeur;
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  try {
    const valeur = await Promise.race([
      compter(g, opts),
      new Promise<never>((_, rejeter) => {
        minuterie = setTimeout(() => rejeter(new Error("delai depasse")), DELAI_MAX_MS);
      }),
    ]);
    cache.set(k, { valeur, expire: Date.now() + TTL_MS });
    return valeur;
  } catch {
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

/**
 * Après « Marquer traité », « Comptabilité », « Pas pour moi » ou un archivage : la pastille de
 * cette personne suit tout de suite. Celle des collègues de la boîte partagée suit à
 * l'expiration (une minute).
 */
export function oublierCompteurEmails(gid: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(`${gid}|`)) cache.delete(k);
}
