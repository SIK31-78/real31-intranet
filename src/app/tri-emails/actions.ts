"use server";

// Server Actions du tri des e-mails (ADR-046, increment 2). Pilote : super-admins
// seulement, comme l'ecran. L'ecriture reelle dans la boite depend de MAIL_TRI_ECRITURE
// (routeur) ; sans elle, le rangement est simule et journalise comme tel.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionGestionnaire, Refus } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import { estSuperAdmin } from "@/lib/auth/session";
import { annulerRangement, rangerMail } from "@/lib/services/tri-emails/ranger";
import { definirBinome, retirerBinome } from "@/lib/services/tri-emails/binomes";

const zTexte = (max: number) => z.string().max(max);
const zNature = z.enum(["sure", "plusieurs", "faible", "hors-estale", "aucune"]);

const zRanger = z.object({
  messageId: z.string().min(1).max(400),
  internetMessageId: zTexte(400),
  expediteur: zTexte(320),
  objet: zTexte(500),
  cible: z.discriminatedUnion("type", [
    z.object({ type: z.literal("copro"), reference: z.string().regex(/^(SE|S)\d{3,4}$/) }),
    z.object({ type: z.literal("comptabilite") }),
    z.object({ type: z.literal("divers") }),
  ]),
  suggestion: z.object({ nature: zNature, candidats: z.array(z.string().max(10)).max(20) }).nullable(),
});

function gardePilote(email: string | undefined) {
  if (!estSuperAdmin(email)) throw new Refus("Le tri des e-mails est réservé au pilote pour l'instant.");
}

export async function rangerMailAction(input: unknown): Promise<Res<{ journalId: string; dossierNom: string; simulation: boolean }>> {
  return actionGestionnaire(zRanger, input, "tri-emails-ranger", async (d, g) => {
    gardePilote(g.email);
    const r = await rangerMail(d, g.email ?? g.id);
    revalidatePath("/tri-emails");
    return r;
  });
}

export async function annulerRangementAction(input: unknown): Promise<Res> {
  return actionGestionnaire(z.object({ journalId: z.string().min(1).max(80) }), input, "tri-emails-annuler", async (d, g) => {
    gardePilote(g.email);
    await annulerRangement(d.journalId, g.email ?? g.id);
    revalidatePath("/tri-emails");
  });
}

const zEmail = z.string().email().max(320);

export async function definirBinomeAction(input: unknown): Promise<Res> {
  return actionGestionnaire(
    z.object({ gestionnaire: zEmail, assistant: zEmail }),
    input,
    "tri-emails-binome",
    async (d, g) => {
      gardePilote(g.email);
      await definirBinome(d.gestionnaire, d.assistant, g.email ?? g.id);
      revalidatePath("/tri-emails");
    },
  );
}

export async function retirerBinomeAction(input: unknown): Promise<Res> {
  return actionGestionnaire(z.object({ gestionnaire: zEmail }), input, "tri-emails-binome", async (d, g) => {
    gardePilote(g.email);
    await retirerBinome(d.gestionnaire);
    revalidatePath("/tri-emails");
  });
}
