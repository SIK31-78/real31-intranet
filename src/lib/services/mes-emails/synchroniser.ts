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
  getMailIngestionProvider,
  getMesEmailsTriageStore,
} from "@/lib/adapters/router";

const MAX_INGEST = 80;
const MAX_AFFAIRES = 40;
// Bumpe cette version si tu changes les prompts -> le cache se reanalyse tout seul.
const VERSION_ANALYSE = "v1";

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

/** Rattachement copro best-effort depuis l'objet (la boite live n'a pas de dossier copro). */
function attribuerCopro(subject: string, copros: Copropriete[]): string {
  const s = (subject || "").toLowerCase();
  const parCode = copros.find((c) => c.code && s.includes(c.code.toLowerCase()));
  if (parCode) return parCode.code;
  const parNom = copros.find((c) => c.nom && c.nom.length >= 4 && s.includes(c.nom.toLowerCase()));
  return parNom ? parNom.code : "";
}

export async function synchroniserMesEmails(g: Gestionnaire): Promise<ResultatSync> {
  const copros = await getCoproRepository().list(g.id);
  const nomDe = new Map(copros.map((c) => [c.code, c.nom]));

  const bruts = await getMailIngestionProvider().lireRecents({ email: g.email, max: MAX_INGEST });
  for (const b of bruts) b.copro = attribuerCopro(b.subject, copros);

  // Affaires les plus recentes d'abord (la boite live = on veut le frais en haut).
  const affaires = groupAffaires(bruts)
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, MAX_AFFAIRES);

  // Mails (les plus anciens d'abord) et mail "de tete" (le plus recent) par affaire.
  const triesParAffaire = affaires.map((a) =>
    [...a.mails].sort((x, y) => x.receivedAt.localeCompare(y.receivedAt)),
  );

  // Cache d'analyse lu en LOT pour tous les mails de tete -> zero appel LLM sur le deja-vu.
  const cacheStore = getAnalyseCacheStore();
  const idsTete = triesParAffaire
    .map((t) => t[t.length - 1]?.internetMessageId ?? "")
    .filter(Boolean);
  const cache = await cacheStore.lirePar(g.id, idsTete);

  const analyse = getAnalyseMailProvider();
  const mails: MailEntrant[] = [];
  const dossiers: Dossier[] = [];
  let nbAnalyses = 0;

  for (let i = 0; i < affaires.length; i++) {
    const a = affaires[i]!;
    const tries = triesParAffaire[i]!;
    const dernier = tries[tries.length - 1]!;
    const imid = dernier.internetMessageId;
    const corps = cleanBody(dernier);

    // Reutilise l'analyse memoisee si presente et si les prompts n'ont pas change.
    let an = cache.get(imid);
    if (!an || an.promptVersion !== VERSION_ANALYSE) {
      const pf = prefilter(dernier);
      let type: TypeMail = "non_ticketable";
      let ticketable = false;
      let estNouveau = false;
      let confidence = 0.8;
      let rationale: string = pf.decision;
      let brouillon = "";
      let etapes: string[] = [];

      if (pf.decision === "pass") {
        const cls = await analyse.classifier({ de: dernier.from, objet: dernier.subject, corps });
        type = cls.type;
        ticketable = cls.ticketable;
        estNouveau = cls.est_nouveau_ticket;
        confidence = cls.confidence;
        rationale = cls.rationale;
        if (cls.ticketable) {
          const p = await analyse.genererReponseEtPlan(
            { de: dernier.from, objet: dernier.subject, corps },
            a.label,
          );
          brouillon = p.reponse;
          etapes = p.etapes;
        }
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
    }

    const dossierId = `S${i + 1}`;
    const prio = priorite(an.type, an.ticketable);
    const exp = resoudreExpediteur(dernier.from);
    const coproNom = nomDe.get(a.copro) ?? (a.copro || "Non rattaché");
    const flow = an.etapes.map((e, k) => ({ ordre: k + 1, libelle: e }));

    mails.push({
      id: imid || dernier.id,
      de: nomCourt(dernier.from),
      expediteurEmail: exp.type === "interne" ? "(interne real31)" : dernier.from,
      destinataires: dernier.to,
      copie: [],
      objet: dernier.subject || "(sans objet)",
      date: dernier.receivedAt.slice(0, 10),
      coproCode: a.copro,
      coproNom,
      lu: false,
      corps: corps || "(corps vide)",
      attachments: significantAttachments(dernier).map((x) => ({ nom: x.name })),
      type: an.type,
      ticketable: an.ticketable,
      priorite: prio,
      badge: badge(prio),
      rattachement: {
        statut: a.mails.length > 1 ? "existant" : "nouveau",
        dossierId,
        dossierLabel: a.label,
        ...(a.mails.length > 1 ? { confiance: Math.round(an.confidence * 100) } : {}),
      },
      ...(an.brouillon ? { brouillonReponse: an.brouillon } : {}),
      flow,
    });

    dossiers.push({
      id: dossierId,
      label: a.label,
      coproCode: a.copro,
      coproNom,
      type: an.type,
      historique: tries
        .slice(0, -1)
        .reverse()
        .slice(0, 8)
        .map((m) => ({
          date: m.receivedAt.slice(0, 10),
          acteur: nomCourt(m.from),
          resume: (m.subject || cleanBody(m).slice(0, 60) || "mail").slice(0, 90),
          kind: "mail" as const,
        })),
    });
  }

  await getMesEmailsTriageStore().remplacer(g.id, { mails, dossiers, nbMailsAnalyses: bruts.length });
  return { nbMails: mails.length, nbAffaires: affaires.length, nbAnalyses };
}
