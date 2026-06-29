"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getDossierRepository } from "@/lib/adapters/router";
import {
  MODELES_ETAPES,
  STATUT_DOSSIER_LABEL,
  type EtapeDossier,
  type EtapeModele,
  type PorteeDossier,
  type StatutDossier,
  type TypeDossier,
} from "@/lib/domain/dossier";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

// Cloisonne : n'agit que sur une copro du perimetre du gestionnaire.
async function autorise(coproCode: string): Promise<Gestionnaire | null> {
  const g = await getGestionnaireCourant();
  if (!g) return null;
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) return null;
  return g;
}

function nouvelleEtape(m: EtapeModele): EtapeDossier {
  return {
    id: Math.random().toString(36).slice(2, 10),
    label: m.label,
    fait: false,
    ...(m.assigneA ? { assigneA: m.assigneA } : {}),
  };
}

export async function creerDossierAction(form: {
  coproCode: string;
  type: TypeDossier;
  portee: PorteeDossier;
  cible?: string;
  titre: string;
  modele: boolean;
}): Promise<void> {
  const g = await autorise(form.coproCode);
  if (!g) return;
  const etapes = form.modele ? MODELES_ETAPES[form.type].map(nouvelleEtape) : [];
  const id = await getDossierRepository().creer({
    coproCode: form.coproCode,
    type: form.type,
    portee: form.portee,
    ...(form.cible ? { cible: form.cible } : {}),
    titre: form.titre,
    etapes,
    journal: [{ le: new Date().toISOString(), par: g.initiales, texte: "Dossier ouvert", kind: "statut" }],
    ouvertPar: g.initiales,
  });
  revalidatePath("/dossiers");
  redirect(`/dossiers/${id}`);
}

// Reporte la synthèse de l'assistant sinistre dans le JOURNAL du dossier (incrément 2,
// ancrage option C). NON DESTRUCTIF : ajoute une note, ne touche ni aux étapes ni au
// reste. Réservé aux dossiers de type "sinistre". Cloisonné au périmètre.
export async function reporterSyntheseSinistreAction(dossierId: string, texte: string): Promise<void> {
  const valeur = texte.trim();
  if (!valeur) return;
  const d = await getDossierRepository().get(dossierId);
  if (!d || d.type !== "sinistre") return;
  const g = await autorise(d.coproCode);
  if (!g) return;
  const journal = [
    ...d.journal,
    { le: new Date().toISOString(), par: g.initiales, texte: valeur, kind: "note" as const },
  ];
  await getDossierRepository().patch(dossierId, { journal });
  revalidatePath(`/dossiers/${dossierId}`);
}

export async function majEtapesAction(id: string, etapes: EtapeDossier[]): Promise<void> {
  const d = await getDossierRepository().get(id);
  if (!d || !(await autorise(d.coproCode))) return;
  await getDossierRepository().patch(id, { etapes });
  revalidatePath(`/dossiers/${id}`);
}

export async function ajouterNoteAction(id: string, texte: string): Promise<void> {
  const valeur = texte.trim();
  if (!valeur) return;
  const d = await getDossierRepository().get(id);
  if (!d) return;
  const g = await autorise(d.coproCode);
  if (!g) return;
  const journal = [...d.journal, { le: new Date().toISOString(), par: g.initiales, texte: valeur, kind: "note" as const }];
  await getDossierRepository().patch(id, { journal });
  revalidatePath(`/dossiers/${id}`);
}

// Supprime UNE note du journal, et seulement si elle appartient a l'utilisateur courant
// (kind "note" + memes initiales). Un assistant ne peut donc pas effacer la note d'un
// gestionnaire, et inversement. Verifie cote serveur (jamais de confiance au client).
export async function supprimerNoteAction(id: string, le: string): Promise<void> {
  const d = await getDossierRepository().get(id);
  if (!d) return;
  const g = await autorise(d.coproCode);
  if (!g) return;
  let retire = false;
  const journal = d.journal.filter((e) => {
    if (!retire && e.kind === "note" && e.le === le && e.par === g.initiales) {
      retire = true;
      return false; // on retire cette entree (la premiere qui matche)
    }
    return true;
  });
  if (!retire) return; // pas ma note (ou introuvable) -> no-op
  await getDossierRepository().patch(id, { journal });
  revalidatePath(`/dossiers/${id}`);
}

// Rattache (ou met a jour) le dossier a une AG + une resolution (C5). Champs vides
// = effacer le rattachement (null). Cloisonne au perimetre.
export async function rattacherAgAction(
  id: string,
  agDate: string,
  numeroResolution: string,
): Promise<void> {
  const d = await getDossierRepository().get(id);
  if (!d) return;
  const g = await autorise(d.coproCode);
  if (!g) return;
  await getDossierRepository().patch(id, {
    agDate: agDate.trim() || null,
    numeroResolution: numeroResolution.trim() || null,
  });
  revalidatePath(`/dossiers/${id}`);
}

export async function changerStatutAction(id: string, statut: StatutDossier): Promise<void> {
  const d = await getDossierRepository().get(id);
  if (!d) return;
  const g = await autorise(d.coproCode);
  if (!g) return;
  const journal = [
    ...d.journal,
    { le: new Date().toISOString(), par: g.initiales, texte: `Statut : ${STATUT_DOSSIER_LABEL[statut]}`, kind: "statut" as const },
  ];
  await getDossierRepository().patch(id, { statut, journal });
  revalidatePath(`/dossiers/${id}`);
  revalidatePath("/dossiers");
}
