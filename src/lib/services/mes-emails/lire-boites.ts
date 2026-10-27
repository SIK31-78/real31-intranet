// Lecture LIVE des boites du gestionnaire (decision Sekou 2026-08-23 : plus de
// bouton "Synchroniser", plus d'instantane en base). A chaque affichage : ingestion
// Graph des boites visibles -> pipeline DETERMINISTE (prefiltre, nettoyage,
// rattachement copro, regroupement par fil) -> cartes.
//
// Ce qui a disparu par rapport a la synchro : l'appel au modele au chargement. Le
// pipeline de rattachement copro, lui, RESTE : il ne coute rien (recherche de texte,
// annuaire Crypto, heritage par fil), il n'a jamais ete de l'IA. Les classifications
// deja calculees par le passe sont relues du cache EN LOT, sans jamais rappeler le
// modele ; un mail jamais analyse sort simplement sans type ("autre"), et le
// brouillon IA reste declenche a la demande. Passe par le routeur (ADR-001).

import type { BadgeUrgence, Dossier, MailEntrant, TypeMail, UrgenceTon } from "@/lib/domain/mes-emails";
import { reponseDepuisVerbe } from "@/lib/domain/mes-emails";
import type { Severite } from "@/lib/domain/commun";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { BoiteMail } from "@/lib/domain/boites-mail";
import type { Copropriete } from "@/lib/domain/copropriete";
import type { AnalyseCachee } from "@/lib/ports/analyse-cache-store";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import { cleanBody, significantAttachments } from "@/lib/domain/tri-mail/clean";
import { groupAffaires } from "@/lib/domain/tri-mail/group";
import { resoudreExpediteur } from "@/lib/domain/tri-mail/sender";
import {
  getAnalyseCacheStore,
  getMailIngestionProvider,
  getReferentielTriProvider,
} from "@/lib/adapters/router";
import { cleDeReference, suggererCopro, type ReferentielTri } from "@/lib/domain/tri-emails";
import { recuDepuisDebutTri } from "@/lib/domain/mail-gate";
import { jourParis } from "@/lib/services/date-du-jour";
import { signalerException } from "@/lib/observabilite";
import { distributionDe } from "./boites-visibles";

// Plafond par BOITE (et non global) : une boite partagee tres active ne doit pas
// chasser les mails de la boite personnelle de l'affichage. Boite perso : 40 par defaut,
// soit UNE page Graph (mesure prod du 14/10 : 80 mails = deux allers-retours de 1,1 s en
// serie) ; « Plus de mails » en demande davantage.
export const MAX_PERSO = 40;
const MAX_PARTAGEE = 80;
// Bumpe cette version si tu changes les prompts/modele -> le cache se reanalyse tout seul.
// v3 : invalide les sorties MOCK mises en cache quand MISTRAL_API_KEY etait absent
// (le routeur servait le mock) ; force la reanalyse via le vrai modele.
const VERSION_ANALYSE = "v3";

export interface TriageLive {
  mails: MailEntrant[];
  dossiers: Dossier[];
  /** Nombre de mails bruts remontes, toutes boites confondues. */
  nbMailsAnalyses: number;
  /** La boite perso a rempli son plafond : un « Plus de mails » a du sens. */
  plusDeMails: boolean;
  /** Adresses des boites qui n'ont pas pu etre lues (droits Exchange, panne Graph) :
   *  l'ecran le dit au lieu d'afficher une liste vide (27/10/2026). */
  erreurs: string[];
}

function priorite(type: TypeMail, ticketable: boolean): Severite {
  if (!ticketable) return "ok";
  if (type === "sinistre_degat_eaux" || type === "panne_intervention") return "late";
  return "soon";
}

function badge(p: Severite): BadgeUrgence {
  if (p === "late") return { texte: "URGENT", ton: "err" as UrgenceTon };
  if (p === "soon") return { texte: "À TRAITER", ton: "warn" as UrgenceTon };
  return { texte: "INFO", ton: "neutral" as UrgenceTon };
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

/**
 * Ingere UNE boite. Boite perso : sa reception. Boite PARTAGEE : seulement les mails que le
 * tri a distribues aux binomes du gestionnaire (journal), relus par leur internetMessageId,
 * avec la copro choisie au tri. Une boite en echec (droits Exchange, panne Graph) ne fait
 * pas tomber l'ecran : on signale (Sentry) et on rend une liste vide, avec `erreur` pour
 * que l'ecran dise que la boite n'a pas pu etre lue (jusqu'au 27/10/2026 : liste vide muette).
 */
async function ingererBoite(g: Gestionnaire, boite: BoiteMail, maxPerso: number): Promise<{ boite: BoiteMail; bruts: RawMail[]; erreur?: string }> {
  try {
    const ingestion = getMailIngestionProvider();
    if (boite.personnelle) return { boite, bruts: await ingestion.lireRecents({ email: boite.adresse, max: maxPerso }) };
    const distribues = await distributionDe(g, boite.adresse);
    if (distribues.size === 0) return { boite, bruts: [] };
    const ids = [...distribues.keys()].slice(0, MAX_PARTAGEE);
    const lus = ingestion.lireParIds
      ? await ingestion.lireParIds(boite.adresse, ids)
      : (await ingestion.lireRecents({ email: boite.adresse, max: 200 })).filter((m) => distribues.has(m.internetMessageId));
    // Rien d'avant la mise en service : les rangements des essais ne reviennent pas « a traiter ».
    const bruts = lus.filter((m) => recuDepuisDebutTri(m.receivedAt));
    // La copro decidee au tri fait foi (choix humain) : on la pose avant toute deduction.
    for (const m of bruts) m.copro = distribues.get(m.internetMessageId) ?? "";
    return { boite, bruts };
  } catch (err) {
    console.warn(`[mes-emails] boite ${boite.adresse} illisible :`, (err as Error).message);
    signalerException(err, { source: "mes-emails-lecture", detail: { boite: boite.adresse } });
    return { boite, bruts: [], erreur: boite.adresse };
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
  if (boites.length === 0) return { mails: [], dossiers: [], nbMailsAnalyses: 0, plusDeMails: false, erreurs: [] };

  // Boites, portefeuille (ESTALE en direct) et referentiel du tri sont lus EN PARALLELE :
  // leurs latences ne s'additionnent pas (mesure prod du 14/10 : jusqu'a 7 s en serie).
  const [parBoite, copros, referentiel] = await Promise.all([
    Promise.all(boites.map((b) => ingererBoite(g, b, maxPerso))),
    Promise.resolve(coprosEnCours),
    getReferentielTriProvider().charger().catch((): ReferentielTri | null => null),
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
  const boiteDe = new Map<string, string>();
  const bruts: RawMail[] = [];
  for (const { boite, bruts: lot } of parBoite) {
    for (const b of lot) {
      boiteDe.set(b.id, boite.id);
      bruts.push(b);
    }
  }
  if (bruts.length === 0) return { mails: [], dossiers: [], nbMailsAnalyses: 0, plusDeMails: false, erreurs };

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

  // Classifications DEJA calculees, relues en LOT. Aucun appel au modele ici : un mail
  // jamais analyse sort en "autre" / non ticketable, ce qui est honnete (on ne sait pas)
  // et n'empeche rien -- le brouillon IA reste declenchable a la demande.
  const cache = await getAnalyseCacheStore().lirePar(
    g.id,
    tous.map((m) => m.internetMessageId).filter(Boolean),
  );
  const analyseDe = (imid: string): AnalyseCachee => {
    const an = cache.get(imid);
    if (an && an.promptVersion === VERSION_ANALYSE) return an;
    return {
      internetMessageId: imid,
      type: "autre",
      ticketable: false,
      estNouveauTicket: true,
      confidence: 0,
      rationale: "non analysé (lecture live)",
      brouillon: "",
      etapes: [],
      promptVersion: "absent",
    } satisfies AnalyseCachee;
  };

  const mails: MailEntrant[] = tous.map((m) => {
    const an = analyseDe(m.internetMessageId);
    const idx = idxAffaireDe.get(m.id);
    const aff = idx !== undefined ? affaires[idx] : undefined;
    const filMultiple = (aff?.mails.length ?? 1) > 1;
    const prio = priorite(an.type, an.ticketable);
    const corps = cleanBody(m);
    return {
      id: m.internetMessageId || m.id,
      boite: boiteDe.get(m.id) ?? boites[0]!.id,
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
      lu: false,
      corps: corps || "(corps vide)",
      attachments: significantAttachments(m).map((x) => ({ nom: x.name })),
      type: an.type,
      ticketable: an.ticketable,
      priorite: prio,
      badge: badge(prio),
      rattachement: {
        statut: filMultiple ? "existant" : "nouveau",
        dossierId: idx !== undefined ? `S${idx + 1}` : `N-${m.id}`,
        dossierLabel: aff?.label ?? (m.subject || "(sans objet)"),
        ...(filMultiple ? { confiance: Math.round(an.confidence * 100) } : {}),
      },
      ...(an.brouillon ? { brouillonReponse: an.brouillon } : {}),
      flow: an.etapes.map((e, k) => ({ ordre: k + 1, libelle: e })),
    };
  });

  // Dossiers : un par affaire (fil), pour le contexte/historique.
  const dossiers: Dossier[] = affaires.map((aff, i) => {
    const parDate = [...aff.mails].sort((x, y) => y.receivedAt.localeCompare(x.receivedAt));
    const tete = parDate[0]!;
    return {
      id: `S${i + 1}`,
      label: aff.label,
      coproCode: aff.copro,
      coproNom: coproNomDe(aff.copro),
      type: analyseDe(tete.internetMessageId).type,
      historique: parDate.slice(0, 8).map((m) => ({
        date: jourDe(m.receivedAt),
        acteur: nomCourt(m.from),
        resume: (m.subject || cleanBody(m).slice(0, 60) || "mail").slice(0, 90),
        kind: "mail" as const,
      })),
    };
  });

  return { mails, dossiers, nbMailsAnalyses: bruts.length, plusDeMails, erreurs };
}
