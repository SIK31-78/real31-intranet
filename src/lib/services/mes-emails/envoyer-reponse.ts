// Service : PREPARE la reponse au mail en brouillon (destinataires choisis, corps, PJ d'origine
// re-jointes) ; les fichiers de l'ordinateur y sont deposes ensuite, puis le brouillon part ou
// reste dans Outlook (envoi en trois temps, REA-421, 27/10/2026). Passe par le routeur
// (ADR-001) ; en dehors de MAIL_SOURCE=graph, tout est simule. Les droits sont dans l'action.
//
// DEUX CHEMINS, imposes par Graph (2026-08-23) :
//   - on repond DEPUIS la boite qui detient le mail -> `createReply` : Graph conserve
//     le fil et la citation, et les PJ d'origine peuvent etre re-jointes ;
//   - on repond depuis une AUTRE boite (ex. sa boite perso sur un mail syndic2) ->
//     `createReply` est impossible (il s'execute dans la boite du message et c'est elle
//     qui expedie). On prepare alors un mail NEUF dans la boite choisie, avec SOUS la
//     signature la citation qu'Outlook aurait mise (REA-302, 15/10/2026 : le destinataire
//     doit voir a quoi on repond). Les PJ d'origine ne suivent pas. Le service le DIT
//     (filConserve, historiqueCite) au lieu de degrader en silence.

import { getMailOutboundProvider } from "@/lib/adapters/router";

export interface BrouillonPrepare {
  /** Boite qui detient le brouillon : c'est elle qui expediera. */
  boite: string;
  draftId: string;
  webLink?: string;
  /** false = mail neuf (fil d'origine rompu, PJ non re-jointes). */
  filConserve: boolean;
  /** Mail neuf : le message d'origine a bien ete cite dessous. */
  historiqueCite?: boolean;
}

export async function preparerReponseMail(p: {
  /** Boite qui DETIENT le mail d'origine. */
  boiteMessage: string;
  /** Boite qui EXPEDIE (le "De :" choisi). Un brouillon « Outlook » se prepare toujours dans
   *  la boite du mail : l'appelant passe alors la meme. */
  boiteEnvoi: string;
  internetMessageId: string;
  corps: string;
  /** Corps mis en forme, nettoyé et habillé (REA-345, pilote). */
  corpsHtml?: string;
  sujet?: string;
  a: string[];
  cc: string[];
  cci: string[];
  signatureHtml?: string;
  pjIds?: string[];
}): Promise<BrouillonPrepare> {
  const sortant = getMailOutboundProvider();

  if (p.boiteEnvoi === p.boiteMessage) {
    const d = await sortant.preparerBrouillonReponse({
      boite: p.boiteMessage,
      internetMessageId: p.internetMessageId,
      corps: p.corps,
      ...(p.corpsHtml ? { corpsHtml: p.corpsHtml } : {}),
      ...(p.sujet !== undefined ? { sujet: p.sujet } : {}),
      a: p.a,
      cc: p.cc,
      cci: p.cci,
      ...(p.signatureHtml !== undefined ? { signatureHtml: p.signatureHtml } : {}),
      ...(p.pjIds !== undefined ? { pjIds: p.pjIds } : {}),
    });
    return { boite: p.boiteMessage, draftId: d.id, ...(d.webLink ? { webLink: d.webLink } : {}), filConserve: true };
  }

  // La citation d'Outlook, lue dans la boite qui detient le mail. Si elle echoue, le mail
  // part quand meme, sans historique : la reponse compte plus que la citation.
  const citation = await sortant
    .citationReponse({ boite: p.boiteMessage, internetMessageId: p.internetMessageId })
    .catch((e: unknown) => {
      console.warn("[envoyer-reponse] citation indisponible :", e instanceof Error ? e.message : e);
      return null;
    });
  const d = await sortant.creerBrouillonNeuf({
    boite: p.boiteEnvoi,
    a: p.a,
    cc: p.cc,
    cci: p.cci,
    sujet: p.sujet || citation?.sujet || "",
    corps: p.corps,
    ...(p.corpsHtml ? { corpsHtml: p.corpsHtml } : {}),
    ...(p.signatureHtml !== undefined ? { signatureHtml: p.signatureHtml } : {}),
    ...(citation?.citationHtml ? { citationHtml: citation.citationHtml } : {}),
  });
  if (!d.id) throw new Error("Brouillon de reponse : Graph n'a pas rendu son identifiant.");
  return {
    boite: p.boiteEnvoi,
    draftId: d.id,
    ...(d.webLink ? { webLink: d.webLink } : {}),
    filConserve: false,
    historiqueCite: Boolean(citation?.citationHtml),
  };
}
