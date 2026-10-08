"use server";

// Server Actions du tri des e-mails (ADR-046, increment 2). Pilote : super-admins
// seulement, comme l'ecran. L'ecriture reelle dans la boite depend de MAIL_TRI_ECRITURE
// (routeur) ; sans elle, le rangement est simule et journalise comme tel.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionGestionnaire, Refus } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import { estSuperAdmin } from "@/lib/auth/session";
import { annulerRangement, preciserCopro, rangerMail } from "@/lib/services/tri-emails/ranger";
import { oublierCompteur } from "@/lib/services/tri-emails/compteur";
import { affecterCopro, ajouterAssistant, definirPrincipal, retirerAssistant } from "@/lib/services/tri-emails/binomes";
import { lirePieceJointeTri, listerPiecesJointesTri } from "@/lib/services/tri-emails/pieces-jointes";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";

const zTexte = (max: number) => z.string().max(max);
const zNature = z.enum(["sure", "plusieurs", "faible", "hors-estale", "aucune"]);

const zRanger = z.object({
  messageId: z.string().min(1).max(400),
  internetMessageId: zTexte(400),
  expediteur: zTexte(320),
  objet: zTexte(500),
  cible: z.discriminatedUnion("type", [
    z.object({ type: z.literal("copro"), reference: z.string().regex(/^(SE|S)\d{3,4}$/) }),
    z.object({
      type: z.literal("dossier"),
      cle: z.string().regex(/^binome:[^\s]{1,320}$/),
      copros: z.array(z.string().regex(/^(SE|S)\d{3,4}$/)).max(20),
    }),
    z.object({ type: z.literal("comptabilite") }),
    z.object({ type: z.literal("divers") }),
  ]),
  suggestion: z.object({ nature: zNature, candidats: z.array(z.string().max(10)).max(20) }).nullable(),
});

function gardePilote(email: string | undefined) {
  if (!estSuperAdmin(email)) throw new Refus("Le tri des e-mails est réservé au pilote pour l'instant.");
}

export async function rangerMailAction(
  input: unknown,
): Promise<Res<{ journalId: string; dossierNom: string; simulation: boolean; etiquetteNonPosee: boolean }>> {
  return actionGestionnaire(zRanger, input, "tri-emails-ranger", async (d, g) => {
    gardePilote(g.email);
    const r = await rangerMail(d, g.email ?? g.id);
    oublierCompteur();
    revalidatePath("/tri-emails");
    return r;
  });
}

export async function annulerRangementAction(input: unknown): Promise<Res> {
  return actionGestionnaire(z.object({ journalId: z.string().min(1).max(80) }), input, "tri-emails-annuler", async (d, g) => {
    gardePilote(g.email);
    await annulerRangement(d.journalId, g.email ?? g.id);
    oublierCompteur();
    revalidatePath("/tri-emails");
  });
}

const zEmail = z.string().email().max(320);
const zId = z.string().min(1).max(80);

function binomeAction<S extends z.ZodTypeAny>(schema: S, corps: (d: z.output<S>, par: string) => Promise<void>) {
  return (input: unknown): Promise<Res> =>
    actionGestionnaire(schema, input, "tri-emails-binome", async (d, g) => {
      gardePilote(g.email);
      await corps(d, g.email ?? g.id);
      revalidatePath("/tri-emails");
    });
}

const zPersonnes = z.object({ gestionnaire: zEmail, assistant: zEmail });

export async function definirPrincipalAction(input: unknown): Promise<Res> {
  return binomeAction(zPersonnes, (d, par) => definirPrincipal(d.gestionnaire, d.assistant, par))(input);
}

export async function ajouterAssistantAction(input: unknown): Promise<Res> {
  return binomeAction(zPersonnes, (d, par) => ajouterAssistant(d.gestionnaire, d.assistant, par))(input);
}

export async function retirerAssistantAction(input: unknown): Promise<Res> {
  return binomeAction(z.object({ binomeId: zId }), (d) => retirerAssistant(d.binomeId))(input);
}

export async function affecterCoproAction(input: unknown): Promise<Res> {
  return binomeAction(
    z.object({ reference: z.string().regex(/^(SE|S)\d{3,4}$/), binomeId: zId.nullable() }),
    (d, par) => affecterCopro(d.reference, d.binomeId, par),
  )(input);
}

// --- Pieces jointes (apercu) --------------------------------------------------------

const zMessage = z.string().min(1).max(400);

export async function listerPiecesJointesTriAction(input: unknown): Promise<Res<PieceJointeRef[]>> {
  return actionGestionnaire(z.object({ internetMessageId: zMessage }), input, "tri-emails-pj", async (d, g) => {
    gardePilote(g.email);
    return listerPiecesJointesTri(d.internetMessageId);
  });
}

export async function lirePieceJointeTriAction(input: unknown): Promise<Res<{ nom: string; type: string; base64: string }>> {
  return actionGestionnaire(
    z.object({ internetMessageId: zMessage, attachmentId: z.string().min(1).max(400) }),
    input,
    "tri-emails-pj",
    async (d, g) => {
      gardePilote(g.email);
      return lirePieceJointeTri(d.internetMessageId, d.attachmentId);
    },
  );
}

export async function preciserCoproAction(input: unknown): Promise<Res> {
  return actionGestionnaire(
    z.object({ journalId: z.string().min(1).max(80), reference: z.string().regex(/^(SE|S)\d{3,4}$/) }),
    input,
    "tri-emails-preciser",
    async (d, g) => {
      gardePilote(g.email);
      await preciserCopro(d.journalId, d.reference);
      revalidatePath("/tri-emails");
    },
  );
}
