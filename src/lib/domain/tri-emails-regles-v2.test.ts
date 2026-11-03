import { describe, expect, it } from "vitest";
import {
  COPROS_JUMELLES,
  basculeAutomatique,
  choixJumelle,
  coprosDansPdf,
  objetPourLaComptabilite,
  pisteRangeable,
  proposerAutreAgence,
  publiciteProbable,
  rangeableAutomatiquement,
  recollerLettres,
  retirerEnteteCabinet,
  suggererCopro,
  suggestionCorbeille,
  variantesEcriture,
  type CoproTri,
  type Suggestion,
} from "./tri-emails";

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

describe("coprosDansPdf : corrections de lecture (03/11/2026)", () => {
  const copros: CoproTri[] = [
    copro("S0210", { adresse: "6 rue Marcel Sembat 78800 HOUILLES" }),
    copro("S0155", { adresse: "27 rue Jean Bonal 92250 LA GARENNE-COLOMBES" }),
    copro("S0219", { adresse: "120 rue Armand Silvestre 92400 COURBEVOIE" }),
    copro("S0190", { nom: "MEDERI9-11", adresse: "9-11 rue Méderic 92250 LA GARENNE-COLOMBES", nomsUsage: ["VILLA MEDERIC"] }),
    copro("S0285", { nom: "MEDERIC57", adresse: "57 rue Médéric 92250 LA GARENNE-COLOMBES", nomsUsage: ["SDC 57 rue Méderic"] }),
    copro("S0272", { adresse: "51 Avenue Foch 92250 LA GARENNE-COLOMBES" }),
    copro("S0135", { adresse: "18 rue de l'Aigle 92250 LA GARENNE-COLOMBES" }),
  ];
  it("une lettre d'écart quand le code postal est cité", () => {
    expect(coprosDansPdf("6 MARCEL SAMBAT 6 RUE MARCEL SAMBAT 78800 HOUILLES Lieu d'intervention", copros)).toEqual(["S0210"]);
    expect(coprosDansPdf("1 27 rue Jean Bonnal 92250 La Garenne-Colombes", copros)).toEqual(["S0155"]);
  });
  it("la rue du cabinet de La Garenne-Colombes est ignorée, pas sa ville (lieu des copros de La Garenne)", () => {
    expect(retirerEnteteCabinet("C/O REAL 31 13 rond point du souvenier Français 92250 La Garenne-Colombes")).not.toMatch(/souven|rond/i);
    // Rejeu du 03/11/2026 : retirer aussi la ville perdait ce PDF (le lieu de la copro est celui du cabinet).
    expect(coprosDansPdf("COPRO 9 A 11 RUE MEDERIC\nREP PAR REAL 31\n13 ROND POINT DU SOUVENIR\nFRANCAIS\n92250 LA GARENNE COLOMBES", copros)).toEqual(["S0190"]);
    expect(coprosDansPdf("SDC 120 RUE ARMAND SILVESTRE 92400 COURBEVOIE C/O REAL 31 13 rond point du souvenir Français 92250 La Garenne-Colombes", copros)).toEqual(["S0219"]);
  });
  it("un nom d'usage fait d'un terme de résidence et d'une rue partagée, cité tel quel", () => {
    expect(coprosDansPdf("SDC VILLA MEDERIC C/o REAL 31 13, Rond point du Souvenir Français 92250 LA GARENNE COLOMBES", copros)).toEqual(["S0190"]);
    // « Médéric » seul n'en dit rien : deux copros sur cette rue.
    expect(coprosDansPdf("Intervention rue Médéric", copros)).toEqual([]);
  });
  it("les majuscules détachées par l'extraction sont recollées", () => {
    expect(recollerLettres("51 A venue F och 92250 La Ga renne - C olombes")).toBe("51 Avenue Foch 92250 La Ga renne - Colombes");
    expect(coprosDansPdf("Adresse de livraison 51 A venue F och 92250 La Ga renne - C olombes", copros)).toEqual(["S0272"]);
    expect(coprosDansPdf("Concerne 18 rue de l’ A igle 92250 LA GARENNE - COLOMBES", copros)).toEqual(["S0135"]);
  });
});

describe("proposerAutreAgence (R3, proposition seulement)", () => {
  const ici = { copros: [copro("S0297", { adresse: "3 rue des Lilas 92250 La Garenne-Colombes" })], expediteurs: {} };
  const ailleurs = {
    copros: [
      copro("S0178", { nom: "LES ROSIERS", adresse: "125 rue Louise Michel 78500 SARTROUVILLE", agence: "HLS" }),
      copro("S0261", { adresse: "25 rue des Trembleaux 78500 Sartrouville", agence: "HLS" }),
    ],
    expediteurs: { "proprio@exemple.fr": [{ reference: "S0261", qualite: "copropriétaire" as const }] },
  };
  const mail = (objet: string, o: { deAdresse?: string; corbeille?: "reponse-auto"; interne?: boolean } = {}) => ({ deAdresse: o.deAdresse ?? "x@exemple.fr", objet, apercu: "", ...o });
  const proposer = (m: ReturnType<typeof mail>) => proposerAutreAgence(suggererCopro(m, ici), m, ailleurs);

  it("une seule copro d'une autre agence : proposée, jamais rangeable", () => {
    const s = proposer(mail("SDC LES ROSIERS FACTURE CONTRAT"));
    expect(s).toMatchObject({ nature: "aucune", candidats: [], autreAgence: { reference: "S0178", agence: "HLS" } });
    expect(s.raison).toContain("autre agence (HLS)");
    expect(rangeableAutomatiquement({ suggestion: s }, ctx())).toEqual({ ok: false, motif: "pas-sure" });
    expect(proposer(mail("Infiltration", { deAdresse: "proprio@exemple.fr" })).autreAgence).toEqual({ reference: "S0261", agence: "HLS" });
  });
  it("rien quand la boîte a déjà une piste, pour une corbeille, un collègue, ou rien d'ailleurs", () => {
    expect(proposer(mail("Fuite 3 rue des Lilas La Garenne-Colombes")).autreAgence).toBeUndefined();
    expect(proposer(mail("SDC LES ROSIERS", { corbeille: "reponse-auto" })).autreAgence).toBeUndefined();
    expect(proposer(mail("SDC LES ROSIERS", { interne: true })).autreAgence).toBeUndefined();
    expect(proposer(mail("Bonjour")).autreAgence).toBeUndefined();
  });
});

describe("publiciteProbable (R1c, proposition seulement)", () => {
  const pub = (o: Partial<Parameters<typeof publiciteProbable>[0]> = {}) =>
    publiciteProbable({ deAdresse: "x@10540841.brevosend.com", objet: "Invitation Salon de la Copropriété 2026", corps: "", aPdf: false, connu: false, ...o });
  it("envoi de masse ou lien de désinscription, sans objet métier ni PDF : publicité probable", () => {
    expect(pub()).toBe(true);
    expect(pub({ deAdresse: "contact@salon-exemple.fr", corps: "Si ce message ne s'affiche pas correctement, cliquez ici. Se désinscrire." })).toBe(true);
  });
  it("jamais une facture, un avis métier, un PDF, un expéditeur connu ni un collègue", () => {
    expect(pub({ objet: "Votre facture d'électricité" })).toBe(false);
    expect(pub({ objet: "Votre AG a bien été importée" })).toBe(false);
    expect(pub({ aPdf: true })).toBe(false);
    expect(pub({ connu: true })).toBe(false);
    expect(pub({ deAdresse: "collegue@real31.fr" })).toBe(false);
    expect(pub({ deAdresse: "contact@artisan-exemple.fr", corps: "Bonjour, voici notre passage de mardi." })).toBe(false);
  });
  it("proposée à la corbeille, jamais rangée seule", () => {
    expect(suggestionCorbeille("publicite-probable").raison).toContain("publicité probable");
    expect(rangeableAutomatiquement({ corbeille: "publicite-probable", suggestion: suggestionCorbeille("publicite-probable") }, ctx())).toEqual({ ok: false, motif: "corbeille" });
  });
});

describe("bascule automatique vers l'autre agence, piste vraiment sûre (03/11/2026)", () => {
  const ici = { copros: [copro("S0297", { adresse: "3 rue des Lilas 92250 La Garenne-Colombes" })], expediteurs: {} };
  const ailleurs = {
    copros: [
      copro("S0178", { nom: "LES ROSIERS", adresse: "125 rue Louise Michel 78500 SARTROUVILLE", agence: "HLS" }),
      copro("S0261", { nom: "CLOS MARTIN", adresse: "25 rue des Trembleaux 78500 Sartrouville", agence: "HLS" }),
    ],
    expediteurs: { "proprio@exemple.fr": [{ reference: "S0261", qualite: "copropriétaire" as const }] },
  };
  const proposer = (objet: string, apercu = "", deAdresse = "x@exemple.fr") => {
    const m = { deAdresse, objet, apercu };
    return proposerAutreAgence(suggererCopro(m, ici), m, ailleurs);
  };
  const auto = (s: Suggestion, o: Partial<{ dejaPasse: boolean; corbeille: "reponse-auto"; interne: boolean; nonRemis: true }> = {}) =>
    basculeAutomatique({ suggestion: s, ...o }, { automatique: true, dejaPasse: o.dejaPasse ?? false });

  it("code exact dans l'objet (hors périmètre de la boîte) : basculée seule ; dans le corps : proposition", () => {
    const s = proposer("S0178 - facture d'entretien");
    expect(s.autreAgence).toEqual({ reference: "S0178", agence: "HLS", sure: true });
    expect(auto(s)).toEqual({ reference: "S0178", agence: "HLS" });
    // Rejeu du 03/11/2026 : « V.REF : S261/… » d'un avocat allait en Comptabilité, pas en bascule.
    const corps = proposer("Facture", "Voir le dossier S0261.");
    expect(corps.autreAgence).toEqual({ reference: "S0261", agence: "HLS" });
    expect(auto(corps)).toBeNull();
  });
  it("nom ET adresse complète : basculée seule ; le nom seul ou l'expéditeur seul : proposition", () => {
    expect(auto(proposer("SDC LES ROSIERS - 125 rue Louise Michel 78500 Sartrouville : contrat"))).toEqual({ reference: "S0178", agence: "HLS" });
    const nomSeul = proposer("SDC LES ROSIERS FACTURE CONTRAT");
    expect(nomSeul.autreAgence).toEqual({ reference: "S0178", agence: "HLS" });
    expect(auto(nomSeul)).toBeNull();
    expect(auto(proposer("Infiltration", "", "proprio@exemple.fr"))).toBeNull();
  });
  it("jamais un mail déjà passé, une corbeille, un collègue, un avis de non-remise, ni sans automatique", () => {
    const s = proposer("S0178 - facture d'entretien");
    expect(auto(s, { dejaPasse: true })).toBeNull();
    expect(auto(s, { corbeille: "reponse-auto" })).toBeNull();
    expect(auto(s, { interne: true })).toBeNull();
    expect(auto(s, { nonRemis: true })).toBeNull();
    expect(basculeAutomatique({ suggestion: s }, { automatique: false, dejaPasse: false })).toBeNull();
  });
  it("une piste dans la boîte elle-même : ni proposition ni bascule", () => {
    expect(proposer("S0178 et 3 rue des Lilas La Garenne-Colombes").autreAgence).toBeUndefined();
  });
});

describe("copros jumelles : la fiche principale, sauf si le mail désigne l'autre (03/11/2026)", () => {
  const ref = {
    copros: [
      copro("S123", { nom: "SARTO34 A", adresse: "34/36 rue Sartoris 92250 LA GARENNE-COLOMBES" }),
      copro("S124", { nom: "SARTO34 B", adresse: "34 rue Sartoris 92250 LA GARENNE-COLOMBES", adressesSecondaires: ["36 r sartoris 92250 LA GARENNE COLOMBES"] }),
      copro("S198", { nom: "LEPLAZZA", adresse: "152 avenue Gabriel Péri 95870 BEZONS" }),
      copro("S204", { nom: "ASLPLAZZA", adresse: "152-154 Avenue Gabriel Péri 95870 BEZONS" }),
      copro("S143", { nom: "ELEGANCE-H", adresse: "20 avenue de Verdun - 6 rue de Sotteville 92250 LA GARENNE-COLOMBES" }),
      copro("S142", { nom: "ELEGANCE-P", adresse: "20 avenue de Verdun - Parkings 92250 LA GARENNE-COLOMBES" }),
      copro("S297", { adresse: "3 rue des Lilas 92250 La Garenne-Colombes" }),
    ],
    expediteurs: {},
  };
  const piste = (objet: string, apercu = "") => suggererCopro({ deAdresse: "x@exemple.fr", objet, apercu }, ref);

  it("hésitation entre les deux fiches : la principale, rangeable", () => {
    const s = piste("Recherche de fuite – 34/36 rue Sartoris 92250 La Garenne-Colombes");
    expect(s).toMatchObject({ nature: "faible", candidats: ["S123"], origine: "jumelle" });
    expect(pisteRangeable(s)).toBe(true);
    expect(piste("Sinistre 152 avenue Gabriel Péri 95870 Bezons").candidats).toEqual(["S198"]);
  });
  it("le mail désigne la secondaire : bâtiment B, ASL, parking, son code", () => {
    expect(piste("Fuite bâtiment B - 34/36 rue Sartoris 92250 La Garenne-Colombes").candidats).toEqual(["S124"]);
    expect(piste("ASL - 152 avenue Gabriel Péri 95870 Bezons : appel de cotisation").candidats).toEqual(["S204"]);
    expect(choixJumelle(["S143", "S142"], "Porte du parking bloquée au 20 avenue de Verdun")?.reference).toBe("S142");
    expect(choixJumelle(["S143", "S142"], "Box n° 12, 20 avenue de Verdun")?.reference).toBe("S142");
    expect(choixJumelle(["S123", "S124"], "Re: S124 · SARTO34 B - devis")?.reference).toBe("S124");
    expect(choixJumelle(["S143", "S142"], "Ascenseur en panne, 20 avenue de Verdun")?.reference).toBe("S143");
  });
  it("jamais hors d'une paire, ni avec une troisième copro", () => {
    expect(choixJumelle(["S123", "S297"], "x")).toBeNull();
    expect(choixJumelle(["S123", "S124", "S297"], "x")).toBeNull();
    expect(choixJumelle(["S123"], "x")).toBeNull();
  });
  it("dans un PDF aussi", () => {
    expect(coprosDansPdf("Lieu d'intervention : 34/36 rue Sartoris 92250 LA GARENNE COLOMBES", ref.copros)).toEqual(["S123"]);
    expect(coprosDansPdf("Bât. B, 34/36 rue Sartoris 92250 LA GARENNE COLOMBES", ref.copros)).toEqual(["S124"]);
  });
  it("les paires se règlent à un seul endroit", () => {
    expect(COPROS_JUMELLES.map((j) => `${j.principale}/${j.secondaire}`)).toEqual(["S123/S124", "S198/S204", "S143/S142"]);
  });
});
