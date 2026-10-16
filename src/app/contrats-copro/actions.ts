"use server";

// Server Actions du module « Contrats & contrôles » (REA-333) : une action par geste métier,
// sur le patron actionGestionnaire (zod -> session -> corps -> Res). L'auteur vient de la
// session, jamais du client ; le périmètre d'écriture (ADR-041) est vérifié dans les services.
// Les actions du mail au conseil syndical vivent dans actions-mail.ts.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionGestionnaire } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import { SUJETS, TYPES_DOCUMENT, type RattachementDocument } from "@/lib/domain/contrats-copro/types";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { jourParis } from "@/lib/services/date-du-jour";
import { MIME_AUTORISES, TAILLE_MAX_DOCUMENT, MESSAGE_TROP_LOURD, deposerDocument, retirerDocument } from "@/lib/services/contrats-copro/documents";
import { ajouterDevis, ajouterOffreAssurance, ajouterOffreGaz, DUREE_GAZ_MAX_MOIS, retenirDevis, retirerDevis, retirerOffreAssurance, retirerOffreGaz } from "@/lib/services/contrats-copro/offres";
import { cloturerCycle, corrigerContrat, creerAppareil, daterEtape, daterEtapeGroupee, definirEcheance, demarrerSuivi, modifierAppareil } from "@/lib/services/contrats-copro/suivi";
import type { AuteurContrats } from "@/lib/services/contrats-copro/types";

const zId = z.string().min(1).max(80);
const zCode = z.string().trim().min(2).max(20);
const zJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zSujet = z.enum(SUJETS);
const zSujetCtq = z.enum(["ctq_ascenseur", "ctq_vmc"]);
const zMontant = z.number().finite();
const zTexte = (max: number) => z.string().trim().max(max);
const zTexteOuNull = (max: number) => zTexte(max).nullable().optional();

function auteurDepuis(g: Gestionnaire): AuteurContrats {
  return { id: g.id, nom: g.nomComplet, ...(g.email ? { email: g.email } : {}) };
}

function revalider(coproCode: string) {
  revalidatePath(`/copropriete/${coproCode}`);
  revalidatePath("/contrats-copro");
  revalidatePath("/accueil");
}

// --- Suivi -------------------------------------------------------------------------------

const zDaterEtape = z.object({ coproCode: zCode, sujet: zSujet, cycleId: zId, etape: zTexte(60).min(1), dateISO: zJour.nullable() });

export async function daterEtapeAction(input: unknown): Promise<Res<{ cycleId: string }>> {
  return actionGestionnaire(zDaterEtape, input, "contrats-dater-etape", async (d, g) => {
    const cycle = await daterEtape({ ...d, aujourdhuiISO: jourParis() }, auteurDepuis(g));
    revalider(d.coproCode);
    return { cycleId: cycle.id };
  });
}

const zDaterEtapeGroupee = z.object({ coproCode: zCode, etape: zTexte(60).min(1), dateISO: zJour });

export async function daterEtapeGroupeeAction(input: unknown): Promise<Res<{ nombre: number }>> {
  return actionGestionnaire(zDaterEtapeGroupee, input, "contrats-dater-etape-groupee", async (d, g) => {
    const r = await daterEtapeGroupee({ ...d, aujourdhuiISO: jourParis() }, auteurDepuis(g));
    revalider(d.coproCode);
    return { nombre: r.cycles.length };
  });
}

const zDemarrerSuivi = z.object({ coproCode: zCode, sujet: zSujet, cycleId: zId.optional(), ascenseurId: zId.optional(), echeanceISO: zJour.nullable().optional() });

export async function demarrerSuiviAction(input: unknown): Promise<Res<{ cycleId: string }>> {
  return actionGestionnaire(zDemarrerSuivi, input, "contrats-demarrer-suivi", async (d, g) => {
    const cycle = await demarrerSuivi(d, auteurDepuis(g));
    revalider(d.coproCode);
    return { cycleId: cycle.id };
  });
}

const zDefinirEcheance = z.object({ coproCode: zCode, sujet: zSujet, cycleId: zId, echeanceISO: zJour.nullable() });

export async function definirEcheanceAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zDefinirEcheance, input, "contrats-definir-echeance", async (d, g) => {
    await definirEcheance(d, auteurDepuis(g));
    revalider(d.coproCode);
  });
}

const zCloturer = z.object({
  coproCode: zCode,
  sujet: zSujet,
  cycleId: zId,
  dateTerminaleISO: zJour,
  offreRetenueId: zId.nullable().optional(),
  echeanceSaisieISO: zJour.optional(),
  numeroContrat: zTexteOuNull(80),
});

export async function cloturerCycleAction(input: unknown): Promise<Res<{ closId: string; suivantId: string | null }>> {
  return actionGestionnaire(zCloturer, input, "contrats-cloturer", async (d, g) => {
    const r = await cloturerCycle({ ...d, aujourdhuiISO: jourParis() }, auteurDepuis(g));
    revalider(d.coproCode);
    return { closId: r.clos.id, suivantId: r.suivant?.id ?? null };
  });
}

const zCompteur = z.number().int().min(0).max(999).nullable().optional();
const zPatchContrat = z
  .object({
    assurance: z
      .object({
        compagnie: zTexteOuNull(160),
        numeroContrat: zTexteOuNull(80),
        courtier: zTexteOuNull(160),
        souscriptionISO: zJour.nullable().optional(),
        echeanceISO: zJour.nullable().optional(),
        prime: zMontant.min(0).nullable().optional(),
      })
      .optional(),
    gaz: z
      .object({
        fournisseur: zTexteOuNull(160),
        typePrix: z.enum(["variable", "fixe"]).nullable().optional(),
        montant: zMontant.min(0).nullable().optional(),
        echeanceISO: zJour.nullable().optional(),
      })
      .optional(),
    vmc: z.object({ societe: zTexteOuNull(160), reference: zTexteOuNull(80), dernierCtqISO: zJour.nullable().optional() }).optional(),
    compteurs: z.object({ ascenseurs: zCompteur, chaudieres: zCompteur, vmcGaz: zCompteur }).optional(),
    immatriculation: z.object({ numero: zTexteOuNull(40), nonApplicable: z.boolean().nullable().optional() }).optional(),
  })
  .strict();

export async function corrigerContratAction(input: unknown): Promise<Res> {
  return actionGestionnaire(z.object({ coproCode: zCode, patch: zPatchContrat }), input, "contrats-corriger-contrat", async (d, g) => {
    await corrigerContrat(d, auteurDepuis(g));
    revalider(d.coproCode);
  });
}

const zAppareil = z.object({ identifiant: zTexteOuNull(80), dernierCtqISO: zJour.nullable().optional(), notes: zTexteOuNull(1000) });

export async function creerAppareilAction(input: unknown): Promise<Res<{ ascenseurId: string }>> {
  return actionGestionnaire(zAppareil.extend({ coproCode: zCode, ouvrirCycle: z.boolean().optional() }), input, "contrats-creer-appareil", async (d, g) => {
    const a = await creerAppareil(d, auteurDepuis(g));
    revalider(d.coproCode);
    return { ascenseurId: a.id };
  });
}

export async function modifierAppareilAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zAppareil.extend({ coproCode: zCode, ascenseurId: zId }), input, "contrats-modifier-appareil", async (d, g) => {
    await modifierAppareil(d, auteurDepuis(g));
    revalider(d.coproCode);
  });
}

// --- Offres et devis ---------------------------------------------------------------------

const zOffreAssurance = z.object({
  coproCode: zCode,
  cycleId: zId,
  assureur: zTexte(160),
  prime: zMontant,
  franchise: zMontant,
  garanties: zTexteOuNull(2000),
  recueLeISO: zJour.nullable().optional(),
});

export async function ajouterOffreAssuranceAction(input: unknown): Promise<Res<{ offreId: string }>> {
  return actionGestionnaire(zOffreAssurance, input, "contrats-offre-assurance", async (d, g) => {
    const o = await ajouterOffreAssurance(d, auteurDepuis(g));
    revalider(d.coproCode);
    return { offreId: o.id };
  });
}

const zRetirerOffre = z.object({ coproCode: zCode, cycleId: zId, offreId: zId });

export async function retirerOffreAssuranceAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zRetirerOffre, input, "contrats-offre-assurance", async (d, g) => {
    await retirerOffreAssurance(d, auteurDepuis(g));
    revalider(d.coproCode);
  });
}

const zOffreGaz = z.object({
  coproCode: zCode,
  cycleId: zId,
  fournisseur: zTexte(160),
  typePrix: z.enum(["variable", "fixe"]),
  montant: zMontant,
  dureeMois: z.number().int().min(1).max(DUREE_GAZ_MAX_MOIS),
  recueLeISO: zJour.nullable().optional(),
});

export async function ajouterOffreGazAction(input: unknown): Promise<Res<{ offreId: string }>> {
  return actionGestionnaire(zOffreGaz, input, "contrats-offre-gaz", async (d, g) => {
    const o = await ajouterOffreGaz(d, auteurDepuis(g));
    revalider(d.coproCode);
    return { offreId: o.id };
  });
}

export async function retirerOffreGazAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zRetirerOffre, input, "contrats-offre-gaz", async (d, g) => {
    await retirerOffreGaz(d, auteurDepuis(g));
    revalider(d.coproCode);
  });
}

const zDevis = z.object({ coproCode: zCode, sujet: zSujetCtq, prestataire: zTexte(160), montant: zMontant, recueLeISO: zJour.nullable().optional() });

export async function ajouterDevisAction(input: unknown): Promise<Res<{ devisId: string }>> {
  return actionGestionnaire(zDevis, input, "contrats-devis", async (d, g) => {
    const devis = await ajouterDevis(d, auteurDepuis(g));
    revalider(d.coproCode);
    return { devisId: devis.id };
  });
}

export async function retirerDevisAction(input: unknown): Promise<Res> {
  return actionGestionnaire(z.object({ coproCode: zCode, devisId: zId }), input, "contrats-devis", async (d, g) => {
    await retirerDevis(d, auteurDepuis(g));
    revalider(d.coproCode);
  });
}

export async function retenirDevisAction(input: unknown): Promise<Res> {
  return actionGestionnaire(z.object({ coproCode: zCode, sujet: zSujetCtq, devisId: zId.nullable() }), input, "contrats-devis", async (d, g) => {
    await retenirDevis(d, auteurDepuis(g));
    revalider(d.coproCode);
  });
}

// --- Documents ---------------------------------------------------------------------------

const zRattachementType = z.enum(["copro", "cycle_assurance", "offre_assurance", "offre_gaz", "devis_ctq"]);
const zDepotChamps = z.object({
  coproCode: zCode,
  sujet: zSujet,
  typeDocument: z.enum(TYPES_DOCUMENT),
  rattachementType: zRattachementType,
  /** Identifiant de la cible : code copro pour « copro », sinon l'id du cycle, de l'offre, du devis. */
  rattachementId: zId,
});

function rattachementDepuis(type: z.infer<typeof zRattachementType>, id: string): RattachementDocument {
  switch (type) {
    case "copro":
      return { type, coproCode: id };
    case "cycle_assurance":
      return { type, cycleId: id };
    case "offre_assurance":
    case "offre_gaz":
      return { type, offreId: id };
    case "devis_ctq":
      return { type, devisId: id };
  }
}

/**
 * Reçoit un FormData : `fichier` (File) + coproCode, sujet, typeDocument, rattachementType,
 * rattachementId. La taille et le type sont vérifiés ici avant de lire le fichier, puis
 * de nouveau par le service.
 */
export async function deposerDocumentAction(form: FormData): Promise<Res<{ documentId: string; webUrl: string | null }>> {
  const fichier = form.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { ok: false, erreur: "Aucun fichier reçu." };
  if (fichier.size > TAILLE_MAX_DOCUMENT) return { ok: false, erreur: MESSAGE_TROP_LOURD };
  if (!Object.prototype.hasOwnProperty.call(MIME_AUTORISES, fichier.type)) {
    return { ok: false, erreur: "Type de fichier non accepté : PDF, image (JPEG, PNG), Word ou Excel." };
  }
  const champs = {
    coproCode: form.get("coproCode"),
    sujet: form.get("sujet"),
    typeDocument: form.get("typeDocument"),
    rattachementType: form.get("rattachementType"),
    rattachementId: form.get("rattachementId"),
  };
  return actionGestionnaire(zDepotChamps, champs, "contrats-document", async (d, g) => {
    const contenuBase64 = Buffer.from(await fichier.arrayBuffer()).toString("base64");
    const doc = await deposerDocument(
      {
        coproCode: d.coproCode,
        sujet: d.sujet,
        typeDocument: d.typeDocument,
        rattachement: rattachementDepuis(d.rattachementType, d.rattachementId),
        nomFichier: fichier.name,
        mime: fichier.type,
        tailleOctets: fichier.size,
        contenuBase64,
        aujourdhuiISO: jourParis(),
      },
      auteurDepuis(g),
    );
    revalider(d.coproCode);
    return { documentId: doc.id, webUrl: doc.webUrl };
  });
}

export async function retirerDocumentAction(input: unknown): Promise<Res> {
  return actionGestionnaire(z.object({ coproCode: zCode, documentId: zId }), input, "contrats-document", async (d, g) => {
    await retirerDocument(d, auteurDepuis(g));
    revalider(d.coproCode);
  });
}
