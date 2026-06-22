// Routeur d'adapters : SEUL endroit autorise a connaitre un adapter concret.
// La regle ESLint boundaries (cf. ADR-001) interdit aux services et a l'UI
// d'importer directement un adapter ; ils passent par ce routeur.
//
// Tant qu'on est en donnees mockees, on renvoie toujours les adapters mock.
// Quand Supabase / Estale arriveront, le choix de l'adapter se fera ICI
// (selon copros.source, env, etc.), sans toucher aux services ni aux composants.

import type { DashboardProvider } from "@/lib/ports/dashboard-provider";
import type { CalendrierProvider } from "@/lib/ports/calendrier-provider";
import type { SupervisionAgProvider } from "@/lib/ports/supervision-ag-provider";
import type { CoproRepository } from "@/lib/ports/copro-repository";
import type { CondoEstaleProvider } from "@/lib/ports/condo-estale-provider";
import type { MesEvenementsProvider } from "@/lib/ports/mes-evenements-provider";
import type { MesEmailsProvider } from "@/lib/ports/mes-emails-provider";
import { MockDashboardProvider } from "@/lib/adapters/mock/mock-dashboard-provider";
import { MockCalendrierProvider } from "@/lib/adapters/mock/mock-calendrier-provider";
import { MockSupervisionAgProvider } from "@/lib/adapters/mock/mock-supervision-ag-provider";
import { MockCoproRepository } from "@/lib/adapters/mock/mock-copro-repository";
import { MockCondoEstaleProvider } from "@/lib/adapters/mock/mock-condo-estale-provider";
import { MockMesEvenementsProvider } from "@/lib/adapters/mock/mock-mes-evenements-provider";
import { MockMesEmailsProvider } from "@/lib/adapters/mock/mock-mes-emails-provider";
import { FichierMesEmailsProvider, triageFichierPresent } from "@/lib/adapters/fichier/fichier-mes-emails-provider";
import type { MesEmailsEtatRepository } from "@/lib/ports/mes-emails-etat-provider";
import { MockMesEmailsEtatRepository } from "@/lib/adapters/mock/mock-mes-emails-etat-repository";
import { SupabaseMesEmailsEtatRepository } from "@/lib/adapters/supabase/supabase-mes-emails-etat-repository";
import { SupabaseCoproRepository } from "@/lib/adapters/supabase/supabase-copro-repository";
import type { JalonRepository } from "@/lib/ports/jalon-repository";
import { SupabaseJalonRepository } from "@/lib/adapters/supabase/supabase-jalon-repository";
import { MockJalonRepository } from "@/lib/adapters/mock/mock-jalon-repository";
import type { PriseEnMainRepository } from "@/lib/ports/prise-en-main-repository";
import { SupabasePriseEnMainRepository } from "@/lib/adapters/supabase/supabase-prise-en-main-repository";
import { MockPriseEnMainRepository } from "@/lib/adapters/mock/mock-prise-en-main-repository";
import { SupabaseSupervisionAgRepository } from "@/lib/adapters/supabase/supabase-supervision-ag-repository";
import type { GestionnaireRepository } from "@/lib/ports/gestionnaire-repository";
import { SupabaseGestionnaireRepository } from "@/lib/adapters/supabase/supabase-gestionnaire-repository";
import { MockGestionnaireRepository } from "@/lib/adapters/mock/mock-gestionnaire-repository";
import type { OdjRepository } from "@/lib/ports/odj-repository";
import { SupabaseOdjRepository } from "@/lib/adapters/supabase/supabase-odj-repository";
import { MockOdjRepository } from "@/lib/adapters/mock/mock-odj-repository";
import { checkDbHealth, type DbHealth } from "@/lib/adapters/supabase/health";
import { EstaleCondoProvider } from "@/lib/adapters/estale/estale-condo-provider";
import { estaleConfigure } from "@/lib/adapters/estale/client";
import type { BibliothequeResolutionsProvider } from "@/lib/ports/bibliotheque-resolutions";
import { EstaleBibliothequeResolutions } from "@/lib/adapters/estale/estale-bibliotheque-resolutions";
import { MockBibliothequeResolutions } from "@/lib/adapters/mock/mock-bibliotheque-resolutions";
import type { AssembleeEstaleProvider } from "@/lib/ports/assemblee-estale-provider";
import { EstaleAssembleeProvider } from "@/lib/adapters/estale/estale-assemblee-provider";
import { MockAssembleeEstaleProvider } from "@/lib/adapters/mock/mock-assemblee-estale-provider";
import type { ComptaRepository } from "@/lib/ports/compta-repository";
import { SupabaseComptaRepository } from "@/lib/adapters/supabase/supabase-compta-repository";
import { MockComptaRepository } from "@/lib/adapters/mock/mock-compta-repository";
import type { CoffreRepository } from "@/lib/ports/coffre-repository";
import type { CoffreIdentiteRepository } from "@/lib/ports/coffre-identite-repository";
import { MockCoffreRepository } from "@/lib/adapters/mock/mock-coffre-repository";
import { MockCoffreIdentiteRepository } from "@/lib/adapters/mock/mock-coffre-identite-repository";
import { SupabaseCoffreRepository } from "@/lib/adapters/supabase/supabase-coffre-repository";
import { SupabaseCoffreIdentiteRepository } from "@/lib/adapters/supabase/supabase-coffre-identite-repository";

export type { DbHealth };

export function getDashboardProvider(): DashboardProvider {
  return new MockDashboardProvider();
}

export function getCalendrierProvider(): CalendrierProvider {
  return new MockCalendrierProvider();
}

// Supervision AG. En reel : etat persiste dans intranet_supervision_items (id
// composite CODE__DATE). En mock : STORE module-level dans l'adapter.
export function getSupervisionAgProvider(): SupervisionAgProvider {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseSupervisionAgRepository();
  return new MockSupervisionAgProvider();
}

// Referentiel copro. Bascule par env COPRO_SOURCE :
//   - "supabase" -> lit la vraie data public.Copropriete (App A) en lecture seule ;
//   - sinon       -> donnees mockees (defaut).
export function getCoproRepository(): CoproRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseCoproRepository();
  return new MockCoproRepository();
}

// Etat des jalons (table native intranet_jalons). Meme bascule que le referentiel.
export function getJalonRepository(): JalonRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseJalonRepository();
  return new MockJalonRepository();
}

// Prise en main des copros (onboarding, table native intranet_copro_prise_en_main).
export function getPriseEnMainRepository(): PriseEnMainRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabasePriseEnMainRepository();
  return new MockPriseEnMainRepository();
}

// Donnees copro sourcees Estale (CS, historique AG). Branche en reel (Phase B,
// ADR-022) quand les identifiants Estale sont presents ; sinon mock.
export function getCondoEstaleProvider(): CondoEstaleProvider {
  if (process.env.COPRO_SOURCE === "supabase" && estaleConfigure()) {
    return new EstaleCondoProvider();
  }
  return new MockCondoEstaleProvider();
}

// Vue agregee "Mes evenements". Cote reel, ce sera un service composant jalons +
// evenements + referentiel ; pour l'instant un agregat mocke.
export function getMesEvenementsProvider(): MesEvenementsProvider {
  return new MockMesEvenementsProvider();
}

// Boite mail triee "Mes emails" (resultat du tri assistant-ia). Si un triage reel
// (data/mes-emails-triage.json, git-ignore, PII) est present sur le poste, on le
// sert ; sinon donnees mockees anonymisees. Bascule sans toucher service ni vue.
export function getMesEmailsProvider(): MesEmailsProvider {
  if (triageFichierPresent()) return new FichierMesEmailsProvider();
  return new MockMesEmailsProvider();
}

// Etat de traitement du cockpit Mes emails (table native intranet_mes_emails_etat).
// Ce que le gestionnaire fait sur un mail (statut, etapes, brouillon, rattachement),
// cloisonne par gestionnaire. Meme bascule mock/supabase que les autres tables natives.
export function getMesEmailsEtatRepository(): MesEmailsEtatRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseMesEmailsEtatRepository();
  return new MockMesEmailsEtatRepository();
}

// Etat de l'ODJ (saisies du gestionnaire + points legaux retires). En reel :
// table native intranet_odj_champs.
export function getOdjRepository(): OdjRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseOdjRepository();
  return new MockOdjRepository();
}

// Gestionnaires (cloisonnement). Source cible : public."User" via les managerId.
export function getGestionnaireRepository(): GestionnaireRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseGestionnaireRepository();
  return new MockGestionnaireRepository();
}

// Bibliotheque de resolutions (motion bank Estale, ADR-024). En reel : lit la bank
// du cabinet via Estale ; sinon mock. LECTURE SEULE pour l'instant.
export function getBibliothequeResolutions(): BibliothequeResolutionsProvider {
  if (process.env.COPRO_SOURCE === "supabase" && estaleConfigure()) {
    return new EstaleBibliothequeResolutions();
  }
  return new MockBibliothequeResolutions();
}

// AG Estale (Meeting + motions, ADR-024). En reel : lit l'AG de la copro via Estale ;
// sinon mock (null). LECTURE pour le palier 1.
export function getAssembleeEstaleProvider(): AssembleeEstaleProvider {
  if (process.env.COPRO_SOURCE === "supabase" && estaleConfigure()) {
    return new EstaleAssembleeProvider();
  }
  return new MockAssembleeEstaleProvider();
}

// Pole compta (notes gestionnaire <-> comptable + flags). Table native
// intranet_compta_notes ; flags dans intranet_odj_champs. Meme bascule que le reste.
export function getComptaRepository(): ComptaRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseComptaRepository();
  return new MockComptaRepository();
}

// Gestionnaire de mots de passe (ADR-025). Tables intranet_pm_* en Supabase
// (service_role) quand COPRO_SOURCE=supabase, sinon mock en memoire. Le serveur
// ne voit que des blobs chiffres dans les deux cas (zero-knowledge).
export function getCoffreRepository(): CoffreRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseCoffreRepository();
  return new MockCoffreRepository();
}

export function getCoffreIdentiteRepository(): CoffreIdentiteRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseCoffreIdentiteRepository();
  return new MockCoffreIdentiteRepository();
}

// Health check BDD (lecture cabinet_settings via service_role).
export async function getDbHealth(): Promise<DbHealth> {
  return checkDbHealth();
}
