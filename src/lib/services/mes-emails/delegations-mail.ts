// Les délégations de portefeuille dans « E-mails » (complément d'ADR-041 du 27/10/2026) :
// les titulaires qui m'ont confié leur portefeuille aujourd'hui. Mêmes délégations, même port
// que le périmètre d'écriture (`getDelegationRepository`, cf. copro-appartient) ; la règle
// (portée portefeuille, dates, clôture) est pure, dans domain/mail-delegation.
//
// Lu UNE fois par requête (React `cache`) : l'écran, ses gardes et la lecture des boîtes le
// demandent chacun. Délégations ou collaborateur illisibles : aucun titulaire, jamais plus
// (on n'ouvre pas la messagerie de quelqu'un au doute).

import { cache } from "react";
import { titulairesDelegantsActifs, type TitulaireMail } from "@/lib/domain/mail-delegation";
import { getDelegationRepository, getGestionnaireRepository } from "@/lib/adapters/router";
import { jourParis } from "@/lib/services/date-du-jour";

/** Les titulaires dont une délégation de portefeuille vers `userId` est active aujourd'hui. */
export const titulairesDelegants = cache(async (userId: string): Promise<TitulaireMail[]> => {
  if (!userId) return [];
  try {
    const delegations = await getDelegationRepository().listerPourBeneficiaire(userId);
    const ids = titulairesDelegantsActifs(delegations, userId, jourParis(new Date()));
    if (ids.length === 0) return [];
    const repo = getGestionnaireRepository();
    const lus = await Promise.all(ids.map((id) => repo.findById(id).catch(() => null)));
    return lus.flatMap((t) =>
      t?.email ? [{ id: t.id, email: t.email.trim().toLowerCase(), nomComplet: t.nomComplet, agencyId: t.agencyId ?? null }] : [],
    );
  } catch (e) {
    console.warn(`[mail-delegation] délégations illisibles (${userId}) :`, (e as Error).message);
    return [];
  }
});
