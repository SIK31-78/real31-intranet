"use server";

// Server actions du compositeur de mail. Endpoints POST publics -> validation zod + gate
// (gestionnaire résolu côté serveur, module mail actif). Lecture (copros, contacts) et
// création de BROUILLON seulement : jamais d'envoi direct ici.

import { z } from "zod";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { echec, echecDepuis, type Res } from "@/lib/actions/resultat";
import {
  creerBrouillonComposition,
  listerContactsComposition,
  listerCoprosComposition,
  type CoproChoisissable,
  type ResultatBrouillon,
} from "@/lib/services/mes-emails/composer-mail";
import type { ContactCopro } from "@/lib/domain/mes-emails-composition";

const CTX = "mes-emails-composer";

async function autorise(): Promise<boolean> {
  const g = await getGestionnaireCourant();
  return Boolean(g && mailModuleActifPour(g.email));
}

export async function listerCoprosCompositionAction(): Promise<Res<CoproChoisissable[]>> {
  if (!(await autorise())) return echec("Le module e-mails n'est pas disponible.");
  try {
    return { ok: true, donnees: await listerCoprosComposition() };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}

export async function listerContactsCompositionAction(input: unknown): Promise<Res<ContactCopro[]>> {
  if (!(await autorise())) return echec("Le module e-mails n'est pas disponible.");
  const d = z.object({ reference: z.string().min(1).max(20) }).safeParse(input);
  if (!d.success) return echec("Référence de copropriété invalide.");
  try {
    return { ok: true, donnees: await listerContactsComposition(d.data.reference) };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}

export async function creerBrouillonCompositionAction(input: unknown): Promise<Res<ResultatBrouillon>> {
  if (!(await autorise())) return echec("Le module e-mails n'est pas disponible.");
  const d = z
    .object({
      objet: z.string().min(1).max(500),
      corps: z.string().max(20000),
      a: z.array(z.string().email().max(320)).max(200),
      cc: z.array(z.string().email().max(320)).max(200),
    })
    .safeParse(input);
  if (!d.success) return echec("Le mail est incomplet (objet ou destinataires).");
  try {
    return { ok: true, donnees: await creerBrouillonComposition(d.data) };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}
