// Service du tri des e-mails V2 (ADR-043) : la file a trier = la boite de reception de
// la boite generique, lue en direct. Pour chaque mail : la copro ESTALE proposee ; pour
// chaque copro : ou partirait le mail (dossier aux initiales du gestionnaire).
// LECTURE SEULE (increment 1) : rien n'est deplace ni etiquete.

import {
  destinationDe,
  suggererCopro,
  type CoproTri,
  type Destination,
  type MailATrier,
  type Suggestion,
} from "@/lib/domain/tri-emails";
import { boiteTriConfiguree } from "@/lib/domain/mail-gate";
import {
  getGestionnaireRepository,
  getIngestionTri,
  getReferentielTriProvider,
} from "@/lib/adapters/router";

/** Nombre de mails lus a chaque affichage : la file du jour, pas l'historique. */
const MAX_FILE = 100;
/** Longueur du texte affiche ; la suggestion lit un peu plus loin. */
const APERCU = 1500;
const TEXTE_ANALYSE = 4000;

export interface MailDeLaFile extends MailATrier {
  suggestion: Suggestion;
}

export interface CoproDeLaFile extends CoproTri {
  destination: Destination | null;
}

export interface FileATrier {
  /** Adresse lue, ou "echantillon". */
  boite: string;
  mails: MailDeLaFile[];
  copros: CoproDeLaFile[];
  /** Message lisible si la boite ou ESTALE n'a pas repondu ; la page reste affichable. */
  erreur: string | null;
}

async function initialesParEmail(): Promise<Record<string, string>> {
  const tous = await getGestionnaireRepository().listTous();
  const out: Record<string, string> = {};
  for (const g of tous) if (g.email && g.initiales) out[g.email.trim().toLowerCase()] = g.initiales;
  return out;
}

export async function lireFileATrier(): Promise<FileATrier | null> {
  const boite = boiteTriConfiguree();
  if (!boite) return null;

  const [refRes, mailsRes, iniRes] = await Promise.allSettled([
    getReferentielTriProvider().charger(),
    getIngestionTri().lireRecents({ email: boite, max: MAX_FILE }),
    initialesParEmail(),
  ]);

  const erreurs: string[] = [];
  if (refRes.status === "rejected") erreurs.push("ESTALE n'a pas répondu : les suggestions sont indisponibles.");
  if (mailsRes.status === "rejected") {
    // Cas attendu tant que la boite n'existe pas ou n'est pas dans l'Access Policy (403/404).
    erreurs.push(`La boîte ${boite} n'est pas lisible pour l'instant (boîte absente ou pas encore autorisée).`);
    console.error("[tri-emails] lecture de la boite :", mailsRes.reason instanceof Error ? mailsRes.reason.message : mailsRes.reason);
  }
  if (refRes.status === "rejected") {
    console.error("[tri-emails] referentiel ESTALE :", refRes.reason instanceof Error ? refRes.reason.message : refRes.reason);
  }

  const ref = refRes.status === "fulfilled" ? refRes.value : { copros: [], expediteurs: {} };
  const initiales = iniRes.status === "fulfilled" ? iniRes.value : {};
  const bruts = mailsRes.status === "fulfilled" ? mailsRes.value : [];

  const mails: MailDeLaFile[] = bruts.map((m) => {
    const texte = m.bodyText.replace(/\r\n/g, "\n").trim();
    const base: MailATrier = {
      id: m.id,
      internetMessageId: m.internetMessageId,
      ...(m.conversationId ? { conversationId: m.conversationId } : {}),
      deNom: m.fromName ?? m.from,
      deAdresse: m.from,
      objet: m.subject || "(sans objet)",
      recuLe: m.receivedAt,
      apercu: texte.slice(0, APERCU),
      aPiecesJointes: m.attachments.length > 0,
      ...(m.webLink ? { lienOutlook: m.webLink } : {}),
    };
    return {
      ...base,
      suggestion: suggererCopro({ ...base, apercu: texte.slice(0, TEXTE_ANALYSE) }, ref),
    };
  });

  const copros: CoproDeLaFile[] = ref.copros.map((c) => ({ ...c, destination: destinationDe(c, initiales) }));

  return { boite, mails, copros, erreur: erreurs.length ? erreurs.join(" ") : null };
}
