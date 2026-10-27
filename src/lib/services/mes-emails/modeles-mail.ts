// Les modèles de mail proposés à quelqu'un (REA-296) : ceux de son agence et ceux du
// cabinet, lus en base. Table absente, vide ou injoignable : les modèles de secours du
// code, pour que le compositeur ne se retrouve jamais sans modèle.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import { MODELES_MAIL, type ModeleMail } from "@/lib/domain/mes-emails-composition";
import { modelesPourAgence } from "@/lib/domain/modeles-mail";
import { getModeleMailRepository } from "@/lib/adapters/router";
import { codeAgence } from "@/lib/services/agences/resoudre-agence";

/**
 * L'agence de la personne : ses modèles, et le {{agence}} qui signe les mails. Depuis le
 * 27/10/2026, plus de repli sur MAIL_TRI_AGENCE (une boîte peut servir deux agences, LGC et
 * ASN) : agence inconnue = les modèles du cabinet seulement.
 */
export async function agenceDesModeles(agencyId: string | null | undefined): Promise<string | undefined> {
  return codeAgence(agencyId).catch(() => undefined);
}

export async function modelesMailPour(agence: string | undefined): Promise<ModeleMail[]> {
  try {
    const modeles = modelesPourAgence(await getModeleMailRepository().listerTous(), agence);
    return modeles.length ? modeles : MODELES_MAIL;
  } catch (e) {
    console.warn("[mes-emails] modèles de mail indisponibles, modèles de secours :", (e as Error).message);
    return MODELES_MAIL;
  }
}
