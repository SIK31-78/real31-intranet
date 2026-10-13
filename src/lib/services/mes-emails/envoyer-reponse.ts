// Service : ENVOIE la reponse au mail (vrai envoi, action irreversible) avec les
// destinataires choisis. Passe par le routeur (ADR-001) ; l'envoi reel n'a lieu qu'en
// MAIL_SOURCE=graph (sinon no-op). Le cloisonnement est verifie dans la server action.
//
// DEUX CHEMINS, imposes par Graph (2026-08-23) :
//   - on repond DEPUIS la boite qui detient le mail -> `createReply` : Graph conserve
//     le fil et la citation, et les PJ d'origine peuvent etre re-jointes ;
//   - on repond depuis une AUTRE boite (ex. sa boite perso sur un mail syndic2) ->
//     `createReply` est impossible (il s'execute dans la boite du message et c'est elle
//     qui expedie). On envoie alors un mail NEUF depuis la boite choisie : le fil est
//     rompu et les PJ ne suivent pas. Le service le DIT (filConserve) au lieu de
//     degrader en silence.

import { getMailOutboundProvider } from "@/lib/adapters/router";

export interface ResultatEnvoi {
  /** false = mail neuf (fil d'origine rompu, PJ non re-jointes). */
  filConserve: boolean;
}

export async function envoyerReponseMail(p: {
  /** Boite qui DETIENT le mail d'origine. */
  boiteMessage: string;
  /** Boite qui EXPEDIE (le "De :" choisi). */
  boiteEnvoi: string;
  internetMessageId: string;
  corps: string;
  sujet?: string;
  a: string[];
  cc: string[];
  cci: string[];
  signatureHtml?: string;
  pjIds?: string[];
}): Promise<ResultatEnvoi> {
  const sortant = getMailOutboundProvider();

  if (p.boiteEnvoi === p.boiteMessage) {
    await sortant.envoyer({
      boite: p.boiteMessage,
      internetMessageId: p.internetMessageId,
      corps: p.corps,
      ...(p.sujet !== undefined ? { sujet: p.sujet } : {}),
      a: p.a,
      cc: p.cc,
      cci: p.cci,
      ...(p.signatureHtml !== undefined ? { signatureHtml: p.signatureHtml } : {}),
      ...(p.pjIds !== undefined ? { pjIds: p.pjIds } : {}),
    });
    return { filConserve: true };
  }

  await sortant.envoyerNeuf({
    boite: p.boiteEnvoi,
    a: p.a,
    cc: p.cc,
    cci: p.cci,
    sujet: p.sujet ?? "",
    corps: p.corps,
    ...(p.signatureHtml !== undefined ? { signatureHtml: p.signatureHtml } : {}),
  });
  return { filConserve: false };
}
