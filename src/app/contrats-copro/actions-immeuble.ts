"use server";

// Server Actions de la fiche immeuble (registre national des copropriétés) et des bâtiments,
// module « Contrats & contrôles » (REA-333). Patron actionGestionnaire : zod -> session ->
// service -> Res. Le périmètre d'écriture est vérifié dans le service (exigerPerimetre) ;
// ici on traduit l'entrée, on fixe l'année courante et on revalide les écrans.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionGestionnaire } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import {
  ENERGIES_CHAUFFAGE,
  ETIQUETTES_ENERGIE,
  PERIODES_CONSTRUCTION,
  SYSTEMES_CHAUFFAGE,
  SYSTEMES_ECS,
  SYSTEMES_VENTILATION,
  TRI_ETATS,
  TYPES_CHAUFFAGE,
  TYPES_CHAUFFAGE_HERITES,
  TYPES_ECS,
  TYPES_VENTILATION,
  type Batiment,
} from "@/lib/domain/contrats-copro";
import { jourParis } from "@/lib/services/date-du-jour";
import { creerBatiment, modifierBatiment, modifierImmeuble, prefillerBatiments, supprimerBatiment } from "@/lib/services/contrats-copro/immeuble";
import type { AuteurContrats } from "@/lib/services/contrats-copro/types";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

const zCode = z.string().trim().min(1).max(20);
const zId = z.string().min(1).max(80);
const zJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zEntier = z.number().int();
const zTriEtat = z.enum(TRI_ETATS).nullable().optional();

function auteurDe(g: Gestionnaire): AuteurContrats {
  return { id: g.id, nom: g.nomComplet, email: g.email };
}

function anneeCourante(): number {
  return Number(jourParis().slice(0, 4));
}

function revalider(coproCode: string) {
  revalidatePath(`/copropriete/${coproCode}`);
  revalidatePath("/contrats-copro");
}

// --- Fiche immeuble ----------------------------------------------------------------------

const zPatchImmeuble = z.strictObject({
  surfaceM2: z.number().nullable().optional(),
  anneeConstruction: zEntier.nullable().optional(),
  periodeConstruction: z.enum(PERIODES_CONSTRUCTION).nullable().optional(),
  nombreBatiments: zEntier.nullable().optional(),
  // Les deux types hérités restent acceptés pour ne pas casser une fiche qui les porte déjà.
  chauffageType: z.enum([...TYPES_CHAUFFAGE, ...TYPES_CHAUFFAGE_HERITES]).nullable().optional(),
  chauffageEnergie: z.enum(ENERGIES_CHAUFFAGE).nullable().optional(),
  chauffageSysteme: z.enum(SYSTEMES_CHAUFFAGE).nullable().optional(),
  ecsType: z.enum(TYPES_ECS).nullable().optional(),
  ecsSysteme: z.enum(SYSTEMES_ECS).nullable().optional(),
  ecsMemeQueChauffage: z.boolean().nullable().optional(),
  ventilationType: z.enum(TYPES_VENTILATION).nullable().optional(),
  ventilationSysteme: z.enum(SYSTEMES_VENTILATION).nullable().optional(),
  bornesRechargeVE: zTriEtat,
  locauxVelos: zTriEtat,
  dpeCollectifRealise: zTriEtat,
  diagnosticStructureRealise: zTriEtat,
  pptInscritAG: zTriEtat,
  pptVote: zTriEtat,
  pptAdoptionISO: zJour.nullable().optional(),
  primeAssuranceActuelle: z.number().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const zModifierImmeuble = z.strictObject({ coproCode: zCode, patch: zPatchImmeuble });

export async function modifierImmeubleAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zModifierImmeuble, input, "contrats-copro-immeuble", async (d, g) => {
    await modifierImmeuble({ coproCode: d.coproCode, patch: d.patch, anneeCourante: anneeCourante() }, auteurDe(g));
    revalider(d.coproCode);
  });
}

// --- Bâtiments ---------------------------------------------------------------------------

const zSaisieBatiment = {
  nom: z.string().trim().min(1).max(200),
  anneeConstruction: zEntier.nullable().optional(),
  nombreEtages: zEntier.nullable().optional(),
  nombreAscenseurs: zEntier.nullable().optional(),
  etiquetteEnergie: z.enum(ETIQUETTES_ENERGIE).nullable().optional(),
};

const zCreerBatiment = z.strictObject({ coproCode: zCode, ...zSaisieBatiment });

export async function creerBatimentAction(input: unknown): Promise<Res<{ batiment: Batiment }>> {
  return actionGestionnaire(zCreerBatiment, input, "contrats-copro-batiment-creer", async (d, g) => {
    const batiment = await creerBatiment({ ...d, anneeCourante: anneeCourante() }, auteurDe(g));
    revalider(d.coproCode);
    return { batiment };
  });
}

const zModifierBatiment = z.strictObject({ coproCode: zCode, batimentId: zId, ...zSaisieBatiment, nom: zSaisieBatiment.nom.optional() });

export async function modifierBatimentAction(input: unknown): Promise<Res<{ batiment: Batiment }>> {
  return actionGestionnaire(zModifierBatiment, input, "contrats-copro-batiment-modifier", async (d, g) => {
    const batiment = await modifierBatiment({ ...d, anneeCourante: anneeCourante() }, auteurDe(g));
    revalider(d.coproCode);
    return { batiment };
  });
}

const zSupprimerBatiment = z.strictObject({ coproCode: zCode, batimentId: zId });

export async function supprimerBatimentAction(input: unknown): Promise<Res> {
  return actionGestionnaire(zSupprimerBatiment, input, "contrats-copro-batiment-supprimer", async (d, g) => {
    await supprimerBatiment(d, auteurDe(g));
    revalider(d.coproCode);
  });
}

const zPrefiller = z.strictObject({ coproCode: zCode });

export async function prefillerBatimentsAction(input: unknown): Promise<Res<{ crees: number }>> {
  return actionGestionnaire(zPrefiller, input, "contrats-copro-batiments-prefiller", async (d, g) => {
    const crees = await prefillerBatiments(d, auteurDe(g));
    revalider(d.coproCode);
    return { crees: crees.length };
  });
}
