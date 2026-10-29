import { describe, expect, it } from "vitest";
import {
  attributairesPossibles,
  echeanceAttente,
  echeanceDuChoix,
  etatAttente,
  etatDeFileEnVigueur,
  etatEquipe,
  matinParis,
  membresDuDossier,
  passeLeFiltre,
  peutModifierNote,
  refusAttribution,
  reponseDansFil,
  trierNotes,
  validerTexteNote,
  NOTE_LONGUEUR_MAX,
  type Attente,
  type Attribution,
} from "./boite-equipe";
import type { BinomesTri } from "./tri-emails";

const BOITE = "syndic4@real31.fr";
const binomes: BinomesTri = {
  binomes: [
    { id: "b1", gestionnaireEmail: "emmanuel.lopes@real31.fr", assistant: { nomComplet: "Fanny S.", email: "Fanny.S@real31.fr" }, principal: true },
    { id: "b2", gestionnaireEmail: "emmanuel.lopes@real31.fr", assistant: { nomComplet: "Galiano G.", email: "galiano.g@real31.fr" }, principal: false },
  ],
  parCopro: {},
};

const attribution = (over: Partial<Attribution> = {}): Attribution => ({
  internetMessageId: "<m1@x>",
  boite: BOITE,
  dossierCle: "binome:emmanuel.lopes@real31.fr",
  attributaire: { email: "fanny.s@real31.fr", nomComplet: "Fanny S.", initiales: "FS" },
  parEmail: "fanny.s@real31.fr",
  parInitiales: "FS",
  le: "2026-10-29T08:00:00Z",
  geste: "prendre",
  ...over,
});

const attente = (over: Partial<Attente> = {}): Attente => ({
  internetMessageId: "<m1@x>",
  boite: BOITE,
  nature: "attente",
  jusquAu: "2026-11-02T07:00:00.000Z",
  conversationId: "conv1",
  dossierCle: "binome:emmanuel.lopes@real31.fr",
  depuis: "2026-10-29T09:00:00Z",
  parEmail: "fanny.s@real31.fr",
  parInitiales: "FS",
  poseLe: "2026-10-29T09:00:00Z",
  ...over,
});

describe("qui peut être attributaire", () => {
  it("le binôme principal : le gestionnaire et son assistante", () => {
    expect(membresDuDossier("binome:emmanuel.lopes@real31.fr", binomes)).toEqual(["emmanuel.lopes@real31.fr", "fanny.s@real31.fr"]);
  });

  it("un binôme secondaire, par son id", () => {
    expect(membresDuDossier("binome:b2", binomes)).toEqual(["emmanuel.lopes@real31.fr", "galiano.g@real31.fr"]);
  });

  it("un gestionnaire seul, sans assistant", () => {
    expect(membresDuDossier("binome:Solo@real31.fr", binomes)).toEqual(["solo@real31.fr"]);
  });

  it("hors binôme ou inconnu : personne", () => {
    expect(membresDuDossier("divers", binomes)).toEqual([]);
    expect(membresDuDossier(null, binomes)).toEqual([]);
    expect(membresDuDossier("binome:inconnu", binomes)).toEqual([]);
  });

  it("en Comptabilité : les comptables, pas le binôme", () => {
    expect(attributairesPossibles("comptabilite", binomes, ["Compta1@real31.fr", "compta1@real31.fr", "compta2@real31.fr"])).toEqual([
      "compta1@real31.fr",
      "compta2@real31.fr",
    ]);
    expect(attributairesPossibles("binome:b2", binomes, ["compta1@real31.fr"])).not.toContain("compta1@real31.fr");
  });
});

describe("droit d'attribuer", () => {
  const possibles = ["emmanuel.lopes@real31.fr", "fanny.s@real31.fr"];

  it("on peut toujours prendre un mail qu'on voit", () => {
    expect(refusAttribution({ acteurEmail: "remplacant@real31.fr", cibleEmail: "Remplacant@real31.fr", possibles })).toBeNull();
  });

  it("on confie à un membre de l'équipe du mail", () => {
    expect(refusAttribution({ acteurEmail: "fanny.s@real31.fr", cibleEmail: "EMMANUEL.LOPES@real31.fr", possibles })).toBeNull();
  });

  it("pas à quelqu'un d'une autre équipe, ni à personne", () => {
    expect(refusAttribution({ acteurEmail: "fanny.s@real31.fr", cibleEmail: "autre@real31.fr", possibles })).toMatch(/pas de l'équipe/);
    expect(refusAttribution({ acteurEmail: "fanny.s@real31.fr", cibleEmail: "  ", possibles })).toMatch(/Choisis/);
  });
});

describe("un état de file suit le dossier, pas le mail", () => {
  const courant = { internetMessageId: "<m1@x>", boite: "Syndic4@real31.fr", dossierCle: "binome:emmanuel.lopes@real31.fr" };

  it("même boîte, même dossier : en vigueur", () => {
    expect(etatDeFileEnVigueur(attribution(), courant)).toBe(true);
  });

  it("parti en Comptabilité ou chez un autre binôme : plus en vigueur", () => {
    expect(etatDeFileEnVigueur(attribution(), { ...courant, dossierCle: "comptabilite" })).toBe(false);
    expect(etatDeFileEnVigueur(attribution(), { ...courant, dossierCle: "binome:b2" })).toBe(false);
  });

  it("basculé dans une autre boîte : plus en vigueur", () => {
    expect(etatDeFileEnVigueur(attribution(), { ...courant, boite: "syndic2@real31.fr" })).toBe(false);
  });

  it("dossier inconnu d'un côté : on garde", () => {
    expect(etatDeFileEnVigueur(attribution(), { ...courant, dossierCle: null })).toBe(true);
    expect(etatDeFileEnVigueur(attribution({ dossierCle: null }), courant)).toBe(true);
  });
});

describe("filtres et chiffre", () => {
  it("À moi : les miens seulement ; À traiter (« tous ») : tout", () => {
    expect(passeLeFiltre("a-moi", "Fanny.S@real31.fr", "fanny.s@real31.fr")).toBe(true);
    expect(passeLeFiltre("a-moi", null, "fanny.s@real31.fr")).toBe(false);
    expect(passeLeFiltre("a-moi", "x@real31.fr", "fanny.s@real31.fr")).toBe(false);
    expect(passeLeFiltre("tous", "x@real31.fr", "fanny.s@real31.fr")).toBe(true);
    expect(passeLeFiltre("tous", null, "fanny.s@real31.fr")).toBe(true);
  });
});

describe("notes internes", () => {
  it("texte nettoyé, vide refusé", () => {
    expect(validerTexteNote("  J'ai appelé le président.\r\n\r\n\r\n\r\nIl passe demain.  ")).toEqual({
      ok: true,
      texte: "J'ai appelé le président.\n\nIl passe demain.",
    });
    expect(validerTexteNote("   \n ")).toEqual({ ok: false, erreur: "La note est vide." });
  });

  it("trop longue : refus chiffré", () => {
    const r = validerTexteNote("a".repeat(NOTE_LONGUEUR_MAX + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain(String(NOTE_LONGUEUR_MAX));
  });

  it("seul l'auteur modifie", () => {
    expect(peutModifierNote({ auteurId: "u1" }, "u1")).toBe(true);
    expect(peutModifierNote({ auteurId: "u1" }, "u2")).toBe(false);
    expect(peutModifierNote({ auteurId: "" }, "")).toBe(false);
  });

  it("fil dans l'ordre d'écriture", () => {
    const notes = [
      { id: "b", creeLe: "2026-10-29T10:00:00Z" },
      { id: "a", creeLe: "2026-10-29T09:00:00Z" },
    ];
    expect(trierNotes(notes).map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("en attente : retour dans À traiter", () => {
  const avant = new Date("2026-10-30T09:00:00Z");
  const apres = new Date("2026-11-02T07:00:00Z");

  it("attente : reste dehors avant la date, revient à la date", () => {
    expect(etatAttente(attente(), avant)).toEqual({ statut: "en-attente", motif: null });
    expect(etatAttente(attente(), apres)).toEqual({ statut: "a-traiter", motif: "date" });
  });

  it("attente : une réponse dans le fil la fait revenir tout de suite", () => {
    const recus = [{ internetMessageId: "<m2@x>", conversationId: "conv1", recuLe: "2026-10-30T08:00:00Z" }];
    expect(etatAttente(attente(), avant, recus)).toEqual({ statut: "a-traiter", motif: "reponse" });
  });

  it("ni le mail lui-même, ni un message d'avant la pose, ni un autre fil ne comptent", () => {
    const recus = [
      { internetMessageId: "<m1@x>", conversationId: "conv1", recuLe: "2026-10-30T08:00:00Z" },
      { internetMessageId: "<m0@x>", conversationId: "conv1", recuLe: "2026-10-28T08:00:00Z" },
      { internetMessageId: "<m9@x>", conversationId: "conv2", recuLe: "2026-10-30T08:00:00Z" },
    ];
    expect(reponseDansFil(attente(), recus)).toBeNull();
    expect(etatAttente(attente(), avant, recus).statut).toBe("en-attente");
  });

  it("fil inconnu : seule la date compte", () => {
    const recus = [{ internetMessageId: "<m2@x>", conversationId: "conv1", recuLe: "2026-10-30T08:00:00Z" }];
    expect(etatAttente(attente({ conversationId: null }), avant, recus).statut).toBe("en-attente");
  });

  it("relance : revient à la date sans réponse, close dès qu'une réponse arrive", () => {
    const relance = attente({ nature: "relance" });
    expect(etatAttente(relance, avant).statut).toBe("en-attente");
    expect(etatAttente(relance, apres)).toEqual({ statut: "a-traiter", motif: "date" });
    const recus = [{ internetMessageId: "<r@x>", conversationId: "conv1", recuLe: "2026-10-31T08:00:00Z" }];
    expect(etatAttente(relance, apres, recus)).toEqual({ statut: "close", motif: "reponse" });
  });
});

describe("de côté : attente sans date", () => {
  it("reste dehors jusqu'à ce qu'on le reprenne, même si une réponse arrive", () => {
    const recus = [{ internetMessageId: "<m2@x>", conversationId: "conv1", recuLe: "2026-10-30T08:00:00Z" }];
    expect(etatAttente(attente({ jusquAu: null }), new Date("2027-06-01T00:00:00Z"), recus)).toEqual({ statut: "en-attente", motif: null });
  });

  it("le menu : de côté sans date, refusé pour une relance", () => {
    const jeudi = new Date("2026-10-29T15:00:00Z");
    expect(echeanceDuChoix("de-cote", "attente", jeudi)).toEqual({ ok: true, jusquAu: null });
    expect(echeanceDuChoix("de-cote", "relance", jeudi).ok).toBe(false);
    expect(echeanceDuChoix("demain", "relance", jeudi)).toEqual({ ok: true, jusquAu: "2026-10-30T07:00:00.000Z" });
  });

  it("dans l'état agrégé : de côté, hors du chiffre", () => {
    const e = etatEquipe({
      contexte: { internetMessageId: "<m1@x>", boite: BOITE, dossierCle: "binome:emmanuel.lopes@real31.fr" },
      attribution: null,
      notes: 0,
      attente: attente({ jusquAu: null }),
      maintenant: new Date("2026-12-01T00:00:00Z"),
    });
    expect(e.attente).toMatchObject({ deCote: true, statut: "en-attente" });
    expect(e.horsATraiter).toBe(true);
  });
});

describe("date de retour", () => {
  const jeudi = new Date("2026-10-29T15:00:00Z");

  it("08:00 à Paris, heure d'hiver et d'été", () => {
    expect(matinParis("2026-11-02")).toBe("2026-11-02T07:00:00.000Z");
    expect(matinParis("2026-07-01")).toBe("2026-07-01T06:00:00.000Z");
    expect(matinParis("2026-02-30")).toBeNull();
  });

  it("choix rapides", () => {
    expect(echeanceAttente("demain", jeudi)).toEqual({ ok: true, jusquAu: "2026-10-30T07:00:00.000Z" });
    expect(echeanceAttente("3-jours", jeudi)).toEqual({ ok: true, jusquAu: "2026-11-01T07:00:00.000Z" });
    expect(echeanceAttente("semaine", jeudi)).toEqual({ ok: true, jusquAu: "2026-11-05T07:00:00.000Z" });
  });

  it("un jour choisi : à partir de demain, un an au plus", () => {
    expect(echeanceAttente({ jour: "2026-11-10" }, jeudi)).toEqual({ ok: true, jusquAu: "2026-11-10T07:00:00.000Z" });
    expect(echeanceAttente({ jour: "2026-10-29" }, jeudi).ok).toBe(false);
    expect(echeanceAttente({ jour: "2028-01-01" }, jeudi).ok).toBe(false);
    expect(echeanceAttente({ jour: "pas une date" }, jeudi).ok).toBe(false);
  });

  it("tard le soir à Paris, « demain » est bien le lendemain à Paris", () => {
    // 23 h 30 à Paris le 29/10 = 22 h 30 UTC.
    expect(echeanceAttente("demain", new Date("2026-10-29T22:30:00Z"))).toEqual({ ok: true, jusquAu: "2026-10-30T07:00:00.000Z" });
    // 00 h 30 à Paris le 30/10 = 23 h 30 UTC le 29.
    expect(echeanceAttente("demain", new Date("2026-10-29T23:30:00Z"))).toEqual({ ok: true, jusquAu: "2026-10-31T07:00:00.000Z" });
  });
});

describe("état d'équipe agrégé", () => {
  const contexte = { internetMessageId: "<m1@x>", boite: BOITE, dossierCle: "binome:emmanuel.lopes@real31.fr" };
  const maintenant = new Date("2026-10-30T09:00:00Z");

  it("rien : non attribué, sans note, dans À traiter", () => {
    expect(etatEquipe({ contexte, attribution: null, notes: 0, attente: null, maintenant })).toEqual({
      internetMessageId: "<m1@x>",
      attributaire: null,
      notes: 0,
      attente: null,
      horsATraiter: false,
      relanceDue: false,
    });
  });

  it("attribué, deux notes, en attente : sort du chiffre", () => {
    const e = etatEquipe({ contexte, attribution: attribution(), notes: 2, attente: attente(), maintenant });
    expect(e.attributaire?.initiales).toBe("FS");
    expect(e.notes).toBe(2);
    expect(e.attente).toMatchObject({ nature: "attente", statut: "en-attente", deCote: false });
    expect(e.horsATraiter).toBe(true);
  });

  it("parti en Comptabilité : attribution et attente du binôme ignorées, les notes restent", () => {
    const e = etatEquipe({ contexte: { ...contexte, dossierCle: "comptabilite" }, attribution: attribution(), notes: 1, attente: attente(), maintenant });
    expect(e.attributaire).toBeNull();
    expect(e.attente).toBeNull();
    expect(e.horsATraiter).toBe(false);
    expect(e.notes).toBe(1);
  });

  it("relance due : le mail envoyé entre dans À traiter", () => {
    const e = etatEquipe({
      contexte: { internetMessageId: "<m1@x>", boite: BOITE, dossierCle: null },
      attribution: null,
      notes: 0,
      attente: attente({ nature: "relance", dossierCle: null }),
      maintenant: new Date("2026-11-03T09:00:00Z"),
    });
    expect(e.relanceDue).toBe(true);
    expect(e.horsATraiter).toBe(false);
  });
});
