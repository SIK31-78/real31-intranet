"use server";

// Server action : editer la liste de diffusion de SECOURS "conseil syndical" d'une copro
// (couche Crypto/intranet). Cette liste reste le FALLBACK ; eStale garde la priorite dans
// la cascade des destinataires du mail CS. Editer ici ne change le mail que si eStale ne
// fournit aucun email de conseil pour la copro.
//
// Garde-fous (calques sur mail-reunion-actions) : (1) zod sur les entrees ; (2) session ;
// (3) anti-IDOR coproAppartient (cloisonnement gestionnaire) ; (4) validation + dedup +
// exclusion des internes @real31.fr via le DOMAINE avant persistance ; (5) revalidatePath.
// PII : aucune adresse n'est journalisee.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getListesDiffusionProvider } from "@/lib/adapters/router";
import { destinatairesListe } from "@/lib/domain/listes-diffusion";

const zCode = z.string().trim().min(1).max(40);
const zEmails = z.array(z.string().trim().max(320)).max(50);

type Result = { ok: true; emails: string[] } | { ok: false; message: string };

export async function enregistrerListeSecoursCSAction(
  coproCode: string,
  emails: string[],
): Promise<Result> {
  const v = z.object({ coproCode: zCode, emails: zEmails }).safeParse({ coproCode, emails });
  if (!v.success) return { ok: false, message: "Données invalides." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de votre périmètre." };
  }

  // Validation / dedup / exclusion des internes REAL31 par le domaine (reutilise la meme
  // logique que le pre-remplissage : RE_EMAIL, @real31.fr exclus, dedup insensible casse).
  const propres = destinatairesListe({ a: v.data.emails, cc: [], cci: [] });

  try {
    await getListesDiffusionProvider().remplacerListeCS(coproCode, propres);
  } catch {
    // Table / colonne absente (schema pas a jour) ou panne : message propre, pas de crash.
    return {
      ok: false,
      message: "Enregistrement impossible pour le moment (liste de diffusion indisponible).",
    };
  }

  revalidatePath(`/copropriete/${coproCode}`);
  return { ok: true, emails: propres };
}
