// Service de synchro "Mes emails" : ingere la boite du gestionnaire -> pipeline
// (prefiltre, nettoyage, regroupement) -> analyse Mistral MEMOISEE par mail -> ecrit
// le triage dans le cache (table intranet_mes_emails_triage). Un mail deja analyse
// (cle internetMessageId) n'est JAMAIS renvoye au LLM. Passe par le routeur (ADR-001).

import type { BadgeUrgence, Dossier, MailEntrant, TypeMail, UrgenceTon } from "@/lib/domain/mes-emails";
import type { Severite } from "@/lib/domain/commun";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { Copropriete } from "@/lib/domain/copropriete";
import type { AnalyseCachee } from "@/lib/ports/analyse-cache-store";
import { cleanBody, significantAttachments } from "@/lib/domain/tri-mail/clean";
import { prefilter } from "@/lib/domain/tri-mail/prefilter";
import { groupAffaires } from "@/lib/domain/tri-mail/group";
import { resoudreExpediteur } from "@/lib/domain/tri-mail/sender";
import {
  getAnalyseCacheStore,
  getAnalyseMailProvider,
  getCoproRepository,
  getCryptoContactsProvider,
  getMailIngestionProvider,
  getMesEmailsTriageStore,
} from "@/lib/adapters/router";

const MAX_INGEST = 80;
// Bumpe cette version si tu changes les prompts/modele -> le cache se reanalyse tout seul.
// v3 : invalide les sorties MOCK mises en cache quand MISTRAL_API_KEY etait absent
// (le routeur servait le mock) ; force la reanalyse via le vrai modele.
const VERSION_ANALYSE = "v3";

export interface ResultatSync {
  nbMails: number;
  nbAffaires: number;
  /** Appels LLM reellement faits (le reste = reutilise depuis le cache). */
  nbAnalyses: number;
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

export async function synchroniserMesEmails(g: Gestionnaire): Promise<ResultatSync> {
  const copros = await getCoproRepository().list(g.id);
  const nomDe = new Map(copros.map((c) => [c.code, c.nom]));
  const coproNomDe = (code: string) => nomDe.get(code) ?? (code || "Non rattaché");

  const bruts = await getMailIngestionProvider().lireRecents({ email: g.email, max: MAX_INGEST });
  for (const b of bruts) b.copro = attribuerCopro(b.subject, b.bodyText, copros);

  // Les affaires servent de CONTEXTE (le fil auquel un mail appartient) : on ne plie
  // PLUS la liste. Un mail = une carte (decision Sekou 2026-06-25) -> on ne perd aucun
  // contenu. Les affaires alimentent le rattachement (dossier) et l'historique du fil.
  const affaires = groupAffaires(bruts).sort((a, b) => b.last.localeCompare(a.last));

  // Resolveur Crypto : pour les mails encore non-rattaches, on cherche la copro par
  // l'email de l'EXPEDITEUR (annuaire Crypto importe). Attribution SEULEMENT si une
  // seule copro (anti-ambiguite). Vide tant que le JSON Crypto n'est pas importe.
  const sansCopro = bruts.filter((b) => !b.copro);
  if (sansCopro.length > 0) {
    const parEmail = await getCryptoContactsProvider().coprosPourEmails(sansCopro.map((b) => b.from));
    for (const b of sansCopro) {
      const copros = parEmail.get((b.from || "").toLowerCase().trim());
      if (copros && new Set(copros).size === 1) b.copro = copros[0]!;
    }
  }

  // Heritage par fil : un mail sans copro herite de la copro d'un autre mail du meme
  // fil (les reponses ne re-citent pas toujours la copro). Met a jour les RawMail (donc
  // les cartes) ET l'affaire (donc le dossier/contexte).
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

  // Un mail = une carte, les plus recents d'abord (plafond = tout l'ingere).
  const tous = [...bruts]
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, MAX_INGEST);

  // Cache d'analyse lu en LOT pour TOUS les mails -> zero appel LLM sur le deja-vu.
  const cacheStore = getAnalyseCacheStore();
  const cache = await cacheStore.lirePar(
    g.id,
    tous.map((m) => m.internetMessageId).filter(Boolean),
  );

  const analyse = getAnalyseMailProvider();
  const anDe = new Map<string, AnalyseCachee>();
  let nbAnalyses = 0;

  for (const m of tous) {
    const imid = m.internetMessageId;
    const corps = cleanBody(m);

    // Reutilise l'analyse memoisee si presente et si les prompts n'ont pas change.
    let an = cache.get(imid);
    if (!an || an.promptVersion !== VERSION_ANALYSE) {
      try {
        const pf = prefilter(m);
        let type: TypeMail = "non_ticketable";
        let ticketable = false;
        let estNouveau = false;
        let confidence = 0.8;
        let rationale: string = pf.decision;
        // Brouillon (et etapes) NON generes au sync : produits A LA DEMANDE quand le
        // gestionnaire ouvre le mail (genererBrouillonAction). On ne depense de l'IA que
        // sur les mails qu'on traite vraiment -> moins de cout, surtout en prod. (Sekou)
        const brouillon = "";
        const etapes: string[] = [];

        if (pf.decision === "pass") {
          const cls = await analyse.classifier({ de: m.from, objet: m.subject, corps });
          type = cls.type;
          ticketable = cls.ticketable;
          estNouveau = cls.est_nouveau_ticket;
          confidence = cls.confidence;
          rationale = cls.rationale;
        }

        an = {
          internetMessageId: imid,
          type,
          ticketable,
          estNouveauTicket: estNouveau,
          confidence,
          rationale,
          brouillon,
          etapes,
          promptVersion: VERSION_ANALYSE,
        } satisfies AnalyseCachee;
        nbAnalyses++;
        if (imid) await cacheStore.ecrire(g.id, an);
      } catch (err) {
        // Analyse indisponible (ex. limite API Mistral) : on NE casse PAS la synchro.
        // Fallback NON mis en cache -> reessaye au prochain sync (la limite se libere).
        console.warn(`[mes-emails] analyse indisponible pour ${m.id} :`, (err as Error).message);
        an = {
          internetMessageId: imid,
          type: "autre",
          ticketable: false,
          estNouveauTicket: true,
          confidence: 0,
          rationale: "analyse en attente (limite API, reessayer)",
          brouillon: "",
          etapes: [],
          promptVersion: "pending",
        } satisfies AnalyseCachee;
      }
    }
    anDe.set(m.id, an);
  }

  // Une carte par mail.
  const mails: MailEntrant[] = tous.map((m) => {
    const an = anDe.get(m.id)!;
    const idx = idxAffaireDe.get(m.id);
    const aff = idx !== undefined ? affaires[idx] : undefined;
    const filMultiple = (aff?.mails.length ?? 1) > 1;
    const prio = priorite(an.type, an.ticketable);
    const exp = resoudreExpediteur(m.from);
    const corps = cleanBody(m);
    return {
      id: m.internetMessageId || m.id,
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
      type: anDe.get(tete.id)?.type ?? "autre",
      historique: parDate.slice(0, 8).map((m) => ({
        date: m.receivedAt.slice(0, 10),
        acteur: nomCourt(m.from),
        resume: (m.subject || cleanBody(m).slice(0, 60) || "mail").slice(0, 90),
        kind: "mail" as const,
      })),
    };
  });

  await getMesEmailsTriageStore().remplacer(g.id, { mails, dossiers, nbMailsAnalyses: bruts.length });
  return { nbMails: mails.length, nbAffaires: affaires.length, nbAnalyses };
}
