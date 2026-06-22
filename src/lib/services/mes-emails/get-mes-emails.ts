// Service du cockpit "Mes emails".
//   - mails + dossiers : agregat issu du backtest (provider mock aujourd'hui ;
//     adapter API/modele local demain, branche dans le routeur).
//   - contextes : enrichissement REEL eStale par copro (CS, AG, comptes...) via
//     le port CondoEstaleProvider deja branche dans l'intranet. SE999 = copro test
//     reelle ; degradation propre si eStale absent/indisponible.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type { ContexteCopro, MailEntrant, MesEmails } from "@/lib/domain/mes-emails";
import type { DonneesEstaleCopro } from "@/lib/domain/copropriete";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import type { EtatMail } from "@/lib/ports/mes-emails-etat-provider";
import {
  getCondoEstaleProvider,
  getCoproRepository,
  getMesEmailsEtatRepository,
  getMesEmailsProvider,
} from "@/lib/adapters/router";

export async function getMesEmails(g: Gestionnaire): Promise<MesEmails> {
  const brut = await getMesEmailsProvider().getMesEmails(g.id);

  // Cloisonnement : on ne garde que les copros du portefeuille du gestionnaire
  // courant (managerId reel cote Supabase), comme calendrier / odj. L'identite
  // vient de getGestionnaireCourant (SSO Entra si actif, dev-login sinon) : le
  // jour ou le SSO est branche, ce filtre ne change pas. Un autre gestionnaire
  // ne voit donc pas le triage d'une copro qui n'est pas la sienne.
  const miennes = new Set((await getCoproRepository().list(g.id)).map((c) => c.code));

  // Etat de traitement persiste (ce que CE gestionnaire a deja fait sur ses mails).
  const etats = new Map(
    (await getMesEmailsEtatRepository().getEtats(g.id)).map((e) => [e.emailId, e]),
  );

  const data: MesEmails = {
    ...brut,
    mails: brut.mails
      .filter((m) => miennes.has(m.coproCode))
      .map((m) => appliquerEtat(m, etats.get(m.id))),
    dossiers: brut.dossiers.filter((d) => miennes.has(d.coproCode)),
  };

  const contextes = await enrichirContextes(data);
  return {
    ...data,
    gestionnaire: { nomComplet: g.nomComplet, initiales: g.initiales },
    contextes,
  };
}

/** Applique l'etat persiste sur un mail : statut, etapes cochees, brouillon/rattachement edites, lu. */
function appliquerEtat(m: MailEntrant, e: EtatMail | undefined): MailEntrant {
  if (!e) return m;
  return {
    ...m,
    lu: e.lu || m.lu,
    statutTraitement: e.statut,
    etapesFaites: e.etapesFaites,
    ...(e.brouillon !== undefined ? { brouillonReponse: e.brouillon } : {}),
    ...(e.rattachement !== undefined ? { rattachement: e.rattachement } : {}),
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
