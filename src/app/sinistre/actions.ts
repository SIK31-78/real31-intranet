"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import {
  getCoproRepository,
  getDossierRepository,
  getMailOutboundProvider,
  getSinistreRepository,
} from "@/lib/adapters/router";
import { SinistrePersistanceIndisponible } from "@/lib/ports/sinistre-repository";
import { projeterEtapesDepuisParcours } from "@/lib/domain/sinistre/engine/etapes";
import type { DossierState } from "@/lib/domain/sinistre/types";

// Contexte immeuble/copro + signataire pre-rempli depuis un dossier de type sinistre.
// Sert a tuer la double-saisie : ouvrir le wizard avec ?dossier=<id> importe l'identite
// immeuble (nom, adresse), la copro et le gestionnaire courant.
export interface ContexteDossierSinistre {
  /** Code referentiel de la copro (public.Copropriete), sert de coproprieteId au store. */
  coproCode: string;
  coproNom: string;
  /** Adresse immeuble sur une ligne (ligne1, code postal ville). */
  immeubleAdresse: string;
  /** Agence derivee de la copro (D2), si connue. */
  agenceId?: string;
  gestionnaire: { nom: string; email: string; initiales: string };
}

const zId = z.string().trim().min(1).max(120);

/** Adresse copro -> une ligne lisible pour le champ immeuble du wizard. */
function adresseUneLigne(adresse: {
  ligne1: string;
  ligne2?: string;
  codePostal: string;
  ville: string;
}): string {
  const rue = [adresse.ligne1, adresse.ligne2].filter(Boolean).join(", ");
  const ville = [adresse.codePostal, adresse.ville].filter(Boolean).join(" ");
  return [rue, ville].filter(Boolean).join(" - ");
}

// Charge le contexte d'un dossier sinistre pour pre-remplir le wizard. Retourne null
// (jamais d'erreur cote client) si : pas de gestionnaire, dossier absent / pas un
// sinistre, ou copro hors perimetre. ANTI-IDOR : le coproCode vient du dossier serveur,
// jamais d'un parametre client.
export async function chargerContexteDossierAction(
  dossierId: string,
): Promise<ContexteDossierSinistre | null> {
  if (!zId.safeParse(dossierId).success) return null;

  const g = await getGestionnaireCourant();
  if (!g) return null;

  const dossier = await getDossierRepository().get(dossierId);
  if (!dossier || dossier.type !== "sinistre") return null;

  // Cloisonnement : la copro du dossier doit appartenir au gestionnaire (mode supabase).
  // En mock, on ne verrouille pas (pas de vraie data) - meme regle que autorise() cote Dossiers.
  if (
    process.env.COPRO_SOURCE === "supabase" &&
    !(await coproAppartient(dossier.coproCode, g.id))
  ) {
    return null;
  }

  const copro = await getCoproRepository().findByCode(dossier.coproCode, g.id);
  if (!copro) return null;

  return {
    coproCode: copro.code,
    coproNom: copro.nom,
    immeubleAdresse: adresseUneLigne(copro.adresse),
    ...(copro.agenceId ? { agenceId: copro.agenceId } : {}),
    gestionnaire: {
      nom: g.nomComplet,
      email: g.email ?? "",
      initiales: g.initiales,
    },
  };
}

// --- Persistance serveur du dossier sinistre (incrément 3) ---------------------
// L'agregat metier complet (DossierState) est lourd et nesté. On ne re-decrit pas
// tout le schema en zod : on BORNE (taille serialisee + champs scalaires sensibles)
// et on laisse passer le reste. La verite de forme reste le type cote domaine ; ici
// on se protege surtout contre l'abus (payload geant) et l'injection de scalaires.

const TAILLE_MAX_PAYLOAD = 500 * 1024; // 500 Ko serialise (garde-fou jsonb)

const zChamp = z.string().trim().max(400);
const zDossierState = z
  .object({
    id: z.string().trim().max(120).optional(),
    referenceInterne: z.string().trim().max(60),
    date: z.string().trim().max(40),
    descriptif: z.string().max(5000).optional(),
    coproprieteId: z.string().trim().max(120).optional(),
    agenceId: zChamp.optional(),
    statut: z.string().trim().max(40),
    immeuble: z.object({ nom: zChamp, adresse: zChamp }).passthrough(),
    locaux: z.array(z.unknown()).max(200),
    activeLocalId: z.string().trim().max(120),
  })
  // Le reste de l'agregat (parties, mesures, rdv, assureur...) passe tel quel : on
  // ne le re-valide pas champ par champ, mais la taille globale est plafonnee ci-dessous.
  .passthrough();

export type EnregistrerSinistreResultat =
  | { ok: true; id: string; referenceInterne: string }
  | { ok: false; erreur: string };

// Enregistre le dossier sinistre cote serveur (cloisonne). Le client n'appelle JAMAIS
// Supabase : il passe par cette action. ANTI-IDOR : le coproCode vient du client
// (etat.coproprieteId) -> on exige le perimetre AVANT toute ecriture (jamais de confiance).
// Pas d'id -> creation (reference generee serveur) ; sinon -> patch. Degrade
// proprement si la table n'existe pas encore (ok:false, parcours non bloque cote UI).
export async function enregistrerSinistreAction(
  etat: DossierState,
): Promise<EnregistrerSinistreResultat> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Non connecté." };

  // Borne de taille (avant tout) : un payload geant est refuse net.
  let serialise: string;
  try {
    serialise = JSON.stringify(etat);
  } catch {
    return { ok: false, erreur: "Dossier non sérialisable." };
  }
  if (serialise.length > TAILLE_MAX_PAYLOAD) {
    return { ok: false, erreur: "Dossier trop volumineux pour être enregistré." };
  }

  const parsed = zDossierState.safeParse(etat);
  if (!parsed.success) return { ok: false, erreur: "Dossier invalide." };

  // Cloisonnement (defense en profondeur, en plus de la garde dans l'adapter).
  try {
    await exigerPerimetre(etat.coproprieteId ?? "", g.id);
  } catch {
    return { ok: false, erreur: "Copropriété hors de votre périmètre." };
  }

  const repo = getSinistreRepository();
  try {
    if (!etat.id) {
      const { id, referenceInterne } = await repo.creer({ etat, managerId: g.id });
      return { ok: true, id, referenceInterne };
    }
    // Patch : ANTI-IDOR sur l'ENREGISTREMENT EXISTANT. Le `etat.id` vient du client ;
    // on ne lui fait pas confiance. On relit la ligne persistee et on verifie que SA
    // copro (cote serveur) appartient au gestionnaire, sinon on refuse (un id de la
    // copro d'autrui ne peut pas etre ecrase, meme si l'etat envoye porte une copro
    // legitime). En mode supabase uniquement (mock = pas de vraie data).
    if (process.env.COPRO_SOURCE === "supabase") {
      const existant = await repo.get(etat.id, g.id);
      if (!existant) return { ok: false, erreur: "Dossier introuvable." };
      if (!(await coproAppartient(existant.coproprieteId ?? "", g.id))) {
        return { ok: false, erreur: "Copropriété hors de votre périmètre." };
      }
    }
    await repo.patch(etat.id, etat, g.id);
    return { ok: true, id: etat.id, referenceInterne: etat.referenceInterne };
  } catch (e) {
    if (e instanceof SinistrePersistanceIndisponible) {
      return { ok: false, erreur: "Persistance indisponible (table absente)." };
    }
    return { ok: false, erreur: "Échec de l'enregistrement." };
  }
}

// Recharge un dossier sinistre persiste. ANTI-IDOR : on verifie que la copro du
// dossier appartient au gestionnaire (le cloisonnement vit cote action, l'adapter
// reste pur - cf. en-tete de supabase-sinistre-repository). null si hors scope.
export async function chargerSinistreAction(id: string): Promise<DossierState | null> {
  if (!zId.safeParse(id).success) return null;
  const g = await getGestionnaireCourant();
  if (!g) return null;

  const etat = await getSinistreRepository().get(id, g.id);
  if (!etat) return null;

  // En mode supabase, une copro hors perimetre -> on ne divulgue rien (meme regle
  // que chargerContexteDossierAction). En mock, pas de vraie data : pas de verrou.
  if (
    process.env.COPRO_SOURCE === "supabase" &&
    !(await coproAppartient(etat.coproprieteId ?? "", g.id))
  ) {
    return null;
  }
  return etat;
}

// --- Generation des etapes du dossier DEPUIS le parcours (incrément 5) ----------
// On projette cote SERVEUR (et non cote client) : l'action recoit l'etat du
// parcours (DossierState, deja borne par zDossierState) et fabrique elle-meme les
// etapes via la projection PURE. Le client ne peut donc pas injecter une etape
// arbitraire (label bidon, fait:true, assignation imposee) - meme posture
// "ne jamais faire confiance au client" que le reste de ce fichier.

export type GenererEtapesSinistreResultat =
  | { ok: true; ajoutees: number }
  | { ok: false; erreur: string };

/** Cle de dedup d'une etape : id stable, sinon label normalise (insensible casse/accents/espaces). */
function cleEtape(e: { id?: string; label: string }): string {
  if (e.id && e.id.trim()) return `id:${e.id.trim()}`;
  const label = e.label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return `label:${label}`;
}

// Genere les etapes d'un dossier sinistre a partir du parcours DDE. NON DESTRUCTIF :
// on n'ecrase / ne supprime JAMAIS une etape existante (toute etape deja presente,
// y compris cochee `fait`, est conservee intacte). On n'AJOUTE que les etapes
// projetees absentes (dedup par id stable, repli sur label normalise). Garde : meme
// pattern que reporterRdvExpertiseAction (auth + dossier relu + type sinistre +
// perimetre relu du dossier serveur (anti-IDOR) + zod sur l'etat). Journalise l'ajout.
export async function genererEtapesSinistreAction(
  dossierId: string,
  etat: DossierState,
): Promise<GenererEtapesSinistreResultat> {
  if (!zId.safeParse(dossierId).success) return { ok: false, erreur: "Identifiant invalide." };

  // Borne de taille puis forme (meme garde-fou que enregistrerSinistreAction).
  let serialise: string;
  try {
    serialise = JSON.stringify(etat);
  } catch {
    return { ok: false, erreur: "Parcours non sérialisable." };
  }
  if (serialise.length > TAILLE_MAX_PAYLOAD) {
    return { ok: false, erreur: "Parcours trop volumineux." };
  }
  if (!zDossierState.safeParse(etat).success) return { ok: false, erreur: "Parcours invalide." };

  const d = await getDossierRepository().get(dossierId);
  if (!d || d.type !== "sinistre") return { ok: false, erreur: "Dossier sinistre introuvable." };

  // coproCode RELU du dossier serveur (anti-IDOR) ; cloisonnement en mode supabase.
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Non connecté." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(d.coproCode, g.id))) {
    return { ok: false, erreur: "Copropriété hors de votre périmètre." };
  }

  // Projection PURE cote serveur (le client n'a pas fabrique la liste).
  const proposees = projeterEtapesDepuisParcours(etat);
  const existantes = new Set(d.etapes.map(cleEtape));
  const ajouts = proposees.filter((e) => !existantes.has(cleEtape(e)));
  if (ajouts.length === 0) return { ok: true, ajoutees: 0 };

  // Append uniquement : les etapes existantes (et leur etat `fait`) restent intactes.
  const etapes = [...d.etapes, ...ajouts];
  const journal = [
    ...d.journal,
    {
      le: new Date().toISOString(),
      par: g.initiales,
      texte: `Étapes générées depuis le parcours sinistre : ${ajouts.length} ajoutée${ajouts.length > 1 ? "s" : ""}`,
      kind: "etape" as const,
    },
  ];
  await getDossierRepository().patch(dossierId, { etapes, journal });
  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true, ajoutees: ajouts.length };
}

// --- Brouillon mail neuf depuis un courrier-type sinistre (ADR-028) -------------
// Cree un brouillon NEUF (pas une reponse) dans la boite DU gestionnaire courant
// via Graph. La boite vient de la SESSION (g.email), JAMAIS d'un parametre client :
// le gestionnaire ne peut composer que dans sa propre boite. Degrade proprement si
// le module mail n'est pas actif (MAIL_SOURCE != graph) ou si Graph echoue : on
// renvoie {ok:false, erreur} et l'UI garde le repli mailto. Ne crashe jamais.

export type CreerBrouillonCourrierResultat =
  | { ok: true; webLink?: string }
  | { ok: false; erreur: string };

const zEmails = z
  .array(z.string().trim().max(254))
  .max(20)
  .optional()
  .transform((arr) => (arr ?? []).filter((a) => a.includes("@")));

const zBrouillonCourrier = z.object({
  sujet: z.string().trim().min(1).max(300),
  corps: z.string().min(1).max(50000),
  a: zEmails,
  cc: zEmails,
});

export async function creerBrouillonCourrierAction(p: {
  sujet: string;
  corps: string;
  a?: string[];
  cc?: string[];
}): Promise<CreerBrouillonCourrierResultat> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Non connecté." };
  // La boite = SA propre adresse (session), jamais un parametre client.
  if (!g.email) return { ok: false, erreur: "Adresse du gestionnaire inconnue." };

  const parsed = zBrouillonCourrier.safeParse(p);
  if (!parsed.success) return { ok: false, erreur: "Courrier invalide (sujet ou corps)." };

  // Mail non actif (provider = noop) : pas de Graph, on le dit clairement plutot
  // que de faire croire a un succes (le noop renverrait {} sans webLink).
  if (process.env.MAIL_SOURCE !== "graph") {
    return { ok: false, erreur: "Module mail non actif (brouillon indisponible)." };
  }

  try {
    const { webLink } = await getMailOutboundProvider().creerBrouillonNeuf({
      boite: g.email,
      sujet: parsed.data.sujet,
      corps: parsed.data.corps,
      a: parsed.data.a,
      cc: parsed.data.cc,
    });
    return webLink ? { ok: true, webLink } : { ok: true };
  } catch {
    return { ok: false, erreur: "Création du brouillon impossible (Graph indisponible)." };
  }
}
