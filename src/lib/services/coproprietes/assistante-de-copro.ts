// Service : « l'assistante de la copro », celle qu'on met en copie des mails qui la
// concernent (16/10/2026, REA-343 mail au CS pour les dates, REA-348 récap d'AG). UNE
// seule règle pour les deux, dans l'ordre :
//   1. le binôme tenu dans l'intranet (ADR-046) : l'assistant affecté à la copro, sinon
//      celui de la fiche s'il est d'un binôme du gestionnaire (27/10/2026), sinon
//      l'assistant principal de son gestionnaire. C'est la vérité du cabinet, ESTALE
//      connaît rarement l'assistant (constat du 25/09/2026) ;
//   2. à défaut, l'assistant de l'équipe de la copro (assistantId, posé par l'équipe
//      ESTALE ou le référentiel de l'intranet).
// Best-effort : une lecture qui échoue rend null, jamais une erreur. Une copie manquée
// ne doit pas empêcher un mail de partir.

import type { Copropriete } from "@/lib/domain/copropriete";
import {
  AUCUN_BINOME,
  binomeDeCopro,
  cleDeReference,
  type BinomesTri,
  type MembreTri,
} from "@/lib/domain/tri-emails";
import { getGestionnaireRepository, getTriRepository } from "@/lib/adapters/router";

const minuscules = (e: string) => e.trim().toLowerCase();

export type CoproPourAssistante = Pick<Copropriete, "code" | "nom" | "managerId" | "assistantId">;

/**
 * La référence sous laquelle le binôme a pu être affecté. Les affectations sont tenues
 * par référence ESTALE (« S0297 ») alors que la fiche peut porter le code Crypto
 * (« S297 ») : on compare par clé de référence.
 */
function referenceAffectation(code: string, b: BinomesTri): string {
  const cle = cleDeReference(code);
  if (!cle) return code;
  return Object.keys(b.parCopro).find((r) => cleDeReference(r) === cle) ?? code;
}

async function emailDe(id: string | undefined): Promise<MembreTri | null> {
  if (!id) return null;
  const u = await getGestionnaireRepository().findById(id).catch(() => null);
  return u?.email ? { nomComplet: u.nomComplet, email: minuscules(u.email) } : null;
}

/** Le gestionnaire de la copro (managerId) ; null s'il est inconnu ou sans adresse. */
export async function gestionnaireDeCopro(copro: Pick<Copropriete, "managerId">): Promise<MembreTri | null> {
  try {
    return await emailDe(copro.managerId);
  } catch {
    return null;
  }
}

/** L'assistante de la copro (binôme d'abord, équipe ensuite) ; null si personne n'est connu. */
export async function assistanteDeCopro(copro: CoproPourAssistante): Promise<MembreTri | null> {
  try {
    const [gestionnaire, deLaFiche, binomes] = await Promise.all([
      emailDe(copro.managerId),
      emailDe(copro.assistantId),
      getTriRepository()
        .binomes()
        .catch(() => AUCUN_BINOME),
    ]);
    if (gestionnaire) {
      const binome = binomeDeCopro(
        {
          reference: referenceAffectation(copro.code, binomes),
          nom: copro.nom,
          adresse: "",
          gestionnaire,
          // Le même ordre que le tri : la fiche désigne le binôme avant le principal.
          assistant: deLaFiche,
        },
        binomes,
      );
      if (binome?.assistant.email) {
        return { nomComplet: binome.assistant.nomComplet, email: minuscules(binome.assistant.email) };
      }
    }
    return deLaFiche;
  } catch (e) {
    console.warn("[assistante-de-copro] non résolue :", (e as Error).message);
    return null;
  }
}

/**
 * La copie avec l'assistante ajoutée, sans doublon : ni avec la copie existante, ni avec
 * les destinataires déjà prévus (le « À », la boîte d'envoi). Comparaison sans casse.
 */
export function copieAvecAssistante(
  cc: readonly string[],
  assistante: MembreTri | null,
  dejaDestinataires: readonly string[] = [],
): string[] {
  if (!assistante?.email) return [...cc];
  const email = minuscules(assistante.email);
  const presents = new Set([...cc, ...dejaDestinataires].map(minuscules));
  return presents.has(email) ? [...cc] : [...cc, email];
}
