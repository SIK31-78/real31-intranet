"use server";

// Server actions du cockpit "Mes emails" : persistance de ce que le gestionnaire
// fait sur un mail. Chaque action verifie le cloisonnement (la copro du mail
// appartient bien au gestionnaire courant) avant d'ecrire, puis revalide la page.
// L'identite (gid, initiales) vient du serveur, jamais du client.

import { revalidatePath } from "next/cache";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import {
  enregistrerBrouillon,
  enregistrerCopro,
  enregistrerDossier,
  enregistrerEtapes,
  enregistrerLu,
  enregistrerRattachement,
  enregistrerStatut,
  type Cible,
} from "@/lib/services/mes-emails/maj-etat";
import type { Rattachement } from "@/lib/domain/mes-emails";
import { synchroniserMesEmails } from "@/lib/services/mes-emails/synchroniser";
import { creerBrouillonOutlook } from "@/lib/services/mes-emails/creer-brouillon";
import { classerDansCopro, classerDansDossier, listerDossiersBoite } from "@/lib/services/mes-emails/classer";
import type { DossierBoite } from "@/lib/domain/mes-emails";

async function cible(emailId: string, coproCode: string): Promise<Cible | null> {
  const g = await getGestionnaireCourant();
  if (!g) return null;
  // Pas de cloisonnement en mock ; sinon la copro doit appartenir au gestionnaire.
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) {
    return null;
  }
  return { gid: g.id, emailId, coproCode, initiales: g.initiales, ...(g.email ? { email: g.email } : {}) };
}

export async function validerMailAction(
  emailId: string,
  coproCode: string,
  coproNom: string,
  etapes: number[],
  brouillon: string,
): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerStatut(c, "classe", etapes, brouillon);
  // Classer = deplacer le mail dans le sous-dossier copro Outlook (best-effort).
  if (c.email) {
    try {
      const res = await classerDansCopro(c.email, emailId, coproCode, coproNom);
      console.log(`[mes-emails] classement ${emailId} copro ${coproCode} -> ${res.deplace ? res.dossier : "non deplace"}`);
    } catch (e) {
      console.warn("[mes-emails] classement Outlook KO :", (e as Error).message);
    }
  } else {
    console.warn("[mes-emails] pas d'email gestionnaire -> classement Outlook ignore.");
  }
  revalidatePath("/mes-emails");
}

export async function devaliderMailAction(emailId: string, coproCode: string): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerStatut(c, "nouveau", []);
  revalidatePath("/mes-emails");
}

export async function toggleEtapeAction(emailId: string, coproCode: string, etapes: number[]): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerEtapes(c, etapes);
  revalidatePath("/mes-emails");
}

export async function editBrouillonAction(emailId: string, coproCode: string, brouillon: string): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerBrouillon(c, brouillon);
  revalidatePath("/mes-emails");
}

export async function rattachementAction(
  emailId: string,
  coproCode: string,
  rattachement: Rattachement,
): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerRattachement(c, rattachement);
  revalidatePath("/mes-emails");
}

export async function marquerLuAction(emailId: string, coproCode: string): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerLu(c);
}

// Synchronise la boite du gestionnaire connecte : ingestion -> pipeline -> cache du
// triage. L'identite vient du serveur ; en delegue, l'adapter lit la boite du
// connecte (cloisonnement intrinseque).
export async function synchroniserAction(): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) return;
  await synchroniserMesEmails(g);
  revalidatePath("/mes-emails");
}

// Rattache un mail a une copropriete A LA MAIN. Le cloisonnement porte sur la
// copro CHOISIE (elle doit etre dans le portefeuille du gestionnaire).
export async function rattacherCoproAction(
  emailId: string,
  coproCode: string,
  coproNom: string,
): Promise<{ ok: boolean; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Non connecté." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Cette copropriété n'est pas dans ton périmètre." };
  }
  try {
    await enregistrerCopro(
      { gid: g.id, emailId, coproCode, initiales: g.initiales, ...(g.email ? { email: g.email } : {}) },
      coproNom,
    );
    revalidatePath("/mes-emails");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// Liste les vrais dossiers de la boite du gestionnaire connecte (racine + sous-Inbox),
// pour le selecteur de classement du cockpit. Boite = celle du connecte (g.email) ->
// cloisonnement intrinseque. Degrade en liste vide si Graph indisponible.
export async function chargerDossiersAction(): Promise<DossierBoite[]> {
  const g = await getGestionnaireCourant();
  if (!g?.email) return [];
  try {
    return await listerDossiersBoite(g.email);
  } catch (e) {
    console.warn("[mes-emails] liste dossiers Outlook KO :", (e as Error).message);
    return [];
  }
}

// Classe un mail dans un dossier Outlook CHOISI (par son id) et marque le mail traite.
// Bloque si aucun dossier n'est choisi (plus de mail "classe" qui ne part nulle part).
// La destination etant un dossier de la boite du connecte, le cloisonnement est
// intrinseque ; si une copro est associee, on la verifie en defense en profondeur.
// `coproCode` est passe tel quel a l'etat pour NE PAS ecraser le rattachement existant.
export async function classerDansDossierAction(
  emailId: string,
  coproCode: string,
  folderId: string,
  folderNom: string,
  etapes: number[],
  brouillon: string,
): Promise<{ ok: boolean; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Non connecté." };
  if (!folderId) return { ok: false, message: "Choisis un dossier de destination." };
  if (!g.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  if (coproCode && process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de ton périmètre." };
  }
  try {
    const res = await classerDansDossier(g.email, emailId, folderId);
    const c: Cible = { gid: g.id, emailId, coproCode, initiales: g.initiales, email: g.email };
    await enregistrerStatut(c, "classe", etapes, brouillon);
    // Memorise le dossier choisi (reaffichage + presélection au reload).
    await enregistrerDossier(c, folderId, folderNom);
    revalidatePath("/mes-emails");
    return res.deplace ? { ok: true } : { ok: false, message: "Le mail n'a pas pu être déplacé." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// Cree un brouillon de reponse dans la boite Outlook du gestionnaire (Graph
// createReply). Renvoie un resultat pour que le cockpit affiche succes/erreur.
export async function creerBrouillonAction(
  emailId: string,
  coproCode: string,
  corps: string,
): Promise<{ ok: boolean; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Non connecté." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de ton périmètre." };
  }
  try {
    await creerBrouillonOutlook(g, emailId, corps);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
