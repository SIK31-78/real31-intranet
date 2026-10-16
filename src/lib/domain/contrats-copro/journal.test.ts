import { describe, expect, it } from "vitest";
import { texteJournal } from "./journal";
import type { EntreeJournalContrats, TypeJournal } from "./types";

const NBSP = " ";

function entree(type: TypeJournal, details: Record<string, unknown>, over: Partial<EntreeJournalContrats> = {}): EntreeJournalContrats {
  return { id: "j1", coproCode: "S0247", sujet: "assurance", cycleId: "c1", type, horodatageISO: "2026-03-12T10:00:00Z", parUserId: "u1", parNom: "Mathilde A.", details, ...over };
}

describe("texteJournal", () => {
  it("étapes : libellé traduit depuis la clé, dates en jj/mm/aaaa", () => {
    expect(texteJournal(entree("etape_datee", { etape: "offres_demandees", dateISO: "2026-03-12" }))).toBe("Étape « Offres demandées » datée du 12/03/2026");
    expect(texteJournal(entree("etape_datee", { etape: "offres_demandees", dateISO: "2026-03-12", ancienneDateISO: "2026-03-10" }))).toBe("Étape « Offres demandées » datée du 12/03/2026 (au lieu du 10/03/2026)");
    expect(texteJournal(entree("etape_effacee", { etape: "devis_recu", ancienneDateISO: "2026-03-10" }, { sujet: "ctq_vmc" }))).toBe("Étape « Devis reçu » dé-cochée (était datée du 10/03/2026)");
    expect(texteJournal(entree("etape_datee", { etape: "Offres reçues", dateISO: "2026-03-12" }))).toBe("Étape « Offres reçues » datée du 12/03/2026");
  });

  it("offres et devis : montants « 4 250 € »", () => {
    expect(texteJournal(entree("offre_retenue", { fournisseur: "AXA", montant: 4250 }))).toBe(`Offre retenue : AXA, 4${NBSP}250${NBSP}€`);
    expect(texteJournal(entree("offre_creee", { fournisseur: "Engie", montant: 12480.5 }))).toBe(`Offre saisie : Engie, 12${NBSP}480,5${NBSP}€`);
    expect(texteJournal(entree("offre_retiree", { fournisseur: "Engie", montant: "9000" }))).toBe(`Offre retirée : Engie, 9${NBSP}000${NBSP}€`);
    expect(texteJournal(entree("devis_cree", { prestataire: "Socotec", montant: 890 }))).toBe(`Devis saisi : Socotec, 890${NBSP}€`);
    expect(texteJournal(entree("devis_retenu", { prestataire: "Socotec" }))).toBe("Devis retenu : Socotec");
    expect(texteJournal(entree("devis_retire", { prestataire: "Socotec", montant: 890 }))).toBe(`Devis retiré : Socotec, 890${NBSP}€`);
  });

  it("cycle clos et re-clôture", () => {
    expect(texteJournal(entree("cycle_clos", { dateTerminaleISO: "2026-05-10", echeanceSuivanteISO: "2027-03-01", offre: "AXA" }))).toBe("Cycle clos le 10/05/2026, offre retenue : AXA ; prochaine échéance le 01/03/2027");
    expect(texteJournal(entree("cycle_recloture", { dateTerminaleISO: "2026-05-12", echeanceSuivanteISO: "2031-05-12" }))).toBe("Clôture corrigée le 12/05/2026 ; prochaine échéance le 12/05/2031");
  });

  it("documents, corrections, appareils", () => {
    expect(texteJournal(entree("document_depose", { nom: "CP AXA 2026", typeDocument: "conditions_particulieres" }))).toBe("Document « CP AXA 2026 » déposé (Conditions particulières)");
    expect(texteJournal(entree("document_retire", { nom: "CP AXA 2026" }))).toBe("Document « CP AXA 2026 » retiré");
    expect(texteJournal(entree("contrat_corrige", { champ: "Fournisseur de gaz", avant: "Engie", apres: "TotalEnergies" }))).toBe("Contrat courant : Fournisseur de gaz corrigé de « Engie » en « TotalEnergies »");
    expect(texteJournal(entree("contrat_corrige", { champ: "Numéro de contrat", avant: null, apres: "123" }))).toBe("Contrat courant : Numéro de contrat renseigné : « 123 »");
    expect(texteJournal(entree("appareil_cree", { identifiant: "ASC-12" }))).toBe("Appareil créé : ASC-12");
    expect(texteJournal(entree("appareil_modifie", { champ: "Dernier CTQ", avant: "2019-01-01", apres: "2021-06-01" }))).toBe("Appareil : Dernier CTQ corrigé de « 2019-01-01 » en « 2021-06-01 »");
  });

  it("mails, rappels, archivage, immeuble, prestataires", () => {
    expect(texteJournal(entree("mail_cs_envoye", { objet: "Comparatif assurance", a: ["cs@ex.fr"], cc: ["gest@real31.fr"] }))).toBe("Mail envoyé au conseil syndical : « Comparatif assurance » (à cs@ex.fr ; copie gest@real31.fr)");
    expect(texteJournal(entree("rappel_envoye", { a: ["gest@real31.fr"], niveau: "rouge" }))).toBe("Rappel d'échéance envoyé (niveau rouge) (à gest@real31.fr)");
    expect(texteJournal(entree("suivi_demarre", {}))).toBe("Suivi démarré");
    expect(texteJournal(entree("suivi_archive", { raison: "courtier partenaire Areas" }))).toBe("Suivi archivé : courtier partenaire Areas");
    expect(texteJournal(entree("immeuble_modifie", { champs: ["chauffage", "ventilation"] }))).toBe("Fiche immeuble modifiée : chauffage, ventilation");
    expect(texteJournal(entree("prestataire_lie", { entreprise: "OTIS", metier: "ascensoriste" }))).toBe("OTIS rattachée comme ascensoriste");
    expect(texteJournal(entree("prestataire_delie", { entreprise: "OTIS", metier: "ascensoriste" }))).toBe("OTIS détachée (ascensoriste)");
  });

  it("des détails absents dégradent la phrase sans la casser", () => {
    expect(texteJournal(entree("etape_datee", {}))).toBe("Étape «  » datée");
    expect(texteJournal(entree("offre_creee", {}))).toBe("Offre saisie : sans nom");
    expect(texteJournal(entree("cycle_clos", {}))).toBe("Cycle clos");
    expect(texteJournal(entree("document_depose", {}))).toBe("Document « sans nom » déposé");
  });
});
