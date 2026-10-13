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
  getCryptoContactsProvider,
  getMailIngestionProvider,
} from "@/lib/adapters/router";

// Plafond par BOITE (et non global) : une boite partagee tres active ne doit pas
// chasser les mails de la boite personnelle de l'affichage.
const MAX_INGEST = 80;
// Bumpe cette version si tu changes les prompts/modele -> le cache se reanalyse tout seul.
// v3 : invalide les sorties MOCK mises en cache quand MISTRAL_API_KEY etait absent
// (le routeur servait le mock) ; force la reanalyse via le vrai modele.
const VERSION_ANALYSE = "v3";

export interface TriageLive {
  mails: MailEntrant[];
  dossiers: Dossier[];
  /** Nombre de mails bruts remontes, toutes boites confondues. */
  nbMailsAnalyses: number;
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

function nomCourt(from: string): string {
  const e = resoudreExpediteur(from);
  if (e.type === "interne") return `${e.nom} (real31)`;
  return (from.split("@")[0] ?? from).replace(/[._]/g, " ");
}

/**
 * Rattachement copro best-effort depuis l'objet ET le corps (la boite live n'a pas
 * de dossier copro). Le code/nom de copro est souvent dans le texte ou la signature,
 * pas seulement l'objet. Code en priorite (plus specifique), puis nom (>= 4 car.).
 */
function attribuerCopro(subject: string, body: string, copros: Copropriete[]): string {
  const texte = `${subject || ""}\n${body || ""}`.toLowerCase();
  // Code (le plus specifique) > nom (>= 4 car.) > adresse de l'immeuble (>= 8 car., la
  // rue complete avec le numero est assez specifique pour eviter les faux positifs).
  const parCode = copros.find((c) => c.code && texte.includes(c.code.toLowerCase()));
  if (parCode) return parCode.code;
  const parNom = copros.find((c) => c.nom && c.nom.length >= 4 && texte.includes(c.nom.toLowerCase()));
  if (parNom) return parNom.code;
  // Adresse AMBIGUE (ex. 6 copros "rue de l'Aigle") : on n'attribue que si UNE seule
  // copro matche. Sinon non-rattache (mieux qu'un faux positif = mauvais contexte).
  const parAdresse = copros.filter((c) => {
    const rue = c.adresse.ligne1.toLowerCase().trim();
    return rue.length >= 8 && texte.includes(rue);
  });
  return parAdresse.length === 1 ? parAdresse[0]!.code : "";
}

/**
 * Ingere UNE boite. Une boite en echec (droits Exchange, panne Graph) ne doit pas
 * faire tomber tout l'ecran : on journalise et on rend une liste vide -> les autres
 * boites s'affichent quand meme. Le silence serait pire, d'ou le console.warn.
 */
async function ingererBoite(boite: BoiteMail): Promise<{ boite: BoiteMail; bruts: RawMail[] }> {
  try {
    const bruts = await getMailIngestionProvider().lireRecents({
      email: boite.adresse,
      max: MAX_INGEST,
      // Boite partagee : seulement le dossier du binome du gestionnaire (pas toute la reception).
      ...(boite.folderId ? { folderId: boite.folderId } : {}),
    });
    return { boite, bruts };
  } catch (err) {
    console.warn(`[mes-emails] boite ${boite.adresse} illisible :`, (err as Error).message);
    return { boite, bruts: [] };
  }
}

/**
 * Lit en direct toutes les boites visibles et construit les cartes.
 * AUCUNE ecriture : ni cache de triage, ni appel au modele.
 */
export async function lireBoitesLive(
  g: Gestionnaire,
  boites: BoiteMail[],
  copros: Copropriete[],
): Promise<TriageLive> {
  if (boites.length === 0) return { mails: [], dossiers: [], nbMailsAnalyses: 0 };

  const nomDe = new Map(copros.map((c) => [c.code, c.nom]));
  const coproNomDe = (code: string) => nomDe.get(code) ?? (code || "Non rattaché");

  // Les boites sont lues EN PARALLELE : leur latence ne s'additionne pas.
  const parBoite = await Promise.all(boites.map(ingererBoite));
  const boiteDe = new Map<string, string>();
  const bruts: RawMail[] = [];
  for (const { boite, bruts: lot } of parBoite) {
    for (const b of lot) {
      boiteDe.set(b.id, boite.id);
      bruts.push(b);
    }
  }
  if (bruts.length === 0) return { mails: [], dossiers: [], nbMailsAnalyses: 0 };

  for (const b of bruts) b.copro = attribuerCopro(b.subject, b.bodyText, copros);

  // Les affaires servent de CONTEXTE (le fil auquel un mail appartient) : on ne plie
  // PAS la liste. Un mail = une carte (decision Sekou 2026-06-25).
  const affaires = groupAffaires(bruts).sort((a, b) => b.last.localeCompare(a.last));

  // Resolveur Crypto : pour les mails encore non-rattaches, on cherche la copro par
  // l'email de l'EXPEDITEUR (annuaire Crypto importe). Attribution SEULEMENT si une
  // seule copro (anti-ambiguite).
  const sansCopro = bruts.filter((b) => !b.copro);
  if (sansCopro.length > 0) {
    const parEmail = await getCryptoContactsProvider().coprosPourEmails(sansCopro.map((b) => b.from));
    for (const b of sansCopro) {
      const trouvees = parEmail.get((b.from || "").toLowerCase().trim());
      if (trouvees && new Set(trouvees).size === 1) b.copro = trouvees[0]!;
    }
  }

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
    const exp = resoudreExpediteur(m.from);
    const corps = cleanBody(m);
    return {
      id: m.internetMessageId || m.id,
      boite: boiteDe.get(m.id) ?? boites[0]!.id,
      de: nomCourt(m.from),
      expediteurEmail: exp.type === "interne" ? "(interne real31)" : m.from,
      destinataires: m.to,
      copie: [],
      objet: m.subject || "(sans objet)",
      date: m.receivedAt.slice(0, 10),
      recuLe: m.receivedAt,
      coproCode: m.copro,
      coproNom: coproNomDe(m.copro),
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
        date: m.receivedAt.slice(0, 10),
        acteur: nomCourt(m.from),
        resume: (m.subject || cleanBody(m).slice(0, 60) || "mail").slice(0, 90),
        kind: "mail" as const,
      })),
    };
  });

  return { mails, dossiers, nbMailsAnalyses: bruts.length };
}
