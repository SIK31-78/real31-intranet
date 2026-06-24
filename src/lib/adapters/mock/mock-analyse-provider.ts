// Adapter mock du port d'analyse : classification deterministe par mots-cles +
// plan canne. Permet de tester toute la chaine d'ingestion SANS cle Mistral.

import type { AnalyseMailProvider, MailAClasser } from "@/lib/ports/analyse-mail-provider";
import type { Classification, PlanPropose } from "@/lib/domain/tri-mail/raw-mail";
import type { TypeMail } from "@/lib/domain/mes-emails";
import { resoudreExpediteur } from "@/lib/domain/tri-mail/sender";

const REGLES: { motif: RegExp; type: TypeMail }[] = [
  { motif: /fuite|d[ée]g[aâ]t|infiltration|inondation/i, type: "sinistre_degat_eaux" },
  { motif: /panne|ascenseur|portail|interphone|chauffage|pompe|hors service|ne fonctionne/i, type: "panne_intervention" },
  { motif: /devis/i, type: "devis_validation" },
  { motif: /facture|contrat|r[ée]siliation|bon d'intervention/i, type: "facture_contrat_fournisseur" },
  { motif: /appel de fonds|pr[ée]l[èe]vement|sepa|rib|impay[ée]|charges/i, type: "comptabilite" },
  { motif: /assembl[ée]e|\bag\b|conseil syndical|\bcs\b|convocation|ordre du jour|proc[èe]s-verbal|\bpv\b/i, type: "ag_cs" },
  { motif: /vefa|promoteur|r[ée]serve|parfait ach[èe]vement/i, type: "vefa_reserves" },
];

export class MockAnalyseProvider implements AnalyseMailProvider {
  async classifier(mail: MailAClasser): Promise<Classification> {
    const exp = resoudreExpediteur(mail.de);
    const texte = `${mail.objet} ${mail.corps}`;
    const regle = REGLES.find((r) => r.motif.test(texte));
    const type: TypeMail = regle ? regle.type : exp.type === "interne" ? "non_ticketable" : "demande_copro_cs";
    const ticketable = type !== "non_ticketable";
    return {
      ticketable,
      type,
      est_nouveau_ticket: true,
      confidence: regle ? 0.7 : 0.4,
      rationale: regle ? `mot-cle ${regle.type}` : "classification mock par defaut",
    };
  }

  async genererReponseEtPlan(mail: MailAClasser, affaire: string): Promise<PlanPropose> {
    const exp = resoudreExpediteur(mail.de);
    if (exp.type === "interne") return { reponse: "", etapes: [] };
    return {
      reponse: `Bonjour,\n\nNous accusons reception de votre message concernant "${mail.objet}". Nous traitons votre demande et revenons vers vous rapidement.\n\nBien cordialement,`,
      etapes: [`Qualifier la demande (${affaire})`, "Accuser reception au demandeur", "Planifier l'action et mettre a jour le dossier"],
    };
  }
}
