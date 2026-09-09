"use server";

// Server Actions de la FICHE d'un dossier de reprise (tableau de suivi d'équipe, ADR-037).
// Contrat uniforme {ok,...} : jamais de throw côté client. Validation Zod sur toutes les entrées.
//
// NB : une reprise concerne une copro PAS ENCORE dans le périmètre eStale -> PAS de check
// coproAppartient ici.
//
// DEUX GARDES (cf. lib/auth/roles.ts) :
//   - SUIVI D'ÉQUIPE (statut, assignation, note, échéance, étape ad hoc, équipe, cadrage, note de
//     journal) : OUVERT à tout gestionnaire connecté — c'est un outil partagé, sans cloisonnement.
//     L'auteur (nom) et la date sont fabriqués ICI, jamais reçus du client.
//   - ARCHIVAGE / SUPPRESSION du dossier et FICHES DE RENSEIGNEMENTS (envoi au nom du cabinet,
//     écriture eStale) : ADMIN REPRISE seulement (exigerAdminReprise).
//
// ANTI-INJECTION : tout id de personne soumis passe par validerCollaborateursConnus ; le nom
// dénormalisé vient de la liste des collaborateurs, jamais du client.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { exigerAdminReprise } from "@/lib/auth/garde-reprise";
import {
  getRepriseDossierRepository,
  getFicheRenseignementsRepository,
  getEstaleFicheContactProvider,
} from "@/lib/reprise/adapters/router";
import {
  obtenirDossier,
  archiverDossier,
  supprimerDossierEtFiches,
  ajouterJournal,
  changerStatutEtape,
  assignerEtape,
  noterEtape,
  fixerEcheance,
  ajouterEtapeAdHocAuDossier,
  supprimerEtapeAdHoc,
  definirEquipe,
  definirCadrage,
} from "@/lib/reprise/services/suivi-dossier";
import { PHASES, ROLES_REPRISE, type Dossier, type EquipeReprise, type RoleReprise } from "@/lib/reprise/domain/dossier";
import { genererCourriers, validerFiche, envoyerFicheParEmail } from "@/lib/reprise/services/fiches-renseignements";
import { genererCourriersDocument, type ContexteCourrier } from "@/lib/reprise/domain/fiche-courrier";
import { objetMailEspaceClient, corpsMailEspaceClient } from "@/lib/reprise/domain/mail-espace-client";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { envoyerMailReunion } from "@/lib/services/coproprietes/envoyer-mail-reunion";
import { validerCollaborateursConnus } from "@/app/reprise-copro/collaborateurs";

export type ActionResultat = { ok: true } | { ok: false; message: string };

// --- Briques communes ---------------------------------------------------------

const zRef = z.string().trim().min(1).max(40);
const zCode = z.string().trim().min(1).max(20);
const zPersonneId = z.string().trim().min(1).max(80).nullable();
/** ISO date AAAA-MM-JJ (input type=date), ou null pour effacer. */
const zDateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const zStatut = z.enum(["a_faire", "en_cours", "bloque", "fait", "ignore"]);
const zPhase = z.enum(PHASES);

const MESSAGE_SESSION = "Session expirée : reconnecte-toi pour modifier ce dossier.";

type Contexte = { ok: true; ctx: { auteur: string; dateIso: string } } | { ok: false; message: string };

/** Contexte de mutation = qui (nom de l'utilisateur courant) + quand (maintenant). Jamais du client. */
async function contexteCourant(): Promise<Contexte> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: MESSAGE_SESSION };
  return { ok: true, ctx: { auteur: g.nomComplet, dateIso: new Date().toISOString() } };
}

function revalider(ref: string) {
  revalidatePath(`/reprise-copro/dossiers/${ref}`);
  revalidatePath("/reprise-copro/dossiers");
}

/** Une { erreur } du service devient un { ok: false, message } ; une exception aussi. */
async function executer(ref: string, run: () => Promise<Dossier | { erreur: string }>, defaut: string): Promise<ActionResultat> {
  try {
    const r = await run();
    if ("erreur" in r) return { ok: false, message: r.erreur };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : defaut };
  }
  revalider(ref);
  return { ok: true };
}

// --- SUIVI D'ÉQUIPE (ouvert à tout gestionnaire connecté) ----------------------

const schemaStatut = z.object({ ref: zRef, code: zCode, statut: zStatut, motif: z.string().trim().max(500).optional() });

/** Change le statut d'une étape ; « bloque » exige un motif (contrôlé ici ET par le service). */
export async function changerStatutEtapeAction(
  ref: string,
  code: string,
  statut: string,
  motif?: string,
): Promise<ActionResultat> {
  const valid = schemaStatut.safeParse({ ref, code, statut, motif });
  if (!valid.success) return { ok: false, message: "Étape ou statut invalide." };
  if (valid.data.statut === "bloque" && !valid.data.motif) {
    return { ok: false, message: "Indique le motif du blocage." };
  }
  const c = await contexteCourant();
  if (!c.ok) return c;
  const repo = getRepriseDossierRepository();
  return executer(
    valid.data.ref,
    () => changerStatutEtape(repo, valid.data.ref, valid.data.code, valid.data.statut, c.ctx, valid.data.motif),
    "Mise à jour impossible.",
  );
}

const schemaAssigner = z.object({ ref: zRef, code: zCode, personneId: zPersonneId });

/** Assigne une étape à un collaborateur connu (null = désassigner). */
export async function assignerEtapeAction(ref: string, code: string, personneId: string | null): Promise<ActionResultat> {
  const valid = schemaAssigner.safeParse({ ref, code, personneId });
  if (!valid.success) return { ok: false, message: "Paramètres invalides." };
  const c = await contexteCourant();
  if (!c.ok) return c;
  const connus = await validerCollaborateursConnus([valid.data.personneId]);
  if (!connus.ok) return connus;
  const personne = valid.data.personneId ? (connus.personnes.get(valid.data.personneId) ?? null) : null;
  const repo = getRepriseDossierRepository();
  return executer(valid.data.ref, () => assignerEtape(repo, valid.data.ref, valid.data.code, personne, c.ctx), "Assignation impossible.");
}

const schemaNoter = z.object({ ref: zRef, code: zCode, note: z.string().trim().max(500) });

/** Note libre sur une étape (vide = effacer). Sur une étape bloquée, c'est le motif. */
export async function noterEtapeAction(ref: string, code: string, note: string): Promise<ActionResultat> {
  const valid = schemaNoter.safeParse({ ref, code, note });
  if (!valid.success) return { ok: false, message: "Note invalide (500 caractères max)." };
  const c = await contexteCourant();
  if (!c.ok) return c;
  const repo = getRepriseDossierRepository();
  return executer(valid.data.ref, () => noterEtape(repo, valid.data.ref, valid.data.code, valid.data.note, c.ctx), "Mise à jour impossible.");
}

const schemaEcheance = z.object({ ref: zRef, code: zCode, echeance: zDateIso });

/** Échéance souhaitée d'une étape (null = effacer). */
export async function fixerEcheanceAction(ref: string, code: string, echeance: string | null): Promise<ActionResultat> {
  const valid = schemaEcheance.safeParse({ ref, code, echeance });
  if (!valid.success) return { ok: false, message: "Date invalide." };
  const c = await contexteCourant();
  if (!c.ok) return c;
  const repo = getRepriseDossierRepository();
  return executer(valid.data.ref, () => fixerEcheance(repo, valid.data.ref, valid.data.code, valid.data.echeance, c.ctx), "Mise à jour impossible.");
}

const schemaAdHoc = z.object({
  ref: zRef,
  phase: zPhase,
  libelle: z.string().trim().min(1).max(300),
  apresCode: zCode.optional(),
  assigneA: zPersonneId.optional(),
  echeance: zDateIso.optional(),
});

/** Ajoute une étape propre à ce dossier (marquée « ajoutée »), après une étape de la phase ou en fin de phase. */
export async function ajouterEtapeAdHocAction(
  ref: string,
  saisie: { phase: string; libelle: string; apresCode?: string; assigneA?: string | null; echeance?: string | null },
): Promise<ActionResultat> {
  const valid = schemaAdHoc.safeParse({ ref, ...saisie });
  if (!valid.success) return { ok: false, message: "Libellé requis (300 caractères max) et phase valide." };
  const c = await contexteCourant();
  if (!c.ok) return c;
  const connus = await validerCollaborateursConnus([valid.data.assigneA]);
  if (!connus.ok) return connus;
  const assigneA = valid.data.assigneA ? connus.personnes.get(valid.data.assigneA) : undefined;
  const repo = getRepriseDossierRepository();
  return executer(
    valid.data.ref,
    () =>
      ajouterEtapeAdHocAuDossier(
        repo,
        valid.data.ref,
        {
          phase: valid.data.phase,
          libelle: valid.data.libelle,
          ...(valid.data.apresCode ? { apresCode: valid.data.apresCode } : {}),
          ...(assigneA ? { assigneA } : {}),
          ...(valid.data.echeance ? { echeance: valid.data.echeance } : {}),
        },
        c.ctx,
      ),
    "Ajout impossible.",
  );
}

/** Supprime une étape ad hoc (jamais une étape canonique : le service refuse). */
export async function supprimerEtapeAdHocAction(ref: string, code: string): Promise<ActionResultat> {
  const valid = z.object({ ref: zRef, code: zCode }).safeParse({ ref, code });
  if (!valid.success) return { ok: false, message: "Paramètres invalides." };
  const c = await contexteCourant();
  if (!c.ok) return c;
  const repo = getRepriseDossierRepository();
  return executer(valid.data.ref, () => supprimerEtapeAdHoc(repo, valid.data.ref, valid.data.code, c.ctx), "Suppression impossible.");
}

const schemaEquipe = z.object({
  ref: zRef,
  equipe: z.object({
    referent: zPersonneId.optional(),
    gestionnaire: zPersonneId.optional(),
    assistant: zPersonneId.optional(),
    comptable: zPersonneId.optional(),
  }),
  forcer: z.boolean().optional(),
});

/**
 * Définit l'équipe du dossier (qui tient chaque rôle) et assigne les étapes du rôle qui n'ont pas
 * encore d'assigné ; `forcer` = écrase aussi les assignations existantes.
 */
export async function definirEquipeAction(
  ref: string,
  equipeIds: Partial<Record<RoleReprise, string | null>>,
  forcer = false,
): Promise<ActionResultat> {
  const valid = schemaEquipe.safeParse({ ref, equipe: equipeIds, forcer });
  if (!valid.success) return { ok: false, message: "Équipe invalide." };
  const c = await contexteCourant();
  if (!c.ok) return c;
  const ids = ROLES_REPRISE.map((r) => valid.data.equipe[r]);
  const connus = await validerCollaborateursConnus(ids);
  if (!connus.ok) return connus;
  const equipe: EquipeReprise = {};
  for (const role of ROLES_REPRISE) {
    const id = valid.data.equipe[role];
    const p = id ? connus.personnes.get(id) : undefined;
    if (p) equipe[role] = p;
  }
  const repo = getRepriseDossierRepository();
  return executer(
    valid.data.ref,
    () => definirEquipe(repo, valid.data.ref, equipe, c.ctx, { forcer: valid.data.forcer ?? false }),
    "Mise à jour de l'équipe impossible.",
  );
}

const schemaCadrage = z.object({
  ref: zRef,
  nomUsuel: z.string().trim().min(1).max(200).optional(),
  adresse: z.string().trim().max(200).optional(),
  sortant: z.string().trim().max(120).optional(),
  dateBascule: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
});

/** Cadrage du dossier : nom, adresse, syndic sortant, date de bascule (chaîne vide = effacer). */
export async function definirCadrageAction(
  ref: string,
  cadrage: { nomUsuel?: string; adresse?: string; sortant?: string; dateBascule?: string },
): Promise<ActionResultat> {
  const valid = schemaCadrage.safeParse({ ref, ...cadrage });
  if (!valid.success) return { ok: false, message: "Cadrage invalide (nom requis, date au format AAAA-MM-JJ)." };
  const c = await contexteCourant();
  if (!c.ok) return c;
  const { ref: r, ...champs } = valid.data;
  const repo = getRepriseDossierRepository();
  return executer(r, () => definirCadrage(repo, r, champs, c.ctx), "Mise à jour impossible.");
}

const schemaNote = z.object({ ref: zRef, texte: z.string().trim().min(1).max(500) });

/** Ajoute une note au journal du dossier (auteur = utilisateur courant, date fabriquée ici). */
export async function ajouterNoteAction(ref: string, texte: string): Promise<ActionResultat> {
  const valid = schemaNote.safeParse({ ref, texte });
  if (!valid.success) return { ok: false, message: "Note requise (500 caractères max)." };
  const c = await contexteCourant();
  if (!c.ok) return c;
  const repo = getRepriseDossierRepository();
  return executer(valid.data.ref, () => ajouterJournal(repo, valid.data.ref, valid.data.texte, c.ctx.dateIso, c.ctx.auteur), "Ajout impossible.");
}

// --- ARCHIVAGE / SUPPRESSION d'un dossier (ADMIN REPRISE) ---------------------

const schemaArchiver = z.object({ ref: zRef, archive: z.boolean() });

/** Archive ou désarchive un dossier (réversible, flag JSONB). Réservé aux ADMINS REPRISE. */
export async function archiverDossierAction(ref: string, archive: boolean): Promise<ActionResultat> {
  const valid = schemaArchiver.safeParse({ ref, archive });
  if (!valid.success) return { ok: false, message: "Paramètres invalides." };

  const garde = await exigerAdminReprise("archiver ce dossier");
  if (!garde.ok) return { ok: false, message: garde.message };

  try {
    await archiverDossier(getRepriseDossierRepository(), valid.data.ref, valid.data.archive, new Date().toISOString());
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Archivage impossible." };
  }
  revalider(valid.data.ref);
  return { ok: true };
}

/**
 * Supprime DÉFINITIVEMENT un dossier de reprise + ses fiches de renseignements liées (hard delete,
 * irréversible). Réservé aux ADMINS REPRISE. Redirige vers la liste. AUCUNE mutation eStale.
 */
export async function supprimerDossierRepriseAction(ref: string): Promise<ActionResultat> {
  const valid = zRef.safeParse(ref);
  if (!valid.success) return { ok: false, message: "Dossier invalide." };

  const garde = await exigerAdminReprise("supprimer ce dossier");
  if (!garde.ok) return { ok: false, message: garde.message };

  try {
    await supprimerDossierEtFiches(getRepriseDossierRepository(), getFicheRenseignementsRepository(), valid.data);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Suppression impossible." };
  }

  revalidatePath("/reprise-copro/dossiers");
  redirect("/reprise-copro/dossiers");
}

// --- FICHES DE RENSEIGNEMENTS (courriers -> formulaire public -> validation) -----
// Étape de FIN de reprise (EX4 / EX6) ; la route publique /fiche/[token] en dépend. Conservé tel quel.

/** Base URL publique du formulaire : env explicite, sinon reconstruite depuis la requête. */
async function baseUrlPublique(): Promise<string> {
  const override = process.env.FICHE_PUBLIC_BASE_URL;
  if (override) return override.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type GenererCourriersResultat =
  | { ok: true; html: string; nbCourriers: number; ignores: number }
  | { ok: false; message: string };

const zGenerer = z.object({
  dossierId: zRef,
  ownerIds: z.array(z.string().trim().min(1).max(80)).max(50_000).optional(),
  relance: z.boolean().optional(),
});

/**
 * Génère le document HTML imprimable des courriers « fiche de renseignements » (une page par
 * copropriétaire, lien + code personnel). Crée/regénère les fiches en base (token + code
 * hachés). Les fiches DÉJÀ soumises/validées ne sont pas regénérées. Le HTML (secrets en clair)
 * n'est renvoyé QU'ICI, jamais relogué ni restocké.
 */
export async function genererCourriersFicheAction(
  dossierId: string,
  options?: { ownerIds?: string[]; relance?: boolean },
): Promise<GenererCourriersResultat> {
  const valid = zGenerer.safeParse({ dossierId, ...options });
  if (!valid.success) return { ok: false, message: "Paramètres invalides." };

  const garde = await exigerAdminReprise("générer les courriers");
  if (!garde.ok) return { ok: false, message: garde.message };
  const g = garde.gestionnaire;

  const dossier = await obtenirDossier(getRepriseDossierRepository(), valid.data.dossierId);
  if (!dossier) return { ok: false, message: "Dossier introuvable." };
  if (!dossier.jeu || dossier.jeu.owners.length === 0) {
    return { ok: false, message: "Aucun copropriétaire connu pour ce dossier : le jeu de données du patrimoine est absent." };
  }

  try {
    const nowISO = new Date().toISOString();
    const r = await genererCourriers(getFicheRenseignementsRepository(), dossier, {
      baseUrl: await baseUrlPublique(),
      nowISO,
      ...(valid.data.ownerIds ? { ownerIds: valid.data.ownerIds } : {}),
      ...(valid.data.relance ? { relance: true } : {}),
    });
    // L'erreur du service (ex. persistance indisponible = table absente) prime sur le
    // message générique : c'est elle qui dit QUOI faire.
    if (r.erreur) return { ok: false, message: r.erreur };
    if (r.courriers.length === 0) {
      return { ok: false, message: `Aucun courrier à générer (${r.ignores} déjà répondu(s)).` };
    }

    const ctx: ContexteCourrier = {
      coproNom: dossier.nomUsuel,
      coproRef: dossier.ref,
      ...(dossier.adresse ? { coproAdresseLigne1: dossier.adresse } : {}),
      retourEmail: g.email ?? "votre gestionnaire REAL31",
      ...(g.email ? { gestionnaireEmail: g.email } : {}),
      expediteur: ["REAL 31", "Syndic de copropriété"],
    };
    const html = genererCourriersDocument(ctx, r.courriers);

    await ajouterJournal(
      getRepriseDossierRepository(),
      valid.data.dossierId,
      valid.data.relance
        ? `Courriers de relance générés pour ${r.courriers.length} copropriétaire(s).`
        : `Courriers « fiche de renseignements » générés pour ${r.courriers.length} copropriétaire(s).`,
      nowISO,
      g.nomComplet,
    );
    revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
    return { ok: true, html, nbCourriers: r.courriers.length, ignores: r.ignores };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant la génération." };
  }
}

export type ValiderFicheResultat =
  | { ok: true; message: string; estaleApplique: boolean; mailEnvoye: boolean; mailNote?: string }
  | { ok: false; message: string };

const zValider = z.object({ dossierId: zRef, ownerId: z.string().trim().min(1).max(80) });

/**
 * Valide la fiche d'UN copropriétaire (jamais en masse) : écrit l'email dans eStale (via le
 * port dédié, dry-run ou réel selon ESTALE_ECRITURE) PUIS envoie le mail « espace client prêt »
 * si le module mail est actif pour ce gestionnaire (MAIL_SOURCE=graph + MAIL_PILOTES). Sinon,
 * note visible « mail non envoyé ». Boîte d'envoi = email de session (jamais un paramètre).
 */
export async function validerFicheAction(dossierId: string, ownerId: string): Promise<ValiderFicheResultat> {
  const valid = zValider.safeParse({ dossierId, ownerId });
  if (!valid.success) return { ok: false, message: "Paramètres invalides." };

  const garde = await exigerAdminReprise("valider cette fiche");
  if (!garde.ok) return { ok: false, message: garde.message };
  const g = garde.gestionnaire;

  const dossier = await obtenirDossier(getRepriseDossierRepository(), valid.data.dossierId);
  if (!dossier) return { ok: false, message: "Dossier introuvable." };

  const mailActif = mailModuleActifPour(g.email) && Boolean(g.email);

  // Callback d'envoi : porte le gate mail. Renvoie envoye=false + note si le module est inactif.
  const envoyerMail = async ({ email, destinataire }: { email: string; destinataire: string }) => {
    if (!mailActif) {
      return { envoye: false, note: "Mail non envoyé : module mail inactif (MAIL_SOURCE / MAIL_PILOTES)." };
    }
    try {
      const sujet = objetMailEspaceClient({ destinataire, coproNom: dossier.nomUsuel, coproRef: dossier.ref });
      const corps = corpsMailEspaceClient({ destinataire, coproNom: dossier.nomUsuel, coproRef: dossier.ref });
      const signatureHtml = (await getSignatureGestionnaire(g)) ?? undefined;
      await envoyerMailReunion({ boite: g.email!, a: [email], cc: [], cci: [], sujet, corps, signatureHtml });
      return { envoye: true };
    } catch (e) {
      return { envoye: false, note: `Mail non envoyé : ${(e as Error).message || "erreur Graph"}.` };
    }
  };

  try {
    const r = await validerFiche(
      getFicheRenseignementsRepository(),
      getEstaleFicheContactProvider(),
      valid.data.ownerId,
      dossier.ref,
      envoyerMail,
      new Date().toISOString(),
    );
    if (!r.ok) return { ok: false, message: r.message };

    await ajouterJournal(
      getRepriseDossierRepository(),
      valid.data.dossierId,
      `Fiche validée (owner ${valid.data.ownerId}) : ${r.estale?.applique ? "email écrit dans ESTALE" : "ESTALE en dry-run"}${r.mailEnvoye ? ", mail espace client envoyé" : ", mail non envoyé"}.`,
      new Date().toISOString(),
      g.nomComplet,
    );
    revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
    return {
      ok: true,
      message: r.message,
      estaleApplique: r.estale?.applique ?? false,
      mailEnvoye: r.mailEnvoye,
      ...(r.mailNote ? { mailNote: r.mailNote } : {}),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant la validation." };
  }
}

export type EnvoyerFicheEmailResultat =
  | { ok: true; message: string; envoye: boolean; note?: string }
  | { ok: false; message: string };

/**
 * BONUS EMAIL : envoie la fiche de renseignements d'un copropriétaire PAR EMAIL (lien + code) au
 * lieu du courrier postal, quand son email est connu dans le jeu. Génère/regénère la fiche (token +
 * code) puis envoie le mail via le gate MAIL_SOURCE/MAIL_PILOTES (comme la validation de fiche).
 * Owner sans email valide -> refus (il reste au courrier). Boîte d'envoi = email de session.
 */
export async function envoyerFicheEmailAction(dossierId: string, ownerId: string): Promise<EnvoyerFicheEmailResultat> {
  const valid = zValider.safeParse({ dossierId, ownerId });
  if (!valid.success) return { ok: false, message: "Paramètres invalides." };

  const garde = await exigerAdminReprise("envoyer la fiche");
  if (!garde.ok) return { ok: false, message: garde.message };
  const g = garde.gestionnaire;

  const dossier = await obtenirDossier(getRepriseDossierRepository(), valid.data.dossierId);
  if (!dossier) return { ok: false, message: "Dossier introuvable." };

  const mailActif = mailModuleActifPour(g.email) && Boolean(g.email);

  // Callback d'envoi : porte le gate mail (comme validerFicheAction). Le corps/objet sont composés
  // par le service (lien + code) ; ici on ne fait que router vers Graph avec la signature du gestionnaire.
  const envoyerMail = async ({
    email,
    sujet,
    corps,
  }: {
    email: string;
    destinataire: string;
    sujet: string;
    corps: string;
  }) => {
    if (!mailActif) {
      return { envoye: false, note: "Mail non envoyé : module mail inactif (MAIL_SOURCE / MAIL_PILOTES)." };
    }
    try {
      const signatureHtml = (await getSignatureGestionnaire(g)) ?? undefined;
      await envoyerMailReunion({ boite: g.email!, a: [email], cc: [], cci: [], sujet, corps, signatureHtml });
      return { envoye: true };
    } catch (e) {
      return { envoye: false, note: `Mail non envoyé : ${(e as Error).message || "erreur Graph"}.` };
    }
  };

  try {
    const r = await envoyerFicheParEmail(
      getFicheRenseignementsRepository(),
      dossier,
      valid.data.ownerId,
      { baseUrl: await baseUrlPublique(), nowISO: new Date().toISOString() },
      envoyerMail,
    );
    if (!r.ok) return { ok: false, message: r.message };

    await ajouterJournal(
      getRepriseDossierRepository(),
      valid.data.dossierId,
      `Fiche envoyée par EMAIL (owner ${valid.data.ownerId})${r.envoye ? "" : " - mail non parti"}.`,
      new Date().toISOString(),
      g.nomComplet,
    );
    revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
    return { ok: true, message: r.message, envoye: r.envoye, ...(r.note ? { note: r.note } : {}) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant l'envoi." };
  }
}
