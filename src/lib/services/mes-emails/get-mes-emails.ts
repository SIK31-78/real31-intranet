// Service du cockpit "Mes emails".
//   - mails + dossiers : agregat issu du backtest (provider mock aujourd'hui ;
//     adapter API/modele local demain, branche dans le routeur).
//   - contextes : enrichissement REEL eStale par copro (CS, AG, comptes...) via
//     le port CondoEstaleProvider deja branche dans l'intranet. SE999 = copro test
//     reelle ; degradation propre si eStale absent/indisponible.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type { ContexteCopro, MesEmails } from "@/lib/domain/mes-emails";
import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { getCondoEstaleProvider, getMesEmailsProvider } from "@/lib/adapters/router";

export async function getMesEmails(g: Gestionnaire): Promise<MesEmails> {
  const data = await getMesEmailsProvider().getMesEmails(g.id);
  const contextes = await enrichirContextes(data);
  return {
    ...data,
    gestionnaire: { nomComplet: g.nomComplet, initiales: g.initiales },
    contextes,
  };
}

/** Pour chaque copro de la boite, tire son contexte eStale (en parallele). */
async function enrichirContextes(data: MesEmails): Promise<ContexteCopro[]> {
  const codes = [...new Set(data.mails.map((m) => m.coproCode))];
  const provider = getCondoEstaleProvider();
  return Promise.all(
    codes.map(async (code) => {
      try {
        // null = copro pas (encore) sur eStale -> contexte indisponible assume.
        return versContexte(code, await provider.getDonneesCopro(code));
      } catch (err) {
        // eStale tombe (5xx / timeout) : on NE crashe PAS le cockpit.
        console.warn(`[mes-emails] eStale indisponible pour ${code} :`, (err as Error).message);
        return { coproCode: code, disponible: false, conseilSyndical: [] };
      }
    }),
  );
}

function versContexte(code: string, d: DonneesEstaleCopro | null): ContexteCopro {
  if (!d) return { coproCode: code, disponible: false, conseilSyndical: [] };
  const ag = d.historiqueAg[0];
  return {
    coproCode: code,
    disponible: true,
    conseilSyndical: d.conseilSyndical,
    derniereAg: ag ? { date: ag.date, type: ag.type, pvDispo: ag.pvDispo } : undefined,
    budgetPrevisionnel: d.budgetPrevisionnel,
    depensesCourantes: d.depensesCourantes,
    fondsTravaux: d.fondsTravaux,
    nbProcedures: d.nbProcedures,
    nbDebiteurs: d.debiteurs?.length,
    contrats: d.contrats?.map((c) => ({ libelle: c.libelle, categorie: c.categorie })),
    anneeConstruction: d.anneeConstruction,
  };
}
