"use server";

// « E-mails » : envoyer en un clic un mail de la boîte partagée, rangé chez le binôme, dans le
// dossier « Comptabilité » de la MÊME boîte (demande de Sekou, 28/10/2026). Toute boîte triée
// (syndic2, syndic4…), rien en dur : la boîte est celle du mail. Fichier à part de actions.ts,
// comme la bascule, pour se tester sans tirer tout l'écran.
//
// Garde : la même que « Pas pour moi » (boitePartageeDe) : boîte partagée que la personne voit,
// mail distribué à l'un de ses binômes (super-admin exempté). Le service refuse un mail qui
// n'est pas dans un dossier de binôme (déjà en Comptabilité, par exemple).

import { z } from "zod";
import { echec, echecDepuis, type Res } from "@/lib/actions/resultat";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { oublierCompteurEmails } from "@/lib/services/mes-emails/compteur-emails";
import { envoyerEnComptabilite } from "@/lib/services/tri-emails/reaffecter";
import { boitePartageeDe } from "./gardes-boites";

const zEntree = z.object({ emailId: z.string().trim().min(1).max(600), boite: z.string().trim().min(1).max(320) });

export async function envoyerEnComptabiliteAction(emailId: string, boite: string): Promise<Res<{ dossierNom: string; simulation: boolean }>> {
  const v = zEntree.safeParse({ emailId, boite });
  if (!v.success) return echec("Données invalides.");
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  const partagee = await boitePartageeDe(g, v.data.boite, v.data.emailId);
  if (!partagee) return echec("Seul un mail de la boîte partagée distribué à ton binôme peut partir en Comptabilité.");
  try {
    const r = await envoyerEnComptabilite(partagee, v.data.emailId, g.email ?? g.id);
    // Le mail quitte mes mails à traiter : la pastille de la barre latérale suit.
    oublierCompteurEmails(g.id);
    return { ok: true, donnees: { dossierNom: r.dossierNom, simulation: r.simulation } };
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}
