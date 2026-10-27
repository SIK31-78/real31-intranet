"use server";

// Server Actions du tri des e-mails (ADR-046, increment 2). Plusieurs boites (V2 du
// 27/10/2026) : chaque action recoit la boite affichee (`boite`, validee par zod), puis
// verifie que c'est bien celle de la personne (equipe syndic de l'une de ses agences) ou que
// c'est un super-admin, contre la config MAIL_TRI_BOITES. Les binomes, super-admins
// seulement. L'ecriture reelle dans la boite depend de MAIL_TRI_ECRITURE et de `ecriture`
// dans sa config (routeur) ; sans elles, le rangement est simule et journalise comme tel.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionGestionnaire, Refus } from "@/lib/actions/garde";
import type { Res } from "@/lib/actions/resultat";
import { droitsTri, estSuperAdmin } from "@/lib/auth/roles";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { BOITE_ECHANTILLON, type BoiteTriConfig } from "@/lib/domain/mail-gate";
import { boiteTriAccessible } from "@/lib/services/tri-emails/acces";
import { annulerRangement, depsParDefaut, preciserCopro, rangerMail, supprimerMail } from "@/lib/services/tri-emails/ranger";
import { oublierCompteur } from "@/lib/services/tri-emails/compteur";
import { affecterCopro, ajouterAssistant, definirPrincipal, retirerAssistant } from "@/lib/services/tri-emails/binomes";
import { listerPiecesJointesTri } from "@/lib/services/tri-emails/pieces-jointes";
import { coproDepuisPiecesJointes, type CoproDepuisPj } from "@/lib/services/tri-emails/copro-pieces-jointes";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { historiqueDuMail } from "@/lib/services/mes-emails/historique-mail";

const zTexte = (max: number) => z.string().max(max);
// « pj » : copro proposee par la lecture des pieces jointes (journal du tri, 19/10/2026) ;
// « conversation » : seule piste, un mail du meme fil deja range.
const zNature = z.enum(["sure", "plusieurs", "faible", "hors-estale", "aucune", "pj", "conversation"]);

/** La boite triee affichee : une adresse (ou « echantillon »), reverifiee par gardeTri. */
const zBoite = z.string().trim().min(1).max(320);

const zRanger = z.object({
  boite: zBoite,
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

/** La config de la boite demandee, si la personne a le droit de la trier ; sinon refus. */
async function gardeTri(g: Gestionnaire, boite: string): Promise<BoiteTriConfig> {
  const config = await boiteTriAccessible(g, droitsTri(g), boite);
  if (!config) throw new Refus("Le tri de cette boîte est réservé à l'équipe syndic de son agence.");
  return config;
}

function gardeBinomes(email: string | null | undefined) {
  if (!estSuperAdmin(email)) throw new Refus("Les binômes se règlent avec l'administrateur.");
}

// Ranger, supprimer, annuler, preciser : pas de revalidatePath (27/10/2026). La page est
// force-dynamic et la vue fait router.refresh() apres chaque action : avec les deux, chaque
// clic rendait la page deux fois. Les actions sur les binomes le gardent (l'ecran et
// d'autres pages lisent les binomes).
export async function rangerMailAction(
  input: unknown,
): Promise<Res<{ journalId: string; dossierNom: string; simulation: boolean; etiquetteNonPosee: boolean }>> {
  return actionGestionnaire(zRanger, input, "tri-emails-ranger", async ({ boite, ...d }, g) => {
    const config = await gardeTri(g, boite);
    const r = await rangerMail(d, g.email ?? g.id, depsParDefaut(config));
    oublierCompteur(config.boite);
    return r;
  });
}

const zSupprimer = z.object({
  boite: zBoite,
  messageId: z.string().min(1).max(400),
  internetMessageId: zTexte(400),
  expediteur: zTexte(320),
  objet: zTexte(500),
  suggestion: z.object({ nature: zNature, candidats: z.array(z.string().max(10)).max(20) }).nullable(),
});

export async function supprimerMailAction(
  input: unknown,
): Promise<Res<{ journalId: string; dossierNom: string; simulation: boolean; etiquetteNonPosee: boolean }>> {
  return actionGestionnaire(zSupprimer, input, "tri-emails-supprimer", async ({ boite, ...d }, g) => {
    const config = await gardeTri(g, boite);
    const r = await supprimerMail(d, g.email ?? g.id, depsParDefaut(config));
    oublierCompteur(config.boite);
    return r;
  });
}

export async function annulerRangementAction(input: unknown): Promise<Res> {
  return actionGestionnaire(z.object({ boite: zBoite, journalId: z.string().min(1).max(80) }), input, "tri-emails-annuler", async (d, g) => {
    const config = await gardeTri(g, d.boite);
    // Le service refuse une ligne d'une autre boite (e.boite !== deps.boite).
    await annulerRangement(d.journalId, g.email ?? g.id, depsParDefaut(config));
    oublierCompteur(config.boite);
  });
}

const zEmail = z.string().email().max(320);
const zId = z.string().min(1).max(80);

function binomeAction<S extends z.ZodTypeAny>(schema: S, corps: (d: z.output<S>, par: string) => Promise<void>) {
  return (input: unknown): Promise<Res> =>
    actionGestionnaire(schema, input, "tri-emails-binome", async (d, g) => {
      gardeBinomes(g.email);
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
  return actionGestionnaire(
    z.object({ boite: zBoite, reference: z.string().regex(/^(SE|S)\d{3,4}$/), binomeId: zId.nullable() }),
    input,
    "tri-emails-binome",
    async (d, g) => {
      gardeBinomes(g.email);
      // La copro se cherche dans le referentiel de la boite affichee (ses agences).
      const config = await gardeTri(g, d.boite);
      await affecterCopro(d.reference, d.binomeId, g.email ?? g.id, config.agences);
      revalidatePath("/tri-emails");
    },
  );
}

// --- Pieces jointes : la liste (le contenu passe en flux par /tri-emails/pj, REA-421) ----

const zMessage = z.string().min(1).max(400);

export async function listerPiecesJointesTriAction(input: unknown): Promise<Res<PieceJointeRef[]>> {
  return actionGestionnaire(z.object({ boite: zBoite, internetMessageId: zMessage }), input, "tri-emails-pj", async (d, g) => {
    const config = await gardeTri(g, d.boite);
    return listerPiecesJointesTri(config.boite, d.internetMessageId);
  });
}

export async function coproDepuisPjAction(input: unknown): Promise<Res<CoproDepuisPj | null>> {
  return actionGestionnaire(z.object({ boite: zBoite, internetMessageId: zMessage }), input, "tri-emails-pj-copro", async (d, g) => {
    const config = await gardeTri(g, d.boite);
    return coproDepuisPiecesJointes(config, d.internetMessageId);
  });
}

export async function preciserCoproAction(input: unknown): Promise<Res> {
  return actionGestionnaire(
    z.object({ boite: zBoite, journalId: z.string().min(1).max(80), reference: z.string().regex(/^(SE|S)\d{3,4}$/) }),
    input,
    "tri-emails-preciser",
    async (d, g) => {
      const config = await gardeTri(g, d.boite);
      await preciserCopro(d.journalId, d.reference, depsParDefaut(config));
    },
  );
}

// --- Historique de la conversation (REA-352) -----------------------------------------

/**
 * L'historique cité sous un mail de la file (REA-352, 16/10/2026) : l'aperçu du tri est coupé
 * avant le message cité, on ne savait donc pas à quoi le mail répondait sans ouvrir Outlook.
 * Même service que l'écran E-mails, lu TOUJOURS dans une boîte triée que la personne a le
 * droit de trier (la boîte reçue du client est revérifiée par gardeTri). Chaîne vide = rien
 * de cité.
 */
export async function chargerHistoriqueTriAction(input: unknown): Promise<Res<string>> {
  return actionGestionnaire(z.object({ boite: zBoite, internetMessageId: zMessage }), input, "tri-emails-historique", async (d, g) => {
    const { boite } = await gardeTri(g, d.boite);
    // L'échantillon est fictif : ses mails n'existent dans aucune boîte.
    if (boite === BOITE_ECHANTILLON) return "";
    return historiqueDuMail(boite, d.internetMessageId);
  });
}
