import { describe, expect, it } from "vitest";
import { objetPourLaComptabilite, pisteRangeable, rangeableAutomatiquement, suggererCopro, type CoproTri, type Suggestion } from "./tri-emails";

// Règles de l'étude du tri v2 (03/11/2026), mesurées sur les 930 lignes du 26/10 au 02/11.
// Données inventées ; objets inspirés des cas réels, anonymisés.

const copro = (reference: string, o: Partial<CoproTri> = {}): CoproTri => ({
  reference,
  nom: `Copro ${reference}`,
  adresse: "",
  gestionnaire: { nomComplet: "Gestionnaire", email: "g@real31.fr" },
  assistant: null,
  ...o,
});
const ctx = (o: Partial<Parameters<typeof rangeableAutomatiquement>[1]> = {}) => ({
  automatique: true,
  dejaPasse: false,
  copros: [copro("S0297"), copro("S0305", { inactive: true })],
  initialesParEmail: { "g@real31.fr": "GG", "h@real31.fr": "HH" },
  ...o,
});
const sure = (reference = "S0297"): Suggestion => ({ nature: "sure", candidats: [reference], raison: `Code ${reference} cité dans l'objet.` });
const aucune: Suggestion = { nature: "aucune", candidats: [], raison: "" };

describe("objetPourLaComptabilite (R2b)", () => {
  it("relevés de compteur, virement reçu, règlement des charges", () => {
    for (const objet of [
      "Re: RELANCE demande relevé compteurs",
      "Re: S100 · REPUBLI88b - RELANCE demande relevé compteurs",
      "Relève compteur d'eau appartement A108",
      "Virement à votre crédit",
      "Règlement charges 4 eme trimestre",
      "Règlement des charges du 3e trimestre",
    ]) expect(objetPourLaComptabilite(objet), objet).toBe(true);
  });
  it("pas les objets qui restent au gestionnaire (mesure : 13 faux sur 26 avec eux)", () => {
    for (const objet of [
      "Re: Appels de Fonds disponibles en ligne [REAL 31]",
      "RE: Répartition exercice disponible en ligne [REAL 31]",
      "Re :S177 · DOUCEFOLIE - RIB copropriété",
      "RE: 13564 : SDC COLOMBINE : Demande avis de virement",
      "020347500011 / QUITTANCE AUTOMATIQUE / AVIS D'ECHEANCE",
      "Relevé de facturation de vos commandes",
      "Re: Relevé du compteur électrique du parking",
    ]) expect(objetPourLaComptabilite(objet), objet).toBe(false);
  });
});

describe("rangeableAutomatiquement : Comptabilité par l'objet (R2b)", () => {
  it("range en Comptabilité, étiqueté de la copro de la piste", () => {
    expect(rangeableAutomatiquement({ objet: "Re: RELANCE demande relevé compteurs", suggestion: sure() }, ctx())).toEqual({ ok: true, comptabilite: { copros: ["S0297"] } });
  });
  it("sans copro connue : Comptabilité sans étiquette", () => {
    expect(rangeableAutomatiquement({ objet: "Virement à votre crédit", suggestion: aucune }, ctx())).toEqual({ ok: true, comptabilite: { copros: [] } });
    const plusieurs: Suggestion = { nature: "plusieurs", candidats: ["S0297", "S0305"], raison: "" };
    expect(rangeableAutomatiquement({ objet: "Virement à votre crédit", suggestion: plusieurs }, ctx())).toEqual({ ok: true, comptabilite: { copros: [] } });
  });
  it("jamais un mail déjà passé par le journal, une corbeille, un mail interne ni un avis de non-remise", () => {
    const objet = "Re: RELANCE demande relevé compteurs";
    expect(rangeableAutomatiquement({ objet, suggestion: sure() }, ctx({ dejaPasse: true }))).toEqual({ ok: false, motif: "deja-passe" });
    expect(rangeableAutomatiquement({ objet, corbeille: "reponse-auto", suggestion: aucune }, ctx())).toEqual({ ok: false, motif: "corbeille" });
    expect(rangeableAutomatiquement({ objet, interne: true, suggestion: sure() }, ctx())).toEqual({ ok: false, motif: "interne" });
    expect(rangeableAutomatiquement({ objet: `Non remis : ${objet}`, nonRemis: true, suggestion: sure() }, ctx())).toEqual({ ok: true, reference: "S0297" });
  });
  it("un objet ordinaire suit les règles d'avant", () => {
    expect(rangeableAutomatiquement({ objet: "Fuite au 3e", suggestion: sure() }, ctx())).toEqual({ ok: true, reference: "S0297" });
  });
});

describe("pisteRangeable : indice faible rangé seul (R4)", () => {
  const ref = {
    copros: [
      copro("S0247", { adresse: "12 rue des Lilas 78400 Chatou" }),
      copro("S0305", { adresse: "4 rue du Lavoir 78400 Chatou", inactive: true }),
      copro("S0310", { adresse: "8 rue du Puits 92250 La Garenne-Colombes", gestionnaire: { nomComplet: "Hugo", email: "h@real31.fr" } }),
    ],
    expediteurs: { "ascenseurs@exemple.fr": [{ reference: "S0247", qualite: "fournisseur" as const }] },
  };
  const ctxRef = ctx({ copros: ref.copros });
  const decider = (m: { objet: string; apercu?: string; deAdresse?: string }) =>
    rangeableAutomatiquement({ suggestion: suggererCopro({ deAdresse: m.deAdresse ?? "inconnu@exemple.fr", objet: m.objet, apercu: m.apercu ?? "" }, ref) }, ctxRef);

  it("code dans le corps, sur une seule copro : rangé (7 justes sur 7)", () => {
    const s = suggererCopro({ deAdresse: "x@exemple.fr", objet: "Bonjour", apercu: "Voir le dossier S0247." }, ref);
    expect(s).toMatchObject({ nature: "faible", candidats: ["S0247"], origine: "code-corps" });
    expect(pisteRangeable(s)).toBe(true);
    expect(decider({ objet: "Bonjour", apercu: "Voir le dossier S0247." })).toEqual({ ok: true, reference: "S0247" });
  });
  it("adresse sans ville sur une rue d'une seule ville : rangé (22 justes sur 22)", () => {
    expect(decider({ objet: "Devis 12 rue des Lilas" })).toEqual({ ok: true, reference: "S0247" });
  });
  it("jamais une copro inactive (copros perdues, S182, S113)", () => {
    expect(decider({ objet: "Bonjour", apercu: "Voir le dossier S0305." })).toEqual({ ok: false, motif: "copro-inactive" });
    expect(decider({ objet: "Devis 4 rue du Lavoir" })).toEqual({ ok: false, motif: "copro-inactive" });
  });
  it("jamais le fournisseur seul, ni deux codes dans le corps", () => {
    expect(decider({ deAdresse: "ascenseurs@exemple.fr", objet: "Visite d'entretien" })).toEqual({ ok: false, motif: "pas-sure" });
    expect(decider({ objet: "Bonjour", apercu: "Voir S0247 et S0310." })).toEqual({ ok: false, motif: "pas-sure" });
  });
});
