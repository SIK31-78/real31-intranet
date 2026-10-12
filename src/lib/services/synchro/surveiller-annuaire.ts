// Surveillance de l'annuaire des expediteurs Crypto (REA-291). La synchro tourne sur le PC
// de Sekou ; si elle saute ou echoue, c'est l'intranet qui previent, pas le PC (il peut
// etre justement en panne). Appele par la tache planifiee /api/cron/annuaire-crypto
// chaque matin, et par l'ecran de tri pour le bandeau.

import { getMailOutboundProvider, getSynchroRepository } from "@/lib/adapters/router";
import { CLE_ANNUAIRE_CRYPTO, diagnostiquerAnnuaire, type DiagnosticSynchro, type EtatSynchro } from "@/lib/domain/synchro";

export interface DepsSurveillance {
  etat: () => Promise<EtatSynchro | null>;
  /** Envoie l'alerte ; absent = pas de mail (destinataire non configure). */
  alerter?: (sujet: string, corps: string) => Promise<void>;
  maintenant: Date;
}

const COMMENT_RELANCER = [
  "Pour relancer : double-clic sur scripts\\sync-annuaire-crypto.cmd dans le dossier de l'intranet,",
  "sur le PC qui synchronise l'export Crypto. Le résultat s'affiche dans la fenêtre.",
].join("\n");

/** Le diagnostic seul, sans mail : pour le bandeau de l'ecran de tri. */
export async function diagnosticAnnuaire(deps: Pick<DepsSurveillance, "etat" | "maintenant"> = depsParDefaut()): Promise<DiagnosticSynchro> {
  try {
    return diagnostiquerAnnuaire(await deps.etat(), deps.maintenant);
  } catch (e) {
    return { alerte: true, raisons: [`Le compte rendu de la synchro est illisible : ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/** Diagnostic, et mail d'alerte si quelque chose cloche. */
export async function surveillerAnnuaire(deps: DepsSurveillance = depsParDefaut()): Promise<DiagnosticSynchro & { alerteEnvoyee: boolean }> {
  const diagnostic = await diagnosticAnnuaire(deps);
  if (!diagnostic.alerte || !deps.alerter) return { ...diagnostic, alerteEnvoyee: false };
  const corps = [
    "La synchro de l'annuaire des expéditeurs Crypto demande ton attention :",
    "",
    ...diagnostic.raisons.map((r) => `- ${r}`),
    "",
    "Tant qu'elle n'est pas relancée, le tri des e-mails reconnaît les expéditeurs d'après la dernière version de l'annuaire.",
    "",
    COMMENT_RELANCER,
    "",
    "Message envoyé automatiquement par l'intranet REAL31.",
  ].join("\n");
  await deps.alerter("Intranet : la synchro de l'annuaire Crypto n'est pas à jour", corps);
  return { ...diagnostic, alerteEnvoyee: true };
}

function depsParDefaut(): DepsSurveillance {
  // Envoye depuis la boite du destinataire, a lui-meme : pas de boite technique a autoriser.
  const destinataire = process.env.ALERTES_EMAIL?.trim().toLowerCase();
  return {
    etat: () => getSynchroRepository().etat(CLE_ANNUAIRE_CRYPTO),
    maintenant: new Date(),
    ...(destinataire && process.env.MAIL_SOURCE === "graph"
      ? {
          alerter: (sujet: string, corps: string) =>
            getMailOutboundProvider().envoyerNeuf({ boite: destinataire, a: [destinataire], cc: [], cci: [], sujet, corps }),
        }
      : {}),
  };
}
