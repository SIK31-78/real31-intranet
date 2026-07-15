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
import { MockCryptoContactsRepository } from "@/lib/adapters/mock/mock-crypto-contacts-repository";
import { SupabaseCryptoContactsRepository } from "@/lib/adapters/supabase/supabase-crypto-contacts-repository";
import type { CryptoContactsProvider } from "@/lib/ports/crypto-contacts-provider";
import type { ListesDiffusionProvider } from "@/lib/ports/listes-diffusion-provider";
import { SupabaseListesDiffusionRepository } from "@/lib/adapters/supabase/supabase-listes-diffusion-repository";
import { MockListesDiffusionRepository } from "@/lib/adapters/mock/mock-listes-diffusion-repository";
import type { AnalyseMailProvider } from "@/lib/ports/analyse-mail-provider";
import { MistralAnalyseProvider } from "@/lib/adapters/mistral/mistral-analyse-provider";
import { MockAnalyseProvider } from "@/lib/adapters/mock/mock-analyse-provider";
import type { MesEmailsTriageStore } from "@/lib/ports/mes-emails-triage-store";
import { MockMesEmailsTriageStore } from "@/lib/adapters/mock/mock-mes-emails-triage-store";
import { SupabaseMesEmailsTriageStore } from "@/lib/adapters/supabase/supabase-mes-emails-triage-store";
import type { MailIngestionProvider } from "@/lib/ports/mail-ingestion-provider";
import { SampleMailIngestionProvider } from "@/lib/adapters/mail/sample-mail-ingestion";
import { GraphMailIngestionProvider } from "@/lib/adapters/mail/graph-mail-ingestion";
import type { SignatureProvider } from "@/lib/ports/signature-provider";
import { SigniticSignatureProvider } from "@/lib/adapters/signitic/signitic-signature-provider";
import { MockSignatureProvider } from "@/lib/adapters/mock/mock-signature-provider";
import type { AnalyseCacheStore } from "@/lib/ports/analyse-cache-store";
import { MockAnalyseCacheStore } from "@/lib/adapters/mock/mock-analyse-cache-store";
import { SupabaseAnalyseCacheStore } from "@/lib/adapters/supabase/supabase-analyse-cache-store";
import type { MailOutboundProvider } from "@/lib/ports/mail-outbound-provider";
import { GraphMailOutboundProvider } from "@/lib/adapters/mail/graph-mail-outbound";
import { NoopMailOutboundProvider } from "@/lib/adapters/mail/noop-mail-outbound";
import type { CalendrierOutboundProvider } from "@/lib/ports/calendrier-outbound-provider";
import { GraphCalendrierOutboundProvider } from "@/lib/adapters/calendrier/graph-calendrier-outbound";
import { NoopCalendrierOutboundProvider } from "@/lib/adapters/calendrier/noop-calendrier-outbound";
import type { MailboxProvider } from "@/lib/ports/mailbox-provider";
import { GraphMailboxProvider } from "@/lib/adapters/mail/graph-mailbox";
import { NoopMailboxProvider } from "@/lib/adapters/mail/noop-mailbox";
import { SupabaseCoproRepository } from "@/lib/adapters/supabase/supabase-copro-repository";
import type { JalonRepository } from "@/lib/ports/jalon-repository";
import { SupabaseJalonRepository } from "@/lib/adapters/supabase/supabase-jalon-repository";
import { MockJalonRepository } from "@/lib/adapters/mock/mock-jalon-repository";
import type { PriseEnMainRepository } from "@/lib/ports/prise-en-main-repository";
import { SupabasePriseEnMainRepository } from "@/lib/adapters/supabase/supabase-prise-en-main-repository";
import { MockPriseEnMainRepository } from "@/lib/adapters/mock/mock-prise-en-main-repository";
import type { ConfirmationEvenementRepository } from "@/lib/ports/confirmation-evenement-repository";
import { SupabaseConfirmationEvenementRepository } from "@/lib/adapters/supabase/supabase-confirmation-evenement-repository";
import { MockConfirmationEvenementRepository } from "@/lib/adapters/mock/mock-confirmation-evenement-repository";
import type { DossierRepository } from "@/lib/ports/dossier-repository";
import { SupabaseDossierRepository } from "@/lib/adapters/supabase/supabase-dossier-repository";
import { MockDossierRepository } from "@/lib/adapters/mock/mock-dossier-repository";
import type { SinistreRepository } from "@/lib/ports/sinistre-repository";
import { SupabaseSinistreRepository } from "@/lib/adapters/supabase/supabase-sinistre-repository";
import { MockSinistreRepository } from "@/lib/adapters/mock/mock-sinistre-repository";
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
import type { EstaleCacheStore } from "@/lib/ports/estale-cache-store";
import { SupabaseEstaleCacheStore } from "@/lib/adapters/supabase/supabase-estale-cache-store";
import { MockEstaleCacheStore } from "@/lib/adapters/mock/mock-estale-cache-store";
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

// Confirmation des dates AG/CS par le conseil syndical (table native
// intranet_confirmations_evenement). Meme bascule que les autres tables natives.
export function getConfirmationEvenementRepository(): ConfirmationEvenementRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseConfirmationEvenementRepository();
  return new MockConfirmationEvenementRepository();
}

// Module Dossiers (table native intranet_dossiers).
export function getDossierRepository(): DossierRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseDossierRepository();
  return new MockDossierRepository();
}

// Module Sinistre (table native intranet_sinistres). Persistance serveur cloisonnee
// du dossier sinistre (agregat jsonb). Meme bascule mock/supabase que le reste.
export function getSinistreRepository(): SinistreRepository {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseSinistreRepository();
  return new MockSinistreRepository();
}

// Donnees copro sourcees Estale (CS, historique AG). Branche en reel (Phase B,
// ADR-022) quand les identifiants Estale sont presents ; sinon mock.
export function getCondoEstaleProvider(): CondoEstaleProvider {
  if (process.env.COPRO_SOURCE === "supabase" && estaleConfigure()) {
    return new EstaleCondoProvider();
  }
  return new MockCondoEstaleProvider();
}

// Cache read-through des donnees eStale (ADR-002) : table native si Supabase, sinon no-op.
export function getEstaleCacheStore(): EstaleCacheStore {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseEstaleCacheStore();
  return new MockEstaleCacheStore();
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

// Analyse d'un mail (classification + reponse/plan). Mistral si MISTRAL_API_KEY est
// presente, sinon mock deterministe (permet de tester l'ingestion sans cle).
export function getAnalyseMailProvider(): AnalyseMailProvider {
  if (process.env.MISTRAL_API_KEY) return new MistralAnalyseProvider();
  return new MockAnalyseProvider();
}

// Cache d'analyse par mail (table native intranet_mes_emails_analyse) : memoisation
// LLM, un mail deja analyse n'est jamais renvoye au modele. Meme bascule mock/supabase.
export function getAnalyseCacheStore(): AnalyseCacheStore {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseAnalyseCacheStore();
  return new MockAnalyseCacheStore();
}

// Cache du triage Mes emails (table native intranet_mes_emails_triage). Ecrit par
// la synchro, lu par le cockpit. Meme bascule mock/supabase.
export function getMesEmailsTriageStore(): MesEmailsTriageStore {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseMesEmailsTriageStore();
  return new MockMesEmailsTriageStore();
}

// Annuaire de contacts Crypto (table native intranet_crypto_contacts) : email -> copro,
// pour attribuer un mail par l'expediteur. Vide tant que le JSON Crypto n'est pas importe.
export function getCryptoContactsProvider(): CryptoContactsProvider {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseCryptoContactsRepository();
  return new MockCryptoContactsRepository();
}

// Listes de diffusion Crypto (fallback destinataires du conseil syndical, table native
// intranet_listes_diffusion). Vide tant que le CSV Crypto n'est pas importe.
export function getListesDiffusionProvider(): ListesDiffusionProvider {
  if (process.env.COPRO_SOURCE === "supabase") return new SupabaseListesDiffusionRepository();
  return new MockListesDiffusionRepository();
}

// Ingestion de mail. MAIL_SOURCE=graph -> boite reelle du gestionnaire (delegue,
// quand Mail.Read sera accorde) ; sinon echantillon (test de la chaine sans Graph).
export function getMailIngestionProvider(): MailIngestionProvider {
  if (process.env.MAIL_SOURCE === "graph") return new GraphMailIngestionProvider();
  return new SampleMailIngestionProvider();
}

// Mail sortant (creer un brouillon, envoyer). Graph en reel (MAIL_SOURCE=graph),
// sinon no-op (le bouton ne casse pas en dev/demo sans boite).
export function getMailOutboundProvider(): MailOutboundProvider {
  if (process.env.MAIL_SOURCE === "graph") return new GraphMailOutboundProvider();
  return new NoopMailOutboundProvider();
}

// Boite aux lettres (deplacer un mail dans le sous-dossier copro, etc.). Graph en
// reel (MAIL_SOURCE=graph), sinon no-op (le classement reste cote intranet).
export function getMailboxProvider(): MailboxProvider {
  if (process.env.MAIL_SOURCE === "graph") return new GraphMailboxProvider();
  return new NoopMailboxProvider();
}

// Calendrier sortant (projection des dates CS/AG + RDV d'expertise sinistre dans
// l'agenda Outlook, meme infra Graph que le mail). Graph en reel (MAIL_SOURCE=graph),
// sinon no-op : la projection est sautee, la donnee intranet reste la source.
export function getCalendrierOutboundProvider(): CalendrierOutboundProvider {
  if (process.env.MAIL_SOURCE === "graph") return new GraphCalendrierOutboundProvider();
  return new NoopCalendrierOutboundProvider();
}

// Signature email du gestionnaire (Signitic). Cle SIGNITIC_API_KEY presente -> vraie
// signature ; sinon mock (rendu de demo). Sert a "reprendre la signature" a l'envoi.
export function getSignatureProvider(): SignatureProvider {
  if (process.env.SIGNITIC_API_KEY) return new SigniticSignatureProvider();
  return new MockSignatureProvider();
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
