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
  rechercherDestinataires,
  type CoproChoisissable,
  type DossierComposition,
  type ResultatBrouillon,
} from "@/lib/services/mes-emails/composer-mail";
import { ADRESSE_MAIL, adresseMailValide, type ContactCopro, type DestinataireTrouve } from "@/lib/domain/mes-emails-composition";

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

export async function rechercherDestinatairesAction(input: unknown): Promise<Res<DestinataireTrouve[]>> {
  if (!(await gestionnaire())) return echec(INDISPONIBLE);
  const d = z.object({ texte: z.string().trim().min(3).max(100) }).safeParse(input);
  if (!d.success) return { ok: true, donnees: [] };
  try {
    return { ok: true, donnees: await rechercherDestinataires(d.data.texte) };
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

/**
 * Ce qui bloque, dit précisément : une adresse invalide est nommée (Nicolas a cherché du
 * côté de l'objet et des pièces jointes alors que c'était « mylène.pin@… » en copie, 15/10/2026).
 */
function motifRefus(input: unknown): string {
  const i = (input ?? {}) as { objet?: unknown; a?: unknown; cc?: unknown };
  const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const invalides = [...liste(i.a), ...liste(i.cc)].filter((e) => !adresseMailValide(e));
  if (invalides.length) {
    return `Adresse invalide : ${invalides.map((e) => `« ${e} »`).join(", ")}. Une adresse ne prend ni accent ni espace.`;
  }
  if (!liste(i.a).length) return "Il manque un destinataire.";
  if (typeof i.objet !== "string" || !i.objet.trim()) return "Il manque l'objet du mail.";
  return "Le mail n'a pas pu partir : une pièce jointe dépasse 3 Mo, il y en a plus de 10, ou le message est trop long.";
}

export async function creerBrouillonCompositionAction(input: unknown): Promise<Res<ResultatBrouillon>> {
  const g = await gestionnaire();
  if (!g) return echec(INDISPONIBLE);
  const d = z
    .object({
      objet: z.string().min(1).max(500),
      corps: z.string().max(20000),
      a: z.array(z.string().max(320).regex(ADRESSE_MAIL)).min(1).max(200),
      cc: z.array(z.string().max(320).regex(ADRESSE_MAIL)).max(200),
      dossierId: z.string().min(1).max(80).optional(),
      // Fichiers joints : 3 Mo chacun (envoi simple de Graph), 10 au plus.
      fichiers: z
        .array(z.object({ nom: z.string().trim().min(1).max(255), contentType: z.string().max(200), base64: z.string().max(4_200_000) }))
        .max(10)
        .default([]),
    })
    .safeParse(input);
  if (!d.success) return echec(motifRefus(input));
  try {
    const { objet, corps, a, cc, dossierId, fichiers } = d.data;
    return {
      ok: true,
      donnees: await creerBrouillonComposition(
        { objet, corps, a, cc, ...(dossierId ? { dossierId } : {}), ...(fichiers.length ? { piecesJointes: fichiers } : {}) },
        g,
      ),
    };
  } catch (e) {
    return echecDepuis(e, CTX);
  }
}
