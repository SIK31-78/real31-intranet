// Service : ENVOIE l'offre au contact de la proposition (mail neuf, action irreversible),
// avec le contrat prospect en PDF en piece jointe, depuis la boite du gestionnaire connecte.
// Puis la proposition est marquee remise (date, cycle, journal). Sekou, 17/09/2026 :
// « outil génération pdf et envoi depuis l'intranet ». Le corps du mail est le texte relu
// dans l'ecran ; sa refonte viendra plus tard.

import "server-only";
import { getMailOutboundProvider } from "@/lib/adapters/router";
import { decouperMailOffre, type OptionsOffre } from "@/lib/domain/proposition/offre";
import type { Proposition } from "@/lib/domain/proposition/proposition";
import { nomFichierContrat, pdfContrat } from "@/lib/services/contrat/pdf-contrat";
import { marquerOffreRemise, preparerOffre } from "./propositions";

export interface EnvoiOffre {
  /** L'adresse a laquelle l'offre est partie. */
  a: string;
  /** Le nom de la piece jointe. */
  pieceJointe: string;
  proposition: Proposition;
}

export async function envoyerOffre(
  id: string,
  options: OptionsOffre,
  texteMail: string,
  expediteur: { nom: string; email: string },
): Promise<EnvoiOffre> {
  const offre = await preparerOffre(id, options, { nom: expediteur.nom });
  const email = offre.proposition.contact.email?.trim();
  if (!email) throw new Error("Le contact de la proposition n'a pas d'adresse e-mail : complétez la fiche avant d'envoyer.");
  if (!offre.champs) throw new Error(offre.erreurContrat ?? `Il manque encore : ${offre.obstacles.join(", ")}.`);

  const pdf = await pdfContrat(offre.champs);
  const pieceJointe = nomFichierContrat(offre.champs);
  const { sujet, corps } = decouperMailOffre(texteMail);
  await getMailOutboundProvider().envoyerNeuf({
    boite: expediteur.email,
    a: [email],
    // Copie a l'expediteur : la trace dans sa boite, comme pour le recap AG.
    cc: [expediteur.email],
    cci: [],
    sujet,
    corps,
    piecesJointes: [{ nom: pieceJointe, contentType: "application/pdf", base64: pdf.toString("base64") }],
  });
  const proposition = await marquerOffreRemise(id, options, expediteur.nom, `envoyée par mail à ${email} avec ${pieceJointe}`);
  return { a: email, pieceJointe, proposition };
}
