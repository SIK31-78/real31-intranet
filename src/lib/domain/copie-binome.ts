// Copie au binôme d'un envoi au conseil syndical (28/10/2026, révision de l'ADR-047).
//
// Sur Crypto, quand un gestionnaire en binôme écrivait au conseil syndical, l'autre membre
// du binôme était en copie. La règle, pure, en un seul endroit pour tous les écrans d'envoi
// au CS (compositeur E-mails, mail des dates de réunion, mail de l'ODJ, mail des contrats) :
//   - le binôme d'une copro = son gestionnaire + son assistante (résolus par le service
//     assistante-de-copro : binôme de l'intranet d'abord, équipe de la fiche ensuite) ;
//   - la copie = l'AUTRE membre que la personne qui envoie ;
//   - une personne qui n'est ni l'un ni l'autre (remplaçant, admin) : les deux, retirables,
//     faute de savoir lequel des deux doit suivre (choix à confirmer par Sekou) ;
//   - binôme incomplet (pas d'assistante, pas de gestionnaire connu) : personne ;
//   - jamais soi-même, jamais une adresse déjà destinataire.
// Le Cc est une PROPOSITION : l'écran l'affiche et la personne l'enlève d'un clic.

import type { MembreTri } from "./tri-emails";

const minuscules = (e: string) => e.trim().toLowerCase();

function membre(m: MembreTri | null | undefined): MembreTri | null {
  const email = m?.email ? minuscules(m.email) : "";
  return m && email ? { nomComplet: m.nomComplet, email } : null;
}

/**
 * Qui mettre en copie d'un mail au conseil syndical : l'autre membre du binôme de la copro
 * que `envoyeur` (adresse de la personne connectée). Adresses rendues en minuscules.
 */
export function copieBinomeConseil(p: {
  envoyeur: string | null | undefined;
  gestionnaire: MembreTri | null | undefined;
  assistante: MembreTri | null | undefined;
  /** Adresses déjà en « À » ou en « Cc » : pas de doublon. */
  dejaDestinataires?: readonly string[];
}): MembreTri[] {
  const g = membre(p.gestionnaire);
  const a = membre(p.assistante);
  if (!g || !a || g.email === a.email) return [];
  const moi = p.envoyeur ? minuscules(p.envoyeur) : "";
  const candidats = moi === g.email ? [a] : moi === a.email ? [g] : [g, a];
  const exclus = new Set([moi, ...(p.dejaDestinataires ?? []).map(minuscules)]);
  return candidats.filter((c) => !exclus.has(c.email));
}

/**
 * La copie du binôme n'a de sens que tant que le conseil syndical est destinataire : vrai si
 * au moins une adresse de `conseil` est encore parmi `destinataires` (comparaison sans casse).
 */
export function conseilEncoreDestinataire(destinataires: readonly string[], conseil: readonly string[]): boolean {
  const cs = new Set(conseil.map(minuscules));
  return destinataires.some((e) => cs.has(minuscules(e)));
}

/** La phrase qui dit, sous les destinataires, qui est en copie et pourquoi. */
export function phraseCopieBinome(noms: readonly string[]): string {
  if (noms.length === 0) return "";
  const liste = noms.length === 1 ? noms[0]! : `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]!}`;
  return noms.length === 1
    ? `${liste}, du binôme de la copro, est en copie. Retirez l'adresse si besoin.`
    : `${liste}, du binôme de la copro, sont en copie. Retirez une adresse si besoin.`;
}
