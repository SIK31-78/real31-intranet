// Service de synchro "Mes emails" : ingere la boite du gestionnaire -> pipeline
// (prefiltre, nettoyage, regroupement, analyse) -> ecrit le triage dans le cache
// (table intranet_mes_emails_triage). Reprend la logique de l'assistant-ia, en
// domaine intranet. Passe par le routeur (ADR-001).

import type { BadgeUrgence, Dossier, MailEntrant, TypeMail, UrgenceTon } from "@/lib/domain/mes-emails";
import type { Severite } from "@/lib/domain/commun";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { Copropriete } from "@/lib/domain/copropriete";
import { cleanBody, significantAttachments } from "@/lib/domain/tri-mail/clean";
import { prefilter } from "@/lib/domain/tri-mail/prefilter";
import { groupAffaires } from "@/lib/domain/tri-mail/group";
import { resoudreExpediteur } from "@/lib/domain/tri-mail/sender";
import {
  getAnalyseMailProvider,
  getCoproRepository,
  getMailIngestionProvider,
  getMesEmailsTriageStore,
} from "@/lib/adapters/router";

const MAX_INGEST = 80;
const MAX_AFFAIRES = 40;

export interface ResultatSync {
  nbMails: number;
  nbAffaires: number;
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
  const analyse = getAnalyseMailProvider();

  const mails: MailEntrant[] = [];
  const dossiers: Dossier[] = [];
  let i = 0;
  for (const a of affaires) {
    i++;
    const dossierId = `S${i}`;
    const tries = [...a.mails].sort((x, y) => x.receivedAt.localeCompare(y.receivedAt));
    const dernier = tries[tries.length - 1]!;
    const corps = cleanBody(dernier);
    const pf = prefilter(dernier);

    let type: TypeMail = "non_ticketable";
    let ticketable = false;
    let confidence = 0.8;
    let brouillon = "";
    let flow: { ordre: number; libelle: string }[] = [];

    if (pf.decision === "pass") {
      const cls = await analyse.classifier({ de: dernier.from, objet: dernier.subject, corps });
      type = cls.type;
      ticketable = cls.ticketable;
      confidence = cls.confidence;
      if (cls.ticketable) {
        const p = await analyse.genererReponseEtPlan(
          { de: dernier.from, objet: dernier.subject, corps },
          a.label,
        );
        brouillon = p.reponse;
        flow = p.etapes.map((e, k) => ({ ordre: k + 1, libelle: e }));
      }
    }

    const prio = priorite(type, ticketable);
    const exp = resoudreExpediteur(dernier.from);
    const coproNom = nomDe.get(a.copro) ?? (a.copro || "Non rattaché");

    mails.push({
      id: dernier.id,
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
      type,
      ticketable,
      priorite: prio,
      badge: badge(prio),
      rattachement: {
        statut: a.mails.length > 1 ? "existant" : "nouveau",
        dossierId,
        dossierLabel: a.label,
        ...(a.mails.length > 1 ? { confiance: Math.round(confidence * 100) } : {}),
      },
      ...(brouillon ? { brouillonReponse: brouillon } : {}),
      flow,
    });

    dossiers.push({
      id: dossierId,
      label: a.label,
      coproCode: a.copro,
      coproNom,
      type,
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
  return { nbMails: mails.length, nbAffaires: affaires.length };
}
