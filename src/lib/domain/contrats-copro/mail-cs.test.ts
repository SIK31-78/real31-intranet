import { describe, expect, it } from "vitest";
import {
  AUCUNE_PROPOSITION,
  composerMailCs,
  destinatairesMailCs,
  devisCite,
  tableauOffres,
  tableauOffresHtml,
  texteVersHtmlMailCs,
  titreModeleCs,
  variablesMailCs,
  variantesPourSujet,
} from "./mail-cs";
import type { ContratCourant, DevisCtq, OffreAssurance, OffreGaz } from "./types";

const NBSP = " ";

const CONTRAT: ContratCourant = {
  coproCode: "S0247",
  assurance: { compagnie: "AXA", numeroContrat: "123", courtier: null, souscriptionISO: null, echeanceISO: "2027-03-01", prime: 4250 },
  gaz: { fournisseur: "ENGIE", typePrix: "fixe", montant: 12345.5, echeanceISO: "2026-12-31" },
  vmc: { societe: null, reference: null, dernierCtqISO: null },
  compteurs: { ascenseurs: 1, chaudieres: 1, vmcGaz: 1 },
  energieChauffage: "GAZ",
  immatriculation: { numero: null, nonApplicable: null },
  devisRetenu: { ctq_ascenseur: null, ctq_vmc: null },
};

const COPRO = { code: "S0247", nom: "LES MARRONNIERS" };

const offreAssurance = (over: Partial<OffreAssurance> = {}): OffreAssurance => ({
  id: "oa1", cycleId: "c1", assureur: "Allianz", prime: 3900, franchise: 500, garanties: "RC + dégâts des eaux", recueLeISO: "2026-05-12", ...over,
});
const offreGaz = (over: Partial<OffreGaz> = {}): OffreGaz => ({
  id: "og1", cycleId: "c2", fournisseur: "TotalEnergies", typePrix: "variable", montant: 11000, dureeMois: 24, recueLeISO: "2026-05-02", ...over,
});
const devis = (over: Partial<DevisCtq> = {}): DevisCtq => ({
  id: "d1", coproCode: "S0247", sujet: "ctq_ascenseur", prestataire: "Bureau Veritas", montant: 850, recueLeISO: "2026-04-01", ...over,
});

describe("titreModeleCs", () => {
  it("rend les titres exacts du seed, assurance et gaz n'ayant qu'un comparatif", () => {
    expect(titreModeleCs("gaz", "comparatif")).toBe("Contrats : comparatif des offres gaz");
    expect(titreModeleCs("gaz", "devis_unique")).toBe("Contrats : comparatif des offres gaz");
    expect(titreModeleCs("assurance", "comparatif")).toBe("Contrats : comparatif des propositions d'assurance");
    expect(titreModeleCs("ctq_ascenseur", "devis_unique")).toBe("Contrats : devis CTQ ascenseur");
    expect(titreModeleCs("ctq_ascenseur", "comparatif")).toBe("Contrats : comparatif des devis CTQ ascenseur");
    expect(titreModeleCs("ctq_vmc", "devis_unique")).toBe("Contrats : devis VMC gaz");
    expect(titreModeleCs("ctq_vmc", "comparatif")).toBe("Contrats : comparatif des devis VMC gaz");
    expect(variantesPourSujet("gaz")).toEqual(["comparatif"]);
    expect(variantesPourSujet("ctq_vmc")).toEqual(["comparatif", "devis_unique"]);
  });
});

describe("variablesMailCs", () => {
  it("rend la copro, le contrat courant formaté (euros, dates) et « - » quand c'est vide", () => {
    const v = variablesMailCs({ sujet: "gaz", copro: COPRO, contrat: CONTRAT });
    expect(v.copro_nom).toBe("LES MARRONNIERS");
    expect(v.copro_code).toBe("S0247");
    expect(v.contrat_actuel_fournisseur).toBe("ENGIE");
    expect(v.contrat_actuel_type_prix).toBe("Fixe");
    expect(v.contrat_actuel_montant).toBe(`12${NBSP}345,5${NBSP}€`);
    expect(v.contrat_actuel_echeance).toBe("31/12/2026");
    expect(v.contrat_actuel_assureur).toBe("AXA");
    expect(v.contrat_actuel_prime).toBe(`4${NBSP}250${NBSP}€`);
    expect(v.devis_prestataire).toBe("-");
    expect(v.devis_montant).toBe("-");
  });

  it("l'échéance suit le sujet : assurance -> échéance d'assurance", () => {
    expect(variablesMailCs({ sujet: "assurance", copro: COPRO, contrat: CONTRAT }).contrat_actuel_echeance).toBe("01/03/2027");
    expect(variablesMailCs({ sujet: "ctq_vmc", copro: COPRO, contrat: CONTRAT }).contrat_actuel_echeance).toBe("-");
  });

  it("un contrat vide rend des tirets, jamais « null » ni « NaN »", () => {
    const vide: ContratCourant = { ...CONTRAT, assurance: { ...CONTRAT.assurance, compagnie: null, prime: null, echeanceISO: null }, gaz: { fournisseur: null, typePrix: null, montant: null, echeanceISO: null } };
    const v = variablesMailCs({ sujet: "gaz", copro: COPRO, contrat: vide });
    expect(Object.values(v).filter((x) => x === "-")).toHaveLength(8);
  });

  it("le devis cité = le retenu, sinon l'unique, sinon rien", () => {
    const d1 = devis();
    const d2 = devis({ id: "d2", prestataire: "Socotec", montant: 920 });
    expect(devisCite([d1, d2], "d2")?.prestataire).toBe("Socotec");
    expect(devisCite([d1, d2], null)).toBeNull();
    expect(devisCite([d1], null)?.prestataire).toBe("Bureau Veritas");
    expect(devisCite([d1, d2], "inconnu")).toBeNull();
    const v = variablesMailCs({ sujet: "ctq_ascenseur", copro: COPRO, contrat: CONTRAT, devis: [d1, d2], devisRetenuId: "d2" });
    expect(v.devis_prestataire).toBe("Socotec");
    expect(v.devis_montant).toBe(`920${NBSP}€`);
  });
});

describe("tableauOffres", () => {
  it("assurance : 5 colonnes, valeurs échappées, bordures inline", () => {
    const html = tableauOffresHtml("assurance", { offresAssurance: [offreAssurance({ assureur: "A&B <Courtage>", garanties: 'dits "tous risques"' })] });
    expect(html).toContain("<th align=\"left\" style=\"border:1px solid #ccc;padding:6px;\">Assureur</th>");
    expect(html).toContain("Prime proposée");
    expect(html).toContain("Franchise");
    expect(html).toContain("Garanties");
    expect(html).toContain("Reçue le");
    expect(html).toContain("A&amp;B &lt;Courtage&gt;");
    expect(html).toContain("dits &quot;tous risques&quot;");
    expect(html).not.toContain("<Courtage>");
    expect(html).toContain("font-family:Arial,sans-serif;font-size:13px");
    expect(html).toContain("12/05/2026");
  });

  it("gaz : la ligne retenue est en gras avec « (retenue) », les supprimées n'apparaissent pas", () => {
    const html = tableauOffresHtml("gaz", {
      offresGaz: [offreGaz(), offreGaz({ id: "og2", fournisseur: "Engie", typePrix: "fixe", montant: 10500 }), offreGaz({ id: "og3", fournisseur: "Fantôme", supprimeeLeISO: "2026-05-03" })],
      offreRetenueId: "og2",
    });
    expect(html).toContain('<tr style="font-weight:bold;background:#eef7f0;"><td style="border:1px solid #ccc;padding:6px;">Engie (retenue)</td>');
    expect(html).toContain("TotalEnergies</td>");
    expect(html).not.toContain("TotalEnergies (retenue)");
    expect(html).not.toContain("Fantôme");
    expect(html).toContain("24 mois");
    expect(html).toContain("Variable");
  });

  it("CTQ : 3 colonnes, filtre sur le sujet, « (retenu) » au masculin", () => {
    const t = tableauOffres("ctq_vmc", {
      devis: [devis({ id: "v1", sujet: "ctq_vmc", prestataire: "Dekra" }), devis({ id: "a1", sujet: "ctq_ascenseur", prestataire: "Pas moi" })],
      devisRetenuId: "v1",
    });
    expect(t.nombre).toBe(1);
    expect(t.html).toContain("Prestataire");
    expect(t.html).toContain("Reçu le");
    expect(t.html).toContain("Dekra (retenu)");
    expect(t.html).not.toContain("Pas moi");
    expect(t.texte).toBe(`- Dekra (retenu) : montant 850${NBSP}€, reçu le 01/04/2026`);
  });

  it("vide -> « Aucune proposition reçue à ce jour. » dans les deux rendus", () => {
    const t = tableauOffres("assurance", {});
    expect(t.nombre).toBe(0);
    expect(t.html).toContain(AUCUNE_PROPOSITION);
    expect(t.html).not.toContain("<table");
    expect(t.texte).toBe(AUCUNE_PROPOSITION);
  });

  it("le rendu texte liste « - Assureur : prime, franchise… »", () => {
    const t = tableauOffres("assurance", { offresAssurance: [offreAssurance()] });
    expect(t.texte).toBe(`- Allianz : prime proposée 3${NBSP}900${NBSP}€, franchise 500${NBSP}€, garanties RC + dégâts des eaux, reçue le 12/05/2026`);
  });
});

describe("composerMailCs", () => {
  const variables = { copro_nom: "LES MARRONNIERS", copro_code: "S0247", contrat_actuel_fournisseur: "ENGIE" };
  const tableau = { html: "<table><tr><td>T</td></tr></table>", texte: "- TotalEnergies : montant 11 000 €" };

  it("substitue les variables, coupe sur le PREMIER {{offres}} et pose le tableau entre les deux morceaux", () => {
    const m = composerMailCs({
      sujetModele: "Renouvellement - {{copro_nom}} ({{copro_code}})",
      corpsModele: "Bonjour,\n\nFournisseur : {{contrat_actuel_fournisseur}}\n\nOffres reçues\n{{offres}}\n\nÀ votre disposition. {{offres}}",
      variables,
      tableau,
    });
    expect(m.objet).toBe("Renouvellement - LES MARRONNIERS (S0247)");
    expect(m.corpsEditable).toContain("{{offres}}");
    expect(m.corpsHtml).toBe(
      '<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">Bonjour,<br>\n<br>\nFournisseur : ENGIE<br>\n<br>\nOffres reçues</div>' +
        tableau.html +
        '<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">À votre disposition.</div>',
    );
    expect(m.corpsTexte).toBe("Bonjour,\n\nFournisseur : ENGIE\n\nOffres reçues\n- TotalEnergies : montant 11 000 €\n\nÀ votre disposition.");
  });

  it("une variable inconnue reste visible entre crochets, jamais un {{…}} résiduel", () => {
    const m = composerMailCs({ sujetModele: "Objet", corpsModele: "Bonjour {{inconnue}}, {{copro_nom}}.", variables, tableau: null });
    expect(m.corpsTexte).toBe("Bonjour [inconnue], LES MARRONNIERS.");
    expect(m.corpsHtml).not.toContain("{{");
  });

  it("sans marqueur (devis unique), pas de tableau parasite ; le texte est échappé en HTML", () => {
    const m = composerMailCs({ sujetModele: "Devis", corpsModele: "Prestataire : A & B <SA>\nMontant : 850 €", variables, tableau });
    expect(m.corpsHtml).toBe('<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">Prestataire : A &amp; B &lt;SA&gt;<br>\nMontant : 850 €</div>');
    expect(m.corpsHtml).not.toContain("<table");
    expect(m.corpsTexte).toBe("Prestataire : A & B <SA>\nMontant : 850 €");
  });

  it("tableau exclu (null) avec un marqueur : le marqueur disparaît", () => {
    expect(texteVersHtmlMailCs("Avant\n{{offres}}\nAprès", null)).toBe('<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt">Avant<br>\n<br>\nAprès</div>');
    const m = composerMailCs({ sujetModele: "Objet {{offres}}", corpsModele: "Avant\n{{offres}}\nAprès", variables, tableau: null });
    expect(m.objet).toBe("Objet");
    expect(m.corpsTexte).toBe("Avant\n\nAprès");
  });
});

describe("destinatairesMailCs", () => {
  it("À = le conseil sans les adresses @real31.fr, dédoublonné ; Cc = la copie du binôme sans ceux déjà en À", () => {
    const d = destinatairesMailCs({
      conseil: ["pres@gmail.com", "PRES@gmail.com", "gestion@real31.fr", " membre@orange.fr ", ""],
      copie: ["gestion@real31.fr", "Membre@orange.fr"],
    });
    expect(d.a).toEqual(["pres@gmail.com", "membre@orange.fr"]);
    expect(d.cc).toEqual(["gestion@real31.fr"]);
  });

  it("sans conseil, À est vide et la copie reste en copie (jamais déplacée en À) ; sans copie, Cc vide", () => {
    const d = destinatairesMailCs({ conseil: [], copie: ["g@real31.fr", "G@real31.fr"] });
    expect(d.a).toEqual([]);
    expect(d.cc).toEqual(["g@real31.fr"]);
    expect(destinatairesMailCs({ conseil: ["pres@gmail.com"] }).cc).toEqual([]);
  });
});
