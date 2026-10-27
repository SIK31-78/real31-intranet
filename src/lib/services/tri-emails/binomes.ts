// Binomes du tri des e-mails (ADR-046) : ESTALE donne le gestionnaire de chaque copro,
// l'intranet tient ses assistants. Un assistant PRINCIPAL par gestionnaire (les copros
// sans affectation), d'autres au besoin, affectes copro par copro (arbitrage du 08/10/2026).
// Depuis le 27/10/2026, une copro dont la fiche nomme un autre assistant du gestionnaire va
// d'elle-meme a ce binome (`binomeDeCopro`) ; l'affectation a la main reste prioritaire.
// Changer le principal renomme son dossier au prochain rangement ; aucun mail ne bouge.

import { binomeDeLaFiche, type MembreTri } from "@/lib/domain/tri-emails";
import {
  getGestionnaireRepository,
  getReferentielTriProvider,
  getTriRepository,
} from "@/lib/adapters/router";

/** Un collaborateur qu'on peut designer comme assistant. */
export interface Collaborateur extends MembreTri {
  initiales: string;
  /** Role de public."User" (ASSISTANT, GESTIONNAIRE...), pour l'affichage et le tri. */
  role: string | null;
}

/** Roles qui ne gerent pas de copropriete : exclus de la liste des gestionnaires. */
const ROLES_NON_GESTIONNAIRES = new Set(["ASSISTANT", "COMPTABLE"]);

const minuscules = (e: string) => e.trim().toLowerCase();

export async function listerCollaborateurs(): Promise<Collaborateur[]> {
  const tous = await getGestionnaireRepository().listTous();
  return tous
    .filter((g): g is typeof g & { email: string } => Boolean(g.email))
    .map((g) => ({ nomComplet: g.nomComplet, email: minuscules(g.email), initiales: g.initiales, role: g.role ?? null }))
    // Les assistants d'abord : ce sont eux qu'on cherche le plus souvent.
    .sort((a, b) => Number(b.role === "ASSISTANT") - Number(a.role === "ASSISTANT") || a.nomComplet.localeCompare(b.nomComplet, "fr"));
}

/**
 * Les gestionnaires du cabinet, meme sans copro ESTALE. `list()` rend tous ceux qui
 * figurent dans une equipe de copro, assistants compris (il sert aussi au dev-login) :
 * on ecarte les roles qui ne gerent pas (constat de Sekou du 08/10/2026 : Wilfrid
 * apparaissait en gestionnaire).
 */
export async function listerGestionnairesCabinet(): Promise<MembreTri[]> {
  const liste = await getGestionnaireRepository().list();
  return liste
    .filter((g): g is typeof g & { email: string } => Boolean(g.email))
    .filter((g) => !ROLES_NON_GESTIONNAIRES.has((g.role ?? "").toUpperCase()))
    .map((g) => ({ nomComplet: g.nomComplet, email: minuscules(g.email) }));
}

async function personnes(emailGestionnaire: string, emailAssistant: string) {
  const g = minuscules(emailGestionnaire);
  const a = minuscules(emailAssistant);
  if (g === a) throw new Error("Le gestionnaire ne peut pas être son propre assistant.");
  const collaborateurs = await listerCollaborateurs();
  if (!collaborateurs.some((c) => c.email === g)) throw new Error("Gestionnaire introuvable dans l'intranet.");
  const assistant = collaborateurs.find((c) => c.email === a);
  if (!assistant) throw new Error("Collaborateur introuvable dans l'intranet.");
  return { g, assistant: { nomComplet: assistant.nomComplet, email: assistant.email } };
}

/** Pose (ou change) l'assistant principal d'un gestionnaire. */
export async function definirPrincipal(emailGestionnaire: string, emailAssistant: string, par: string): Promise<void> {
  const { g, assistant } = await personnes(emailGestionnaire, emailAssistant);
  const repo = getTriRepository();
  const siens = (await repo.binomes()).binomes.filter((x) => x.gestionnaireEmail === g);
  const principal = siens.find((x) => x.principal);
  const meme = siens.find((x) => x.assistant.email === assistant.email);
  if (meme?.principal) return;
  if (meme && principal) {
    // L'assistant etait « autre » : ses copros reviennent au principal, qui devient lui.
    await repo.supprimerBinome(meme.id);
    await repo.enregistrerBinome({ ...principal, assistant }, par);
    return;
  }
  if (meme) {
    await repo.enregistrerBinome({ ...meme, principal: true }, par);
    return;
  }
  if (principal) {
    await repo.enregistrerBinome({ ...principal, assistant }, par);
    return;
  }
  await repo.enregistrerBinome({ gestionnaireEmail: g, assistant, principal: true }, par);
}

/** Ajoute un autre assistant au gestionnaire (copros partagees). */
export async function ajouterAssistant(emailGestionnaire: string, emailAssistant: string, par: string): Promise<void> {
  const { g, assistant } = await personnes(emailGestionnaire, emailAssistant);
  const repo = getTriRepository();
  const siens = (await repo.binomes()).binomes.filter((x) => x.gestionnaireEmail === g);
  if (siens.some((x) => x.assistant.email === assistant.email)) {
    throw new Error("Ce collaborateur est déjà assistant de ce gestionnaire.");
  }
  await repo.enregistrerBinome({ gestionnaireEmail: g, assistant, principal: false }, par);
}

/** Retire un assistant ; ses copros reviennent au principal. */
export async function retirerAssistant(binomeId: string): Promise<void> {
  const repo = getTriRepository();
  if (!(await repo.binomes()).binomes.some((x) => x.id === binomeId)) throw new Error("Ce binôme n'existe plus.");
  await repo.supprimerBinome(binomeId);
}

/**
 * Confie une copro a un assistant de son gestionnaire, ou la rend au principal (null). La
 * copro est cherchee dans le referentiel des `agences` de la boite affichee (27/10/2026).
 */
export async function affecterCopro(reference: string, binomeId: string | null, par: string, agences: readonly string[]): Promise<void> {
  const repo = getTriRepository();
  const [ref, b] = await Promise.all([getReferentielTriProvider(agences).charger(), repo.binomes()]);
  const copro = ref.copros.find((c) => c.reference === reference);
  if (!copro?.gestionnaire) throw new Error(`La copropriété ${reference} n'a pas de gestionnaire dans ESTALE.`);
  const g = minuscules(copro.gestionnaire.email);
  // null = « le principal » : son id, pour pouvoir l'imposer quand la fiche designe un autre binome.
  let cible = binomeId ?? b.binomes.find((x) => x.gestionnaireEmail === g && x.principal)?.id ?? null;
  if (cible) {
    const binome = b.binomes.find((x) => x.id === cible);
    if (!binome || binome.gestionnaireEmail !== g) {
      throw new Error("Cet assistant ne travaille pas avec le gestionnaire de cette copropriété.");
    }
  }
  // Pas d'affectation particuliere quand le choix est celui que donne deja la fiche, ou le
  // principal (27/10/2026 : l'assistant de la fiche passe devant le principal).
  const naturel = binomeDeLaFiche(copro, b) ?? b.binomes.find((x) => x.gestionnaireEmail === g && x.principal) ?? null;
  if (cible === (naturel?.id ?? null)) cible = null;
  await repo.affecterCopro(reference, cible, par);
}
