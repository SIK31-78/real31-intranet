// Les boites de « Mes e-mails », SOURCE UNIQUE pour l'affichage, les actions (autorisation du
// « De : », PJ, classement) et la generation IA.
//
// - Boite perso : sa reception.
// - Boite PARTAGEE = la boite triee de MON agence (config MAIL_TRI_BOITES : syndic4 pour HLS,
//   syndic2 pour LGC et ASN ; V2 du 27/10/2026) ; un super-admin voit toutes les boites
//   triees. On n'y lit QUE les mails que le tri a ranges vers MES dossiers de binome
//   (gestionnaire ou assistant·e), d'apres son journal (decision Sekou du 13/10 : « que le
//   sous-dossier du binome, pas tous les mails »). Le journal marche en simulation (mail reste
//   en reception) comme en reel (mail deplace dans le dossier du binome) : on relit les mails
//   par leur internetMessageId, ou qu'ils soient. Jamais toute la boite commune.
// - Isolation (27/10/2026) : une action sur un mail d'une boite partagee exige que ce mail
//   soit distribue a l'un de MES binomes (mailDistribue) ; les actions de l'ecran combinent
//   ce controle avec estSuperAdmin (auth), qui en est exempte.
// - Delegation de portefeuille (complement d'ADR-041, 27/10/2026) : un titulaire qui m'a confie
//   son portefeuille (delegation active) ajoute a ma distribution les dossiers de SES binomes
//   (gestionnaire ou assistant·e), et sa boite partagee a mes boites s'il est d'une autre
//   agence. Une delegation d'agence ou de copro n'ouvre aucun mail (domain/mail-delegation).
//   En incarnation, ce sont les delegations de la personne incarnee qui comptent.
// - Comptables (role COMPTABLE de public."User", decision Sekou du 28/10/2026) : quelle que soit
//   leur agence, TOUTES les boites triees, et dans chacune le seul dossier « Comptabilité »
//   (jamais les dossiers de binomes). Les boites partagees forment un seul onglet
//   « Comptabilité » (regrouperPartagees) ; chaque mail garde sa boite pour les gestes, et le
//   controle des actions (mailDistribue) suit la meme regle.

import { cache } from "react";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { construireBoites, regrouperPartagees, type BoiteMail } from "@/lib/domain/boites-mail";
import { roleComptable } from "@/lib/domain/gestionnaire";
import { boitesTri, type BoiteTriConfig } from "@/lib/domain/mail-gate";
import { avecBoitesPersoDeleguees, nomCourtTitulaire } from "@/lib/domain/mail-delegation";
import { clesDossiersDe, clesDossiersLus, DOSSIERS_HORS_BINOME, type EntreeJournalTri } from "@/lib/domain/tri-emails";
import { getTriRepository } from "@/lib/adapters/router";
import { boiteDe } from "@/lib/services/tri-emails/acces";
import { titulairesDelegants } from "./delegations-mail";

/** La personne : son id sert a lire ses delegations (sans id, aucune), son role a reconnaitre un comptable. */
type Personne = Pick<Gestionnaire, "email" | "agencyId" | "role"> & { id?: string };

/** Fenetre du journal relue : les rangements des 90 derniers jours (45 jusqu'au 29/10/2026 : un mail
 * non traité depuis plus d'un mois et demi sortait du chiffre sans prévenir). */
const FENETRE_JOURS = 90;

/**
 * Ma boite perso, puis la boite triee de mon agence (aucune si mon agence n'a pas de boite),
 * puis les boites perso des titulaires qui m'ont confie leur portefeuille (delegation active,
 * complement d'ADR-041 du 27/10/2026 : « Boite de Fanny S. (delegation) »).
 * `superAdmin` (calcule par l'appelant, auth) : toutes les boites triees. Comptable (role de la
 * table, lu sur `g`) : toutes les boites triees, en un seul onglet « Comptabilité ». La boite
 * fictive « echantillon » n'est jamais une boite a lire (construireBoites l'ecarte).
 */
export async function boitesVisibles(
  g: Personne,
  opts: { superAdmin?: boolean; sansBoitePerso?: boolean } = {},
): Promise<BoiteMail[]> {
  const comptable = roleComptable(g.role);
  const [partagees, titulaires] = await Promise.all([
    opts.superAdmin || comptable ? boitesTri() : boitesPartageesDe(g),
    g.id ? titulairesDelegants(g.id) : [],
  ]);
  // Incarnation (« Changer de gestionnaire ») : jamais la boite perso de la personne incarnee
  // (decision du 27/10/2026), seulement les boites partagees ; ni celles de ses delegations.
  const boites = construireBoites(g.email, partagees.map((b) => b.boite).join(",")).filter((b) => !(opts.sansBoitePerso && b.personnelle)).map((b) =>
    b.personnelle ? b : { ...b, libelle: `${b.libelle} · ${comptable ? "comptabilité" : "mes mails"}` },
  );
  const avecDelegations = avecBoitesPersoDeleguees(boites, titulaires, opts.sansBoitePerso ?? false);
  return comptable ? regrouperPartagees(avecDelegations, DOSSIERS_HORS_BINOME.comptabilite) : avecDelegations;
}

/**
 * La boite triee de mon agence, puis celles des titulaires qui m'ont confie leur portefeuille
 * (une seule fois chacune : un titulaire de ma boite n'en ajoute pas).
 */
async function boitesPartageesDe(g: Personne): Promise<BoiteTriConfig[]> {
  const titulaires = g.id ? await titulairesDelegants(g.id) : [];
  const toutes = await Promise.all([boiteDe(g), ...titulaires.map((t) => boiteDe(t))]);
  const out = new Map<string, BoiteTriConfig>();
  for (const b of toutes) if (b && !out.has(b.boite)) out.set(b.boite, b);
  return [...out.values()];
}

/** Un mail distribue : la copro choisie au tri, et pour qui il est arrive par delegation. */
interface MailDistribue {
  copro: string | null;
  /** « Fanny S. » quand le mail est range chez un binome du titulaire et pas chez les miens. */
  pour: string | null;
  /** Quand le tri l'a range chez le binome (le retard de la pastille, 29/10/2026). */
  faitLe: string;
}

/**
 * Les mails que le tri a distribues a mes binomes dans cette boite : internetMessageId ->
 * reference de la copro choisie au tri (null = rangé sans copro). Le plus recent rangement
 * l'emporte. Corbeille, Comptabilite, Divers et dossiers des autres binomes sont exclus.
 * Les binomes des titulaires qui m'ont confie leur portefeuille comptent comme les miens.
 */
export async function distributionDe(g: Personne, boite: string): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const [id, m] of await distributionDetaillee(g, boite)) out.set(id, m.copro);
  return out;
}

/**
 * Les mails distribues a mes binomes dans cette boite, avec la date de leur rangement :
 * internetMessageId -> faitLe, le plus recent d'abord. La pastille de la barre laterale s'en
 * sert pour le retard (« plus de 2 jours ouvres ») sans lire Outlook (29/10/2026).
 */
export async function distributionDatee(g: Personne, boite: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const [id, m] of await distributionDetaillee(g, boite)) out.set(id, m.faitLe);
  return out;
}

/** Les mails de cette boite arrives par delegation : internetMessageId -> « Fanny S. ». */
export async function mailsParDelegation(g: Personne, boite: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const [id, m] of await distributionDetaillee(g, boite)) if (m.pour) out.set(id, m.pour);
  return out;
}

const cleDe = (g: Personne) => [g.email?.trim().toLowerCase() ?? "", g.id ?? "", roleComptable(g.role)] as const;

function distributionDetaillee(g: Personne, boite: string): Promise<Map<string, MailDistribue>> {
  return distributionEnCache(...cleDe(g), boite.trim().toLowerCase());
}

/**
 * Lu UNE fois par requete serveur (React `cache`, cles primitives) : l'ecran et ses actions
 * demandent la distribution plusieurs fois (garde de chaque action, lecture de la boite), le
 * journal n'est relu qu'une fois.
 */
const distributionEnCache = cache(async (email: string, userId: string, comptable: boolean, boite: string): Promise<Map<string, MailDistribue>> => {
  const out = new Map<string, MailDistribue>();
  const { lignes, pourDeCle } = await rangementsDeMesBinomes(email, userId, comptable, boite);
  for (const e of lignes) {
    if (!out.has(e.internetMessageId)) out.set(e.internetMessageId, { copro: e.coproReference, pour: pourDeCle.get(e.dossierCle ?? "") ?? null, faitLe: e.faitLe });
  }
  return out;
});

/**
 * Ce mail de la boite partagee est-il distribue a l'un de mes binomes ? Le controle d'acces
 * des actions de « E-mails » (isolation par binome, 27/10/2026) : un identifiant de mail d'un
 * autre binome, meme dans la boite de mon agence, est refuse. Pour un comptable : le mail est
 * range dans « Comptabilité » de cette boite (28/10/2026).
 */
export async function mailDistribue(g: Personne, boite: string, internetMessageId: string): Promise<boolean> {
  if (!g.email || !internetMessageId) return false;
  return (await distributionDe(g, boite)).has(internetMessageId);
}

/**
 * Les conversations Graph des mails distribues a mes binomes (REA-408) : les « Envoyés »
 * d'une boite partagee ne montrent que les reponses faites dans ces conversations. Un
 * rangement sans conversation_id (anterieur a la colonne) n'en donne pas.
 */
export async function conversationsDistribuees(g: Personne, boite: string): Promise<Set<string>> {
  const out = new Set<string>();
  const { lignes } = await rangementsDeMesBinomes(...cleDe(g), boite.trim().toLowerCase());
  for (const e of lignes) if (e.conversationId) out.add(e.conversationId);
  return out;
}

/**
 * Les rangements recents de cette boite vers les dossiers de mes binomes (« Comptabilité »
 * pour un comptable, 28/10/2026), les plus recents d'abord. Filtres en base par cle de dossier (27/10/2026) : relire tout le journal puis
 * filtrer ici dependait de son plafond de lignes, et les mails les plus anciens d'un binome
 * disparaissaient de « Mes e-mails » des que la boite etait active.
 */
const rangementsDeMesBinomes = cache(
  async (email: string, userId: string, comptable: boolean, boite: string): Promise<{ lignes: EntreeJournalTri[]; pourDeCle: Map<string, string> }> => {
    if (!email) return { lignes: [], pourDeCle: new Map() };
    const repo = getTriRepository();
    const [binomes, titulaires] = await Promise.all([repo.binomes(), userId ? titulairesDelegants(userId) : []]);
    const miennes = clesDossiersLus({ email, comptable }, binomes);
    // Les dossiers des titulaires qui ne sont pas deja les miens : le badge « Pour Fanny S. ».
    const pourDeCle = new Map<string, string>();
    for (const t of titulaires) {
      for (const cle of clesDossiersDe(t.email, binomes)) {
        if (!miennes.has(cle) && !pourDeCle.has(cle)) pourDeCle.set(cle, nomCourtTitulaire(t.nomComplet) || t.email);
      }
    }
    const depuis = new Date(Date.now() - FENETRE_JOURS * 86_400_000).toISOString();
    return { lignes: await repo.journalPourCles(boite, depuis, [...miennes, ...pourDeCle.keys()]), pourDeCle };
  },
);
