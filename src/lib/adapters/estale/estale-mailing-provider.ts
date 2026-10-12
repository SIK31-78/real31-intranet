// Adapter ESTALE des mailings aux copropriétaires (REA-144). Crée un BROUILLON et
// s'arrête là : ce fichier n'appelle JAMAIS la mutation d'envoi de MailingMutation
// (ni createMailingExpress, dont le drapeau d'envoi est obligatoire). Un test le vérifie
// sur toutes les requêtes émises. L'envoi se lance dans ESTALE, par le gestionnaire.
//
// Étapes (schéma docs/estale-schema.graphql, Mailing ~7930-8230) :
//   1. condo(id) : establishmentID + copropriétaires actifs (email, canReceiveMail).
//   2. createMailing(establishmentID, title)            -> brouillon vide.
//   3. updateMailing(id).update(category INFORMATIVE)   -> catégorie informative.
//   4. updateMailing(id).updateMail(object, content)    -> objet (coupé à 64 car.) + corps HTML.
//   5. updateMailing(id).upsertRecipientsOwner(ids)     -> destinataires.
//   6. Tout destinataire hors MAIL est passé en MAIL (s'il l'accepte) ou retiré : un
//      courrier postal coûte l'affranchissement et exige un modèle Word qu'on ne fournit pas.
//   7. Relecture : isSent doit être faux, coût annoncé remonté au gestionnaire.
// Si une étape échoue après la création, on tente de supprimer le brouillon incomplet.
// Les mutations ne sont jamais rejouées sur 5xx (politique du client).

import type { BrouillonMailing, MailingCree, MailingEstaleProvider } from "@/lib/ports/mailing-estale-provider";
import { estaleGql } from "./client";
import { resoudreCondoId } from "./condos-accessibles";

/**
 * Longueur maximale de l'objet envoyé à updateMail. Mesuré sur SE999 le 12/10/2026 :
 * ESTALE répond « Oupss une erreur s'est produite » au-delà d'une limite située entre 60
 * (accepté) et 80 caractères (refusé) ; 67 passent. 64 garde une marge sous le seuil connu.
 */
export const OBJET_MAILING_MAX = 64;

/** Coupe l'objet à OBJET_MAILING_MAX sans couper un mot, terminé par « … ». */
export function couperObjet(objet: string, max = OBJET_MAILING_MAX): string {
  const o = objet.trim();
  if (o.length <= max) return o;
  const tranche = o.slice(0, max - 1); // place pour « … »
  const espace = tranche.lastIndexOf(" ");
  const base = espace > 0 ? tranche.slice(0, espace) : tranche;
  return `${base.replace(/[\s,;:.\-–]+$/u, "")}…`;
}

/** Page d'accueil d'ESTALE : repli quand le lien direct du mailing ne peut pas être construit. */
export const URL_ESTALE_APP = "https://estale.app/";

/**
 * Lien direct vers le mailing dans ESTALE. L'URL porte l'identifiant du collaborateur qui
 * l'a créé (le compte ESTALE de l'intranet).
 */
export function lienMailingEstale(collaborateurId: string, mailingId: string): string {
  return `${URL_ESTALE_APP}intranet/collaborator/${collaborateurId}/mailings/${mailingId}`;
}

type OwnerRow = { id: string; email: string | null; canReceiveMail: boolean };
type RecipientRow = { resourceID: string; sendingMode: string; acceptModes: string[] };

export class EstaleMailingProvider implements MailingEstaleProvider {
  async creerBrouillon(b: BrouillonMailing): Promise<MailingCree> {
    const condoId = await resoudreCondoId(b.coproCode);
    if (!condoId) throw new Error(`Copropriété ${b.coproCode} introuvable dans ESTALE.`);

    const { condo } = await estaleGql<{ condo: { establishmentID: string; owners: OwnerRow[] } }>(
      `query CoproprietairesMailing($id: ID!) {
        condo(id: $id) { establishmentID owners(archived: false) { id email canReceiveMail } }
      }`,
      { id: condoId },
    );
    const joignables = condo.owners.filter((o) => o.canReceiveMail && (o.email ?? "").trim() !== "");
    const sansEmail = condo.owners.length - joignables.length;
    if (joignables.length === 0) {
      throw new Error("Aucun copropriétaire de cette copropriété n'a d'adresse e-mail dans ESTALE.");
    }

    const cree = await estaleGql<{ createMailing: { id: string; reference: string } }>(
      `mutation CreerMailing($input: MailingCreateInput!) {
        createMailing(input: $input) { id reference }
      }`,
      { input: { establishmentID: condo.establishmentID, title: b.titre } },
    );
    const id = cree.createMailing.id;

    try {
      await estaleGql(
        `mutation CategorieMailing($id: ID!, $input: MailingUpdateInput!) {
          updateMailing(id: $id) { update(input: $input) { id } }
        }`,
        { id, input: { title: b.titre, category: "INFORMATIVE", preferRentalAgent: false } },
      );
      await estaleGql(
        `mutation CorpsMailing($id: ID!, $input: MailingMailInput!) {
          updateMailing(id: $id) { updateMail(input: $input) { id } }
        }`,
        {
          id,
          input: { object: couperObjet(b.objet), content: b.contenuHtml, ...(b.repondreA ? { replyto: b.repondreA } : {}) },
        },
      );
      const dest = await estaleGql<{ updateMailing: { upsertRecipientsOwner: { recipients: RecipientRow[] } } }>(
        `mutation DestinatairesMailing($id: ID!, $owners: [ID!]!) {
          updateMailing(id: $id) {
            upsertRecipientsOwner(ownerIDs: $owners) { recipients { resourceID sendingMode acceptModes } }
          }
        }`,
        { id, owners: joignables.map((o) => o.id) },
      );

      const horsMail = dest.updateMailing.upsertRecipientsOwner.recipients.filter((r) => r.sendingMode !== "MAIL");
      const aBasculer = horsMail.filter((r) => r.acceptModes.includes("MAIL")).map((r) => r.resourceID);
      const aRetirer = horsMail.filter((r) => !r.acceptModes.includes("MAIL")).map((r) => r.resourceID);
      if (aBasculer.length > 0) {
        await estaleGql(
          `mutation ModeMailMailing($id: ID!, $ids: [ID!]!) {
            updateMailing(id: $id) { updateRecipientsMode(resourceIDs: $ids, mode: MAIL) { mailing { id } } }
          }`,
          { id, ids: aBasculer },
        );
      }
      if (aRetirer.length > 0) {
        await estaleGql(
          `mutation RetirerDestinataires($id: ID!, $ids: [ID!]!) {
            updateMailing(id: $id) { removeRecipients(resourceIDs: $ids) { id } }
          }`,
          { id, ids: aRetirer },
        );
      }

      // Relecture par le namespace du collaborateur (toute la structure) : celui de la
      // copro ne retrouve un mailing que s'il lui est déjà rattaché.
      const relu = await estaleGql<{
        me: {
          collaborator: {
            id: string;
            mailing: {
              item: {
                reference: string;
                title: string;
                isSent: boolean;
                nbRecipients: number;
                channelInfos: { unsentPrice: { total: number } };
              };
            };
          };
        };
      }>(
        `query RelireMailing($id: ID!) {
          me { collaborator {
            id
            mailing { item(id: $id) { reference title isSent nbRecipients channelInfos { unsentPrice { total } } } }
          } }
        }`,
        { id },
      );
      const collaborateurId = relu.me.collaborator.id;
      const m = relu.me.collaborator.mailing.item;
      if (m.isSent) {
        // Ne devrait jamais arriver : aucune mutation d'envoi n'est émise ici.
        throw new Error(`Le mailing ${m.reference} apparaît comme envoyé : à vérifier immédiatement dans ESTALE.`);
      }
      return {
        mailingId: id,
        reference: m.reference,
        titre: m.title,
        destinatairesMail: m.nbRecipients,
        sansEmail: sansEmail + aRetirer.length,
        coutEnvoi: m.channelInfos.unsentPrice.total,
        lien: collaborateurId ? lienMailingEstale(collaborateurId, id) : URL_ESTALE_APP,
      };
    } catch (e) {
      // Brouillon incomplet : on tente de le supprimer pour ne pas laisser un mailing
      // à moitié rempli que quelqu'un pourrait envoyer. Échec silencieux (rien n'est parti).
      await estaleGql(
        `mutation SupprimerBrouillon($id: ID!) { updateMailing(id: $id) { delete { id } } }`,
        { id },
      ).catch(() => undefined);
      throw e;
    }
  }
}
