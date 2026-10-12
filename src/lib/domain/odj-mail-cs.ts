// Le mail qui accompagne l'ODJ du CS (REA-146) : objet et corps, courts et professionnels.
//
// Decision Sekou : un BROUILLON dans Outlook, pas un envoi direct. Le gestionnaire relit,
// ajuste, signe (Signitic s'applique a l'ouverture du brouillon) et envoie lui-meme. Ce
// texte n'est donc qu'un point de depart : il doit etre juste, pas exhaustif.
//
// Domaine PUR : aucune I/O, testable sans Graph.

import type { Odj } from "./odj";

export interface MailOdjCs {
  sujet: string;
  corps: string;
}

/** Objet et corps du mail au conseil syndical. Les dates viennent de l'ODJ tel qu'il est
 *  affiche (la date du CS porte son heure quand la fiche la connait). Une date absente
 *  disparait de la phrase plutot que de laisser un blanc. */
export function mailOdjAuConseil(odj: Pick<Odj, "copro" | "dateAg" | "enTete">): MailOdjCs {
  const dateCs = odj.enTete.find((c) => c.id === "date-cs" && !c.masque)?.valeur?.trim();
  const nom = odj.copro.nom.trim() || odj.copro.code;

  const sujet = `Ordre du jour du conseil syndical${dateCs ? ` du ${dateCs}` : ""} - ${nom}`;

  const reunion = dateCs ? `de la réunion du conseil syndical du ${dateCs}` : "de la prochaine réunion du conseil syndical";
  const ag = odj.dateAg
    ? `, préparatoire à l'assemblée générale du ${odj.dateAg}`
    : ", préparatoire à la prochaine assemblée générale";

  const corps = [
    "Mesdames, Messieurs les membres du conseil syndical,",
    "",
    `Vous trouverez ci-joint l'ordre du jour ${reunion}${ag}.`,
    "",
    "N'hésitez pas à nous faire part de vos remarques ou des points que vous souhaiteriez y voir ajoutés.",
    "",
    "Bien cordialement,",
  ].join("\n");

  return { sujet, corps };
}
