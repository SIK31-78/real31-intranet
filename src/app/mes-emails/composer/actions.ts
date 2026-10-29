"use server";

// Server actions du compositeur de mail. Endpoints POST publics -> validation zod + gate
// (gestionnaire résolu côté serveur, module mail actif). Lecture (copros, contacts,
// dossiers), puis l'envoi en trois temps (27/10/2026, comme la réponse, REA-421) : préparer
// le brouillon, déposer les fichiers par la route /mes-emails/pj/depot, finaliser (envoi si
// la boîte le permet, sinon brouillon dans Outlook) ou abandonner (brouillon supprimé).

import { z } from "zod";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { echec, echecDepuis, type Res } from "@/lib/actions/resultat";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import {
  abandonnerComposition,
  boiteDeComposition,
  brouillonPossible,
  finaliserComposition,
  preparerComposition,
  listerContactsComposition,
  listerCoprosComposition,
  listerCollegues,
  listerDossiersComposition,
  rechercherDestinataires,
  type CoproChoisissable,
  type DossierComposition,
  type PreparationComposition,
  type ResultatBrouillon,
} from "@/lib/services/mes-emails/composer-mail";
import { ADRESSE_MAIL, adresseMailValide, type ContactsComposition, type DestinataireTrouve } from "@/lib/domain/mes-emails-composition";
import type { Collegue } from "@/lib/domain/destinataires-collegues";
import { corpsMisEnForme } from "@/lib/services/mes-emails/corps-mis-en-forme";
import { NB_MAX_FICHIERS, TAILLE_MAX_FICHIER, TAILLE_MAX_TOTALE } from "@/lib/domain/piece-jointe-flux";
import { boiteCible } from "../gardes-boites";

const CTX = "mes-emails-composer";
const INDISPONIBLE = "Le module e-mails n'est pas disponible.";
// Format strict : la référence finit dans un filtre PostgREST (.or) côté adaptateur.
const zReference = z.string().regex(/^(SE|S)\d{3,4}$/i);

async function gestionnaire(): Promise<Gestionnaire | null> {
  const g = await getGestionnaireCourant();
  return g && mailModuleActifPour(g.email) ? g : null;
}

/** La boîte triée de l'agence de la personne (27/10/2026) : boîte d'envoi et copros proposées. */
const boiteDe = (g: Gestionnaire) => boiteDeComposition(g, estSuperAdmin(g.email));

export async function listerCoprosCompositionAction(): Promise<Res<CoproChoisissable[]>> {
  const g = await gestionnaire();
  if (!g) return echec(INDISPONIBLE);
  try {
    return { ok: true, donnees: await listerCoprosComposition(await boiteDe(g)) };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}

export async function rechercherDestinatairesAction(input: unknown): Promise<Res<DestinataireTrouve[]>> {
  const g = await gestionnaire();
  if (!g) return echec(INDISPONIBLE);
  const d = z.object({ texte: z.string().trim().min(3).max(100) }).safeParse(input);
  if (!d.success) return { ok: true, donnees: [] };
  try {
    return { ok: true, donnees: await rechercherDestinataires(d.data.texte, await boiteDe(g)) };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}

/**
 * Les collègues (adresses REAL31 de la table User) : l'écran reconnaît à l'envoi l'adresse
 * personnelle d'un collègue et le fait confirmer (décision 14, incident Elsa du 29/10/2026).
 */
export async function listerColleguesAction(): Promise<Res<Collegue[]>> {
  const g = await gestionnaire();
  if (!g) return echec(INDISPONIBLE);
  try {
    return { ok: true, donnees: await listerCollegues() };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}

export async function listerContactsCompositionAction(input: unknown): Promise<Res<ContactsComposition>> {
  const g = await gestionnaire();
  if (!g) return echec(INDISPONIBLE);
  const d = z.object({ reference: zReference }).safeParse(input);
  if (!d.success) return echec("Référence de copropriété invalide.");
  try {
    // L'envoyeur = la personne connectée (session), jamais un paramètre client : il décide
    // qui du binôme passe en copie avec le conseil syndical (28/10/2026).
    return { ok: true, donnees: await listerContactsComposition(d.data.reference, g.email) };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}

export async function listerDossiersCompositionAction(input: unknown): Promise<Res<DossierComposition[]>> {
  const g = await gestionnaire();
  if (!g) return echec(INDISPONIBLE);
  const d = z.object({ reference: zReference }).safeParse(input);
  if (!d.success) return echec("Référence de copropriété invalide.");
  try {
    return { ok: true, donnees: await listerDossiersComposition(g.id, d.data.reference.toUpperCase()) };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}

/**
 * Ce qui bloque, dit précisément : une adresse invalide est nommée (Nicolas a cherché du
 * côté de l'objet et des pièces jointes alors que c'était « mylène.pin@… » en copie, 15/10/2026).
 */
function motifRefus(input: unknown): string {
  const i = (input ?? {}) as { objet?: unknown; a?: unknown; cc?: unknown; cci?: unknown };
  const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const invalides = [...liste(i.a), ...liste(i.cc)].filter((e) => !adresseMailValide(e));
  if (invalides.length) {
    return `Adresse invalide : ${invalides.map((e) => `« ${e} »`).join(", ")}. Une adresse ne prend ni accent ni espace.`;
  }
  if (!liste(i.a).length && !liste(i.cci).length) return "Il manque un destinataire.";
  if (typeof i.objet !== "string" || !i.objet.trim()) return "Il manque l'objet du mail.";
  return "Le mail n'a pas pu partir : une pièce jointe dépasse 25 Mo, il y en a plus de 10, ou le message est trop long.";
}

const zJetons = z.object({ jetons: z.array(z.string().min(1).max(4000)).min(1).max(20) });

/**
 * Premier temps : le(s) brouillon(s) dans la boîte d'envoi, sans fichier, et un jeton par
 * brouillon. Les fichiers ne voyagent plus dans l'action (seuls leurs noms et tailles, pour les
 * limites) : le navigateur les dépose ensuite par tranches. Aperçu (pas de boîte branchée) :
 * simulation, rien n'est écrit.
 */
export async function preparerCompositionAction(input: unknown): Promise<Res<PreparationComposition>> {
  const g = await gestionnaire();
  if (!g) return echec(INDISPONIBLE);
  const d = z
    .object({
      objet: z.string().min(1).max(500),
      corps: z.string().max(20000),
      a: z.array(z.string().max(320).regex(ADRESSE_MAIL)).max(200),
      cc: z.array(z.string().max(320).regex(ADRESSE_MAIL)).max(200),
      // Toute la copropriété (REA-305) : la plus grosse copro tient sous 3 000 adresses.
      cci: z.array(z.string().max(320).regex(ADRESSE_MAIL)).max(3000).default([]),
      dossierId: z.string().min(1).max(80).optional(),
      // Les fichiers à déposer ensuite : 25 Mo chacun, 10 au plus, comme la réponse.
      fichiers: z
        .array(z.object({ nom: z.string().trim().min(1).max(255), taille: z.number().int().min(1).max(TAILLE_MAX_FICHIER) }))
        .max(NB_MAX_FICHIERS)
        .default([]),
      // Corps mis en forme (REA-345, pilote) : renettoyé côté serveur.
      corpsHtml: z.string().optional(),
    })
    .refine((v) => v.a.length > 0 || v.cci.length > 0)
    .safeParse(input);
  if (!d.success) return echec(motifRefus(input));
  if (d.data.fichiers.reduce((t, f) => t + f.taille, 0) > TAILLE_MAX_TOTALE) {
    return echec("Pièces jointes trop lourdes : 25 Mo au total. Dépose les plus grosses sur SharePoint et envoie le lien.");
  }
  const riche = corpsMisEnForme(true, d.data.corpsHtml);
  if (riche === "refuse") return echec("La mise en forme est en essai : elle n'est pas encore ouverte.");
  try {
    const config = await boiteDe(g);
    // La boîte d'envoi doit être une boîte visible de la personne (son agence, toutes pour un
    // super-admin), comme le « De : » d'une réponse. Aperçu sans boîte : rien à garder.
    if (config && brouillonPossible(config) && !(await boiteCible(g, config.boite))) return echec("Boîte non autorisée.");
    const { objet, a, cc, cci, dossierId } = d.data;
    const corps = riche ? riche.corps : d.data.corps;
    return {
      ok: true,
      donnees: await preparerComposition(
        { objet, corps, ...(riche ? { corpsHtml: riche.corpsHtml } : {}), a, cc, ...(cci.length ? { cci } : {}), ...(dossierId ? { dossierId } : {}) },
        g,
        config,
      ),
    };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}

/** Troisième temps : les fichiers sont déposés, le mail part (ou reste en brouillon) et rejoint son dossier. */
export async function finaliserCompositionAction(input: unknown): Promise<Res<ResultatBrouillon>> {
  const g = await gestionnaire();
  if (!g) return echec(INDISPONIBLE);
  const d = zJetons.safeParse(input);
  if (!d.success) return echec("Données invalides.");
  try {
    const r = await finaliserComposition(d.data.jetons, g);
    return r ? { ok: true, donnees: r } : echec("L'envoi a expiré (15 minutes) : le mail est resté dans les brouillons d'Outlook.");
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}

/** Un fichier n'a pas pu être joint : les brouillons incomplets sont supprimés, rien ne part. */
export async function abandonnerCompositionAction(input: unknown): Promise<Res<null>> {
  const g = await gestionnaire();
  if (!g) return echec(INDISPONIBLE);
  const d = zJetons.safeParse(input);
  if (!d.success) return echec("Données invalides.");
  try {
    return (await abandonnerComposition(d.data.jetons, g.id)) ? { ok: true, donnees: null } : echec("L'envoi a expiré (15 minutes).");
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}
