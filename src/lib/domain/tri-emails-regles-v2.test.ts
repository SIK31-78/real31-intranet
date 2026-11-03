import { describe, expect, it } from "vitest";
import { objetPourLaComptabilite, pisteRangeable, rangeableAutomatiquement, suggererCopro, variantesEcriture, type CoproTri, type Suggestion } from "./tri-emails";

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
    // Un collègue n'est jamais envoyé en Comptabilité par l'objet (hors mesure) : avec un code, au binôme (R5).
    expect(rangeableAutomatiquement({ objet, interne: true, suggestion: aucune }, ctx())).toEqual({ ok: false, motif: "interne" });
    expect(rangeableAutomatiquement({ objet, interne: true, suggestion: sure() }, ctx())).toEqual({ ok: true, reference: "S0297" });
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

describe("variantesEcriture (R6)", () => {
  const ref = {
    copros: [
      copro("S0128", { adresse: "15 rue des Moulins 92250 La Garenne-Colombes" }),
      copro("S0146", { adresse: "5 rue Murgers 92250 LA GARENNE-COLOMBES", adressesSecondaires: ["5 r des murgers 92250 La Garenne-Colombes"] }),
      copro("S0272", { adresse: "51 Avenue Foch 92250 LA GARENNE-COLOMBES" }),
      copro("S0285", { adresse: "57 rue Médéric 92250 LA GARENNE-COLOMBES" }),
    ],
    expediteurs: {},
  };
  const piste = (objet: string, apercu = "") => suggererCopro({ deAdresse: "x@exemple.fr", objet, apercu }, ref);

  it("« LGC » vaut La Garenne-Colombes : l'adresse a son lieu", () => {
    expect(variantesEcriture("Chauffage 57 rue mederic LGC", ref.copros)).toBe("Chauffage 57 rue mederic La Garenne-Colombes");
    expect(piste("Fw: 57 Mederic LGC")).toMatchObject({ nature: "faible", candidats: ["S0285"], origine: "nom-adresse" });
    expect(piste("facture 51 Avenue Foch La Garennes Colombes").candidats).toEqual(["S0272"]);
  });
  it("un code collé à la suite est lu comme un code", () => {
    expect(piste("Nos Réf : 464010 Vos Réf : OR/4439079 - S128FUIT")).toMatchObject({ nature: "sure", candidats: ["S0128"] });
    // Pas au milieu d'un mot : « RS0128X » n'est pas un code.
    expect(variantesEcriture("RS0128X", ref.copros)).toBe("RS0128X");
  });
  it("une rue citée sans son type, quand le mot est la rue d'une copro", () => {
    expect(variantesEcriture("5 MURGERS", ref.copros)).toBe("5 rue MURGERS");
    expect(variantesEcriture("facture 51 Foch", ref.copros)).toBe("facture 51 avenue Foch");
    expect(piste("5 MURGERS")).toMatchObject({ candidats: ["S0146"] });
    expect(piste("Fw: R31 9 Mederic lgc", "")).toMatchObject({ candidats: [] });
    // Déjà typée, ou un mot qui n'est pas une rue du référentiel : inchangé.
    expect(variantesEcriture("12 avenue Foch", ref.copros)).toBe("12 avenue Foch");
    expect(variantesEcriture("le 28 octobre", ref.copros)).toBe("le 28 octobre");
  });
});

describe("variantesEcriture : garde-fous (rejeu du 03/11/2026)", () => {
  const ref = {
    copros: [
      copro("S0116", { adresse: "3 rue du 11 Septembre 92250 La Garenne-Colombes" }),
      copro("S0246", { nom: "REPUBLIQ21", adresse: "21 boulevard de la République 92250 La Garenne-Colombes" }),
      copro("S0070", { adresse: "28 bis boulevard de la République 92250 La Garenne-Colombes" }),
    ],
    expediteurs: {},
  };
  it("une date n'est pas une rue", () => {
    expect(variantesEcriture("Suite à l'AG du 11 septembre dernier", ref.copros)).toBe("Suite à l'AG du 11 septembre dernier");
  });
  it("une piste déjà trouvée n'est pas réécrite", () => {
    expect(suggererCopro({ deAdresse: "x@exemple.fr", objet: "SDC 21 REPUBLIQUE FACTURE", apercu: "" }, ref).candidats).toEqual(["S0246"]);
  });
});

describe("rangeableAutomatiquement : mail d'un collègue (R5)", () => {
  it("piste sûre sur une copro : rangé ; sinon refusé « interne »", () => {
    expect(rangeableAutomatiquement({ interne: true, suggestion: sure() }, ctx())).toEqual({ ok: true, reference: "S0297" });
    const faible: Suggestion = { nature: "faible", candidats: ["S0297"], raison: "", origine: "code-corps" };
    expect(rangeableAutomatiquement({ interne: true, suggestion: faible }, ctx())).toEqual({ ok: false, motif: "interne" });
    const conv: Suggestion = { nature: "sure", candidats: ["S0297"], raison: "", origine: "conversation" };
    expect(rangeableAutomatiquement({ interne: true, suggestion: conv }, ctx())).toEqual({ ok: false, motif: "interne" });
    expect(rangeableAutomatiquement({ interne: true, suggestion: { nature: "plusieurs", candidats: ["S0297", "S0305"], raison: "" } }, ctx())).toEqual({ ok: false, motif: "interne" });
  });
});
