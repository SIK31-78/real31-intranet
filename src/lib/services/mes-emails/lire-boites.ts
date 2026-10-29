// Lecture LIVE des boites du gestionnaire (decision Sekou 2026-08-23 : plus de
// bouton "Synchroniser", plus d'instantane en base). A chaque affichage : ingestion
// Graph des boites visibles -> pipeline DETERMINISTE (nettoyage, rattachement copro,
// regroupement par fil) -> cartes.
//
// Le « lu » vient d'Outlook (REA-422, 27/10/2026) : lu dans Outlook ou dans l'intranet, le
// mail est lu partout (le service fusionne ensuite avec l'etat intranet). Lu par une
// lecture legere (id + isRead) EN PARALLELE de l'ingestion, le temps que l'ingestion
// demande elle-meme isRead ; une panne de cette lecture laisse les mails « non lus ».
//
// Aucun modele : le rattachement copro ne coute rien (recherche de texte, annuaire,
// heritage par fil), il n'a jamais ete de l'IA. L'ancien cache de classification et le
// brouillon IA ont ete retires le 27/10/2026 (REA-423) : chaque mail sort en type
// « autre ». Passe par le routeur (ADR-001).

import type { MailEntrant } from "@/lib/domain/mes-emails";
import { reponseDepuisVerbe } from "@/lib/domain/mes-emails";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { BoiteMail } from "@/lib/domain/boites-mail";
import type { Copropriete } from "@/lib/domain/copropriete";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import { cleanBody, significantAttachments } from "@/lib/domain/tri-mail/clean";
import { groupAffaires } from "@/lib/domain/tri-mail/group";
import { resoudreExpediteur } from "@/lib/domain/tri-mail/sender";
import { getMailboxProvider, getMailIngestionProvider, getMesEmailsEtatRepository, getReferentielTriProvider } from "@/lib/adapters/router";
import { cleDeReference, suggererCopro, type ReferentielTri } from "@/lib/domain/tri-emails";
import { boiteTri, recuDepuisDebutTri } from "@/lib/domain/mail-gate";
import { jourParis } from "@/lib/services/date-du-jour";
import { signalerException, tracer } from "@/lib/observabilite";
import { boiteDe } from "@/lib/services/tri-emails/acces";
import { travailDistribue } from "@/lib/domain/mes-emails-liste";
import { distributionDatee, distributionDe, mailsParDelegation } from "./boites-visibles";
import { statutPartage, type StatutEcrit } from "./statut-partage";

// Plafond par BOITE (et non global) : une boite partagee tres active ne doit pas
// chasser les mails de la boite personnelle de l'affichage. Boite perso : 40 par defaut,
// soit UNE page Graph (mesure prod du 14/10 : 80 mails = deux allers-retours de 1,1 s en
// serie) ; « Plus de mails » en demande davantage.
export const MAX_PERSO = 40;

/** Les agences des boites partagees affichees, et celles de la boite de mon agence. */
async function agencesDuReferentiel(g: Gestionnaire, boites: BoiteMail[]): Promise<string[]> {
  const miennes = (await boiteDe(g).catch(() => null))?.agences ?? [];
  const partagees = boites.filter((b) => !b.personnelle).flatMap((b) => boiteTri(b.adresse)?.agences ?? []);
  return [...new Set([...miennes, ...partagees])];
}
/**
 * Boite PARTAGEE : on lit TOUS ses mails encore a traiter, et seulement eux (la liste n'a plus
 * d'onglet « Conclus »), decision de Sekou n° 7 du 29/10/2026. Jusque-la on lisait les 80 derniers distribues, traites
 * compris : a 30 mails par jour et par binome, un mail non traite de plus de trois jours sortait
 * de la liste et du chiffre sans prevenir (defaut D4 de l'audit UX). Garde-fou : au-dela de
 * MAX_A_TRAITER mails a traiter, les plus anciens ne sont pas lus (Graph, poids de la page) mais
 * restent comptes (`horsListe`) et l'ecran le dit.
 */
export const MAX_A_TRAITER = 200;

export interface TriageLive {
  mails: MailEntrant[];
  /** Nombre de mails bruts remontes, toutes boites confondues. */
  nbMailsAnalyses: number;
  /** La boite perso a rempli son plafond : un « Plus de mails » a du sens. */
  plusDeMails: boolean;
  /** Adresses des boites qui n'ont pas pu etre lues (droits Exchange, panne Graph) :
   *  l'ecran le dit au lieu d'afficher une liste vide (27/10/2026). */
  erreurs: string[];
  /** Par boite partagee : les mails a traiter non lus faute de place (au-dela de MAX_A_TRAITER). */
  horsListe: Record<string, number>;
  /** Mails des boites partagees marques traites aujourd'hui (l'ecran a 0 : « Tout est traite »). */
  traitesAujourdhui: number;
}

// Le jour de réception À PARIS : Graph horodate en UTC, et `receivedAt.slice(0, 10)` faisait
// basculer d'un jour les mails reçus après 22 h ou 23 h (bug B6, 27/10/2026).
function jourDe(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : jourParis(d);
}

function nomCourt(from: string): string {
  const e = resoudreExpediteur(from);
  if (e.type === "interne") return `${e.nom} (real31)`;
  return (from.split("@")[0] ?? from).replace(/[._]/g, " ");
}

/** Marge de la fenetre du lu sur la boite perso : un mail arrive entre les deux lectures. */
const MARGE_LU = 10;

/** Le lu d'Outlook, best-effort : sans lui, l'ecran reste lisible (tout « non lu »). */
function etatsLu(p: { boite: string; internetMessageIds: string[] } | { boite: string; recents: number }): Promise<Map<string, boolean>> {
  return getMailboxProvider()
    .lireEtatsLu(p)
    .catch((err: unknown) => {
      console.warn(`[mes-emails] lu Outlook illisible pour ${p.boite} :`, err instanceof Error ? err.message : err);
      return new Map<string, boolean>();
    });
}

/**
 * Ingere UNE boite. Boite perso : sa reception. Boite PARTAGEE : seulement les mails que le
 * tri a distribues aux binomes du gestionnaire (journal), relus par leur internetMessageId,
 * avec la copro choisie au tri. Une boite en echec (droits Exchange, panne Graph) ne fait
 * pas tomber l'ecran : on signale (Sentry) et on rend une liste vide, avec `erreur` pour
 * que l'ecran dise que la boite n'a pas pu etre lue (jusqu'au 27/10/2026 : liste vide muette).
 */
async function ingererBoite(
  g: Gestionnaire,
  boite: BoiteMail,
  maxPerso: number,
): Promise<{
  boite: BoiteMail;
  bruts: RawMail[];
  luOutlook: Map<string, boolean>;
  pour?: Map<string, string>;
  erreur?: string;
  horsListe?: number;
  traitesAujourdhui?: number;
}> {
  try {
    const ingestion = getMailIngestionProvider();
    if (boite.personnelle) {
      // Boite perso d'un titulaire, ouverte par delegation de portefeuille (complement d'ADR-041,
      // 27/10/2026) : chaque lecture laisse une trace (qui lit la boite de qui, sans contenu).
      if (boite.pour) tracer("mail-delegation", `${g.email ?? g.id} lit ${boite.adresse}`, { beneficiaire: g.id, titulaire: boite.adresse });
      const [bruts, luOutlook] = await Promise.all([
        ingestion.lireRecents({ email: boite.adresse, max: maxPerso }),
        etatsLu({ boite: boite.adresse, recents: maxPerso + MARGE_LU }),
      ]);
      return { boite, bruts, luOutlook, ...(boite.pour ? { pour: new Map(bruts.map((m) => [m.internetMessageId, boite.pour!])) } : {}) };
    }
    const [distribues, dates, pour] = await Promise.all([
      distributionDe(g, boite.adresse),
      distributionDatee(g, boite.adresse),
      mailsParDelegation(g, boite.adresse),
    ]);
    if (distribues.size === 0) return { boite, bruts: [], luOutlook: new Map() };
    // Ce qui reste a traiter, d'apres les statuts communs (meme regle que la pastille). Rien
    // d'avant la mise en service, juge ici sur la date de rangement (puis sur la reception).
    const tous = [...distribues.keys()].filter((id) => recuDepuisDebutTri(dates.get(id) ?? "", boite.adresse));
    const statuts = await getMesEmailsEtatRepository()
      .getStatutsDesMails(tous)
      .catch((): StatutEcrit[] => []);
    const parMail = new Map<string, StatutEcrit[]>();
    for (const l of statuts) parMail.set(l.emailId, [...(parMail.get(l.emailId) ?? []), l]);
    const travail = travailDistribue(tous, (id) => statutPartage(boite.adresse, parMail.get(id) ?? []), jourParis());
    const ids = travail.aTraiter.slice(0, MAX_A_TRAITER);
    const horsListe = travail.aTraiter.length - ids.length;
    const aLire = new Set(ids);
    if (ids.length === 0) return { boite, bruts: [], luOutlook: new Map(), traitesAujourdhui: travail.traitesAujourdhui };
    const [lus, luOutlook] = await Promise.all([
      ingestion.lireParIds
        ? ingestion.lireParIds(boite.adresse, ids)
        : ingestion.lireRecents({ email: boite.adresse, max: 200 }).then((l) => l.filter((m) => aLire.has(m.internetMessageId))),
      etatsLu({ boite: boite.adresse, internetMessageIds: ids }),
    ]);
    // Rien d'avant la mise en service : les rangements des essais ne reviennent pas « a traiter ».
    const bruts = lus.filter((m) => recuDepuisDebutTri(m.receivedAt, boite.adresse));
    // La copro decidee au tri fait foi (choix humain) : on la pose avant toute deduction.
    for (const m of bruts) m.copro = distribues.get(m.internetMessageId) ?? "";
    return { boite, bruts, luOutlook, pour, horsListe, traitesAujourdhui: travail.traitesAujourdhui };
  } catch (err) {
    console.warn(`[mes-emails] boite ${boite.adresse} illisible :`, (err as Error).message);
    signalerException(err, { source: "mes-emails-lecture", detail: { boite: boite.adresse } });
    return { boite, bruts: [], luOutlook: new Map(), erreur: boite.adresse };
  }
}

/**
 * Lit en direct toutes les boites visibles et construit les cartes.
 * AUCUNE ecriture : ni cache de triage, ni appel au modele.
 */
export async function lireBoitesLive(
  g: Gestionnaire,
  boites: BoiteMail[],
  coprosEnCours: Copropriete[] | Promise<Copropriete[]>,
  maxPerso: number = MAX_PERSO,
): Promise<TriageLive> {
  if (boites.length === 0) return { mails: [], nbMailsAnalyses: 0, plusDeMails: false, erreurs: [], horsListe: {}, traitesAujourdhui: 0 };

  // Boites, portefeuille (ESTALE en direct) et referentiel du tri sont lus EN PARALLELE :
  // leurs latences ne s'additionnent pas (mesure prod du 14/10 : jusqu'a 7 s en serie).
  const [parBoite, copros, referentiel] = await Promise.all([
    Promise.all(boites.map((b) => ingererBoite(g, b, maxPerso))),
    Promise.resolve(coprosEnCours),
    // Les copros des agences des boites partagees affichees et de mon agence (27/10/2026).
    agencesDuReferentiel(g, boites)
      .then((agences) => getReferentielTriProvider(agences).charger())
      .catch((): ReferentielTri | null => null),
  ]);
  const nomDe = new Map(copros.map((c) => [c.code, c.nom]));
  const coproNomDe = (code: string) => nomDe.get(code) ?? (code || "Non rattaché");
  // L'adresse, pour les modeles (« Immeuble concerné : {{copro_adresse}} ») : le portefeuille,
  // sinon le referentiel du tri (copro d'un autre binome sur la boite partagee).
  const adresseDe = new Map<string, string>();
  for (const c of referentiel?.copros ?? []) if (c.adresse) adresseDe.set(cleDeReference(c.reference) ?? c.reference, c.adresse);
  for (const c of copros) {
    const a = [c.adresse.ligne1, `${c.adresse.codePostal} ${c.adresse.ville}`.trim()].filter(Boolean).join(" ");
    if (a) adresseDe.set(cleDeReference(c.code) ?? c.code, a);
  }
  const coproAdresseDe = (code: string) => (code ? adresseDe.get(cleDeReference(code) ?? code) : undefined);
  // La boite perso est pleine : il en reste sans doute d'autres a charger.
  const plusDeMails = parBoite.some(({ boite, bruts: lot }) => boite.personnelle && lot.length >= maxPerso);
  const erreurs = parBoite.flatMap(({ erreur }) => (erreur ? [erreur] : []));
  const horsListe: Record<string, number> = {};
  for (const p of parBoite) if (p.horsListe) horsListe[p.boite.id] = p.horsListe;
  const traitesAujourdhui = parBoite.reduce((n, p) => n + (p.traitesAujourdhui ?? 0), 0);
  const boiteDe = new Map<string, string>();
  // Le lu d'Outlook de chaque mail brut (cle : id Graph, unique d'une boite a l'autre).
  const luDe = new Map<string, boolean>();
  // Pour qui le mail est arrive par delegation (badge « Pour Fanny S. »), par id Graph.
  const pourDe = new Map<string, string>();
  const bruts: RawMail[] = [];
  for (const { boite, bruts: lot, luOutlook, pour } of parBoite) {
    for (const b of lot) {
      boiteDe.set(b.id, boite.id);
      luDe.set(b.id, luOutlook.get(b.internetMessageId) ?? false);
      const p = pour?.get(b.internetMessageId);
      if (p) pourDe.set(b.id, p);
      bruts.push(b);
    }
  }
  if (bruts.length === 0) return { mails: [], nbMailsAnalyses: 0, plusDeMails: false, erreurs, horsListe, traitesAujourdhui };

  // Copro des mails que le tri n'a pas tranches : le MOTEUR DU TRI (codes, annuaire ESTALE+Crypto,
  // immatriculation, nom/adresse hors signature), seulement quand il est SUR. L'ancien
  // detecteur (texte entier, signature comprise) rattachait tout a S158 « place Michelet ».
  if (referentiel) {
    for (const b of bruts) {
      if (b.copro) continue;
      const s = suggererCopro({ deAdresse: b.from, objet: b.subject, apercu: b.bodyText.slice(0, 4000) }, referentiel);
      if (s.nature === "sure") b.copro = s.candidats[0]!;
    }
  }
  // Codes du tri (ESTALE « S0302 », Crypto « S247 ») ramenes au code du portefeuille.
  const codeDe = new Map(copros.map((c) => [cleDeReference(c.code) ?? c.code, c.code]));
  const nomTri = new Map((referentiel?.copros ?? []).map((c) => [cleDeReference(c.reference) ?? c.reference, c.nom]));
  for (const b of bruts) {
    if (!b.copro) continue;
    const cle = cleDeReference(b.copro) ?? b.copro;
    b.copro = codeDe.get(cle) ?? b.copro;
    if (!nomDe.has(b.copro) && nomTri.has(cle)) nomDe.set(b.copro, nomTri.get(cle)!);
  }

  // Les affaires servent de CONTEXTE (le fil auquel un mail appartient) : on ne plie
  // PAS la liste. Un mail = une carte (decision Sekou 2026-06-25).
  const affaires = groupAffaires(bruts).sort((a, b) => b.last.localeCompare(a.last));

  // Heritage par fil : un mail sans copro herite de celle d'un autre mail du meme fil
  // (les reponses ne re-citent pas toujours la copro).
  for (const aff of affaires) {
    const coproDuFil = aff.mails.find((m) => m.copro)?.copro;
    if (!coproDuFil) continue;
    if (!aff.copro) aff.copro = coproDuFil;
    for (const m of aff.mails) if (!m.copro) m.copro = coproDuFil;
  }

  const idxAffaireDe = new Map<string, number>();
  affaires.forEach((aff, i) => {
    for (const m of aff.mails) idxAffaireDe.set(m.id, i);
  });

  // Un mail = une carte, les plus recents d'abord.
  const tous = [...bruts].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  const mails: MailEntrant[] = tous.map((m) => {
    const idx = idxAffaireDe.get(m.id);
    const aff = idx !== undefined ? affaires[idx] : undefined;
    const filMultiple = (aff?.mails.length ?? 1) > 1;
    const corps = cleanBody(m);
    return {
      id: m.internetMessageId || m.id,
      boite: boiteDe.get(m.id) ?? boites[0]!.id,
      ...(pourDe.has(m.id) ? { pour: pourDe.get(m.id)! } : {}),
      de: m.fromName || nomCourt(m.from),
      // L'adresse réelle, même d'un collègue : on doit pouvoir lui répondre (comme Outlook).
      expediteurEmail: m.from,
      destinataires: m.to,
      copie: (m.ccDetail ?? []).map((c) => c.adresse),
      ...(m.toDetail?.length ? { destinatairesDetail: m.toDetail } : {}),
      ...(m.ccDetail?.length ? { copieDetail: m.ccDetail } : {}),
      ...(reponseDepuisVerbe(m.dernierVerbe) ? { reponseOutlook: reponseDepuisVerbe(m.dernierVerbe)! } : {}),
      ...(m.replyTo?.length && m.replyTo.some((r) => r.adresse.toLowerCase() !== m.from.toLowerCase()) ? { repondreA: m.replyTo } : {}),
      objet: m.subject || "(sans objet)",
      date: jourDe(m.receivedAt),
      recuLe: m.receivedAt,
      coproCode: m.copro,
      coproNom: coproNomDe(m.copro),
      ...(coproAdresseDe(m.copro) ? { coproAdresse: coproAdresseDe(m.copro)! } : {}),
      lu: luDe.get(m.id) ?? false,
      corps: corps || "(corps vide)",
      attachments: significantAttachments(m).map((x) => ({ nom: x.name })),
      type: "autre",
      rattachement: {
        statut: filMultiple ? "existant" : "nouveau",
        dossierId: idx !== undefined ? `S${idx + 1}` : `N-${m.id}`,
        dossierLabel: aff?.label ?? (m.subject || "(sans objet)"),
      },
    };
  });

  return { mails, nbMailsAnalyses: bruts.length, plusDeMails, erreurs, horsListe, traitesAujourdhui };
}
