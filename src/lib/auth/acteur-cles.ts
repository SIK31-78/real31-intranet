// L'acteur du module cles, resolu depuis la session : agence (Gestionnaire.agencyId -> code
// via public."Agency"), direction (table, env, super-admin) ou referent syndic par agence,
// delegations d'agence actives, et activites dirigees deduites de la fonction (REA-90).

import { getAgenceRepository, getCollaborateurRepository, getDelegationRepository } from "@/lib/adapters/router";
import type { Acteur } from "@/lib/domain/cles/acteur";
import { AGENCES_CLES } from "@/lib/domain/cles/types";
import { activitesDirigees } from "@/lib/domain/collaborateur";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { delegationActive } from "@/lib/domain/perimetre-ecriture";
import { estDirection, estReferentSyndic, profilDe } from "./roles";

/** Le jour a Paris (AAAA-MM-JJ) : une delegation qui finit ce soir vaut encore a 23 h. */
function aujourdhuiParis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export async function acteurCles(g: Gestionnaire): Promise<Acteur> {
  const profil = profilDe(g);
  // Chaque lecture qui echoue retire un droit, jamais n'en ajoute.
  const [agences, collaborateur, delegations] = await Promise.all([
    g.agencyId ? getAgenceRepository().listerAgences().catch(() => []) : Promise.resolve([]),
    getCollaborateurRepository().get(g.id).catch(() => null),
    getDelegationRepository().listerPourBeneficiaire(g.id).catch(() => []),
  ]);
  const agence = g.agencyId ? agences.find((a) => a.id === g.agencyId)?.code : undefined;
  const direction: Acteur["direction"] = estDirection(profil) ? "toutes" : AGENCES_CLES.filter((a) => estReferentSyndic(profil, a));
  const jour = aujourdhuiParis();
  const agencesDeleguees = [
    ...new Set(
      delegations
        .filter((d) => d.portee === "agence" && d.agenceCode && delegationActive(d, jour))
        .map((d) => (d.agenceCode as string).toUpperCase()),
    ),
  ];
  const activites = activitesDirigees({ fonction: collaborateur?.fonction });
  return {
    id: g.id,
    nom: g.nomComplet,
    ...(agence ? { agence } : {}),
    direction,
    ...(agencesDeleguees.length ? { agencesDeleguees } : {}),
    ...(activites.length ? { activitesDirigees: activites } : {}),
  };
}
