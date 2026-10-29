"use server";

// « E-mails » : faire basculer un mail de boîte partagée vers une AUTRE boîte triée (ADR-050,
// 28/10/2026). Dans « Pas pour moi », choisir une copro d'une autre agence recopie le mail dans
// la boîte de cette agence et l'y range chez le bon binôme ; « Envoyer à syndicN » le dépose
// dans sa réception, pour son tri. Fichier à part de actions.ts (un autre chantier y travaille).
// La cible peut être une boîte « destination seulement » (syndic1 pour ML, "tri":false) : le
// mail arrive dans sa réception, sans rangement (rien n'y est trié par l'intranet).
//
// Garde : la même que « Pas pour moi » (boitePartageeDe de gardes-boites.ts) : la boîte est une boîte
// partagée que la personne voit, et le mail est distribué à l'un de ses binômes (super-admin
// exempté). La boîte cible n'exige aucun accès (point à valider, ADR-050).

import { z } from "zod";
import { echec, echecDepuis, type Res } from "@/lib/actions/resultat";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { boiteTri } from "@/lib/domain/mail-gate";
import { oublierCompteur } from "@/lib/services/tri-emails/compteur";
import { oublierCompteurEmails } from "@/lib/services/mes-emails/compteur-emails";
import {
  basculerMail,
  coprosDesAutresBoites,
  depsBascule,
  destinationsDeBascule,
  type CoproAutreBoite,
  type DestinationBascule,
} from "@/lib/services/tri-emails/basculer";
import { boitePartageeDe, boitesDe } from "./gardes-boites";

const zBoite = z.string().trim().min(1).max(320);
const zId = z.string().trim().min(1).max(600);

/** Où ce mail peut basculer, et les copros de ces boîtes (pour « Pas pour moi »). Vide si fermé. */
export async function destinationsBasculeAction(boite: string): Promise<Res<{ boites: DestinationBascule[]; copros: CoproAutreBoite[] }>> {
  if (!zBoite.safeParse(boite).success) return echec("Données invalides.");
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  const visible = (await boitesDe(g)).find((b) => b.id === boite.trim().toLowerCase() && !b.personnelle);
  if (!visible) return { ok: true, donnees: { boites: [], copros: [] } };
  try {
    const boites = destinationsDeBascule(visible.id);
    return { ok: true, donnees: { boites, copros: boites.length ? await coprosDesAutresBoites(visible.id) : [] } };
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}

/** Recopie le mail dans `cible` (rangé chez le binôme de `reference` si elle est donnée), retire l'original. */
export async function basculerMailAction(
  emailId: string,
  boite: string,
  cible: string,
  reference: string | null,
): Promise<Res<{ boiteCible: string; dossierNom: string | null; rangementRefuse: string | null; cibleTriee: boolean }>> {
  const v = z
    .object({ emailId: zId, boite: zBoite, cible: zBoite, reference: z.string().regex(/^(SE|S)\d{3,4}$/i).nullable() })
    .safeParse({ emailId, boite, cible, reference });
  if (!v.success) return echec("Données invalides.");
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  const source = await boitePartageeDe(g, boite, emailId);
  if (!source) return echec("Seul un mail de la boîte partagée distribué à ton binôme peut changer de boîte.");
  try {
    const r = await basculerMail(
      { internetMessageId: v.data.emailId, copro: v.data.reference?.toUpperCase() ?? null },
      g.email ?? g.id,
      depsBascule(boiteTri(source), v.data.cible),
    );
    oublierCompteur(source);
    oublierCompteur(r.boiteCible);
    // Le mail quitte mon chiffre « À traiter » : la pastille « E-mails » suit (29/10/2026).
    oublierCompteurEmails(g.id);
    return { ok: true, donnees: { boiteCible: r.boiteCible, dossierNom: r.dossierNom, rangementRefuse: r.rangementRefuse, cibleTriee: r.cibleTriee } };
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}
