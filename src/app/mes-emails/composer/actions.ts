"use server";

// Server actions du compositeur de mail. Endpoints POST publics -> validation zod + gate
// (gestionnaire résolu côté serveur, module mail actif). Lecture (copros, contacts,
// dossiers) et création de BROUILLON seulement : jamais d'envoi direct ici.

import { z } from "zod";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { echec, echecDepuis, type Res } from "@/lib/actions/resultat";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import {
  creerBrouillonComposition,
  listerContactsComposition,
  listerCoprosComposition,
  listerDossiersComposition,
  type CoproChoisissable,
  type DossierComposition,
  type ResultatBrouillon,
} from "@/lib/services/mes-emails/composer-mail";
import type { ContactCopro } from "@/lib/domain/mes-emails-composition";

const CTX = "mes-emails-composer";
const INDISPONIBLE = "Le module e-mails n'est pas disponible.";
// Format strict : la référence finit dans un filtre PostgREST (.or) côté adaptateur.
const zReference = z.string().regex(/^(SE|S)\d{3,4}$/i);

async function gestionnaire(): Promise<Gestionnaire | null> {
  const g = await getGestionnaireCourant();
  return g && mailModuleActifPour(g.email) ? g : null;
}

export async function listerCoprosCompositionAction(): Promise<Res<CoproChoisissable[]>> {
  if (!(await gestionnaire())) return echec(INDISPONIBLE);
  try {
    return { ok: true, donnees: await listerCoprosComposition() };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}

export async function listerContactsCompositionAction(input: unknown): Promise<Res<ContactCopro[]>> {
  if (!(await gestionnaire())) return echec(INDISPONIBLE);
  const d = z.object({ reference: zReference }).safeParse(input);
  if (!d.success) return echec("Référence de copropriété invalide.");
  try {
    return { ok: true, donnees: await listerContactsComposition(d.data.reference) };
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

export async function creerBrouillonCompositionAction(input: unknown): Promise<Res<ResultatBrouillon>> {
  const g = await gestionnaire();
  if (!g) return echec(INDISPONIBLE);
  const d = z
    .object({
      objet: z.string().min(1).max(500),
      corps: z.string().max(20000),
      a: z.array(z.string().email().max(320)).min(1).max(200),
      cc: z.array(z.string().email().max(320)).max(200),
      dossierId: z.string().min(1).max(80).optional(),
    })
    .safeParse(input);
  if (!d.success) return echec("Le mail est incomplet (objet ou destinataires).");
  try {
    const { objet, corps, a, cc, dossierId } = d.data;
    return {
      ok: true,
      donnees: await creerBrouillonComposition({ objet, corps, a, cc, ...(dossierId ? { dossierId } : {}) }, g),
    };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}
