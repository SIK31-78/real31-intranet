import { describe, expect, it, vi } from "vitest";
import { AUCUN_BINOME, type CoproTri, type EntreeJournalTri, type ReferentielTri } from "@/lib/domain/tri-emails";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import type { PositionMail, RangementTriProvider } from "@/lib/ports/rangement-tri-provider";
import type { NouvelleEntreeJournal, OptionsDejaRange, TriRepository } from "@/lib/ports/tri-repository";
import { annulerRangement, type DepsRangement } from "./ranger";
import { rangerAutomatiquement } from "./ranger-auto";

// Donnees inventees.
const SYNDIC4 = "syndic4@real31.fr";
const RECEPTION = "inbox";

const copro = (reference: string, o: Partial<CoproTri> = {}): CoproTri => ({
  reference,
  nom: `Copro ${reference}`,
  adresse: "",
  gestionnaire: { nomComplet: "Gina Gestion", email: "gina.gestion@real31.fr" },
  assistant: null,
  ...o,
});

const REF: ReferentielTri = {
  copros: [
    copro("S0297"),
    copro("S0305"),
    copro("S0410", { inactive: true }),
    copro("S0520", { nom: "LE BELVEDERE", adresse: "4 allée des Tilleuls 78800 Houilles" }),
  ],
  expediteurs: { "proprio@exemple.fr": [{ reference: "S0297", qualite: "copropriétaire" }] },
};

let n = 0;
const brut = (o: Partial<RawMail> = {}): RawMail => {
  n++;
  return {
    id: `g${n}`,
    internetMessageId: `<m${n}@exemple.fr>`,
    from: "inconnu@exemple.fr",
    to: [SYNDIC4],
    subject: "Bonjour",
    receivedAt: `2026-10-20T08:${String(n).padStart(2, "0")}:00Z`,
    bodyText: "",
    copro: "",
    attachments: [],
    ...o,
  };
};

/** Journal en memoire : juste ce que le rangement et l'annulation utilisent. */
function journalEnMemoire() {
  const lignes: EntreeJournalTri[] = [];
  const repo = {
    binomes: async () => AUCUN_BINOME,
    dossier: async () => null,
    enregistrerDossier: async () => {},
    journaliser: async (e: NouvelleEntreeJournal) => {
      const id = `j${lignes.length + 1}`;
      lignes.push({ ...e, id, faitLe: new Date().toISOString(), annuleLe: null });
      return id;
    },
    entree: async (id: string) => lignes.find((e) => e.id === id) ?? null,
    journalDepuis: async (boite: string) => lignes.filter((e) => e.boite === boite && !e.annuleLe),
    dejaRanges: async (boite: string, ids: string[], o: OptionsDejaRange) =>
      new Set(
        lignes
          .filter((e) => e.boite === boite && !e.annuleLe && ids.includes(e.internetMessageId) && !(o.reellesSeulement && e.simulation))
          .map((e) => e.internetMessageId),
      ),
    dejaJournalises: async (boite: string, ids: string[], o: OptionsDejaRange) =>
      new Set(
        lignes
          .filter((e) => e.boite === boite && ids.includes(e.internetMessageId) && !(o.reellesSeulement && e.simulation))
          .map((e) => e.internetMessageId),
      ),
    historiqueExpediteurs: async (boite: string, expediteurs: string[]) => {
      const cles = new Set(expediteurs.map((e) => e.toLowerCase()));
      return lignes.filter((e) => e.boite === boite && !e.annuleLe && cles.has(e.expediteur.toLowerCase()));
    },
    coprosDesConversations: async (boite: string, ids: string[]) => {
      const out = new Map<string, string>();
      for (const e of lignes) {
        if (e.boite === boite && !e.annuleLe && e.coproReference && e.conversationId && ids.includes(e.conversationId)) out.set(e.conversationId, e.coproReference);
      }
      return out;
    },
    marquerAnnule: async (id: string) => {
      const e = lignes.find((x) => x.id === id && !x.annuleLe);
      if (e) e.annuleLe = new Date().toISOString();
      return Boolean(e);
    },
  };
  return repo as typeof repo & TriRepository;
}

/** Boite fictive : un mail = un dossier ; un deplacement change l'id, comme Graph. */
function boiteFictive(mails: RawMail[]) {
  const ou = new Map<string, { id: string; dossier: string; m: RawMail }>();
  for (const m of mails) ou.set(m.internetMessageId, { id: m.id, dossier: RECEPTION, m });
  const parId = (id: string) => [...ou.values()].find((x) => x.id === id);
  let k = 0;
  const rangement: RangementTriProvider = {
    lireEnReception: vi.fn(async (_b: string, id: string) => {
      const x = parId(id);
      return x && x.dossier === RECEPTION ? { internetMessageId: x.m.internetMessageId, expediteur: x.m.from, objet: x.m.subject } : null;
    }),
    assurerDossier: vi.fn(async (_b: string, p: { folderIdConnu: string | null; nom: string }) => ({ folderId: p.folderIdConnu ?? `f-${p.nom}` })),
    deplacer: vi.fn(async (_b: string, id: string, folderId: string) => {
      const x = parId(id)!;
      x.dossier = folderId;
      x.id = `g-deplace-${++k}`;
      return { messageId: x.id };
    }),
    remettreEnReception: vi.fn(async (_b: string, id: string) => {
      const x = parId(id)!;
      x.dossier = RECEPTION;
      x.id = `g-remis-${++k}`;
      return { messageId: x.id };
    }),
    supprimer: vi.fn(async (_b: string, id: string) => ({ messageId: id })),
    etiqueter: vi.fn(async () => {}),
    localiser: vi.fn(async (_b: string, imid: string): Promise<PositionMail | null> => {
      const x = ou.get(imid);
      return x ? { messageId: x.id, folderId: x.dossier, enReception: x.dossier === RECEPTION, categories: [] } : null;
    }),
  };
  const enReception = () => [...ou.values()].filter((x) => x.dossier === RECEPTION).map((x) => ({ ...x.m, id: x.id }));
  return { rangement, enReception };
}

function monter(mails: RawMail[], o: { boite?: string; simulation?: boolean } = {}) {
  const repo = journalEnMemoire();
  const boite = boiteFictive(mails);
  const charger = vi.fn(async () => REF);
  const deps: DepsRangement = {
    boite: o.boite ?? SYNDIC4,
    simulation: o.simulation ?? false,
    rangement: boite.rangement,
    referentiel: { charger },
    repo,
    initialesParEmail: async () => ({ "gina.gestion@real31.fr": "GG" }),
    gestionnaires: async () => [],
  };
  const passer = (opts: Parameters<typeof rangerAutomatiquement>[1] = {}) =>
    rangerAutomatiquement(deps, { actif: true, lireMails: async () => boite.enReception(), ...opts });
  return { repo, deps, passer, charger, ...boite };
}

describe("rangerAutomatiquement (cron, piste sûre de syndic4)", () => {
  it("coupé (MAIL_TRI_AUTO absent) : ne lit rien, ne range rien", async () => {
    vi.stubEnv("MAIL_TRI_AUTO", "");
    const lireMails = vi.fn(async () => [brut({ subject: "S0297 - fuite" })]);
    const { deps } = monter([]);
    const bilan = await rangerAutomatiquement(deps, { lireMails });
    expect(bilan.actif).toBe(false);
    expect(lireMails).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("une autre boîte que syndic4 : ne lit rien", async () => {
    const lireMails = vi.fn(async () => [brut({ subject: "S0297 - fuite" })]);
    const { deps } = monter([], { boite: "syndic1@real31.fr" });
    const bilan = await rangerAutomatiquement(deps, { actif: true, lireMails });
    expect(lireMails).not.toHaveBeenCalled();
    expect(bilan.ranges).toBe(0);
  });

  it("range la piste sûre comme un clic, et seulement elle", async () => {
    const sure = brut({ subject: "S0297 - fuite" });
    const mails = [
      sure,
      brut({ subject: "S0297 et S0305 : deux immeubles" }), // plusieurs
      brut({ subject: "Bonjour", bodyText: "Voir S0305." }), // faible
      brut({ subject: "S0410 - ancien immeuble" }), // inactive : plafonnee a faible
      brut({ from: "postmaster@exemple.fr", subject: "Non remis : S0297" }), // corbeille
      brut({ from: "collegue@real31.fr", subject: "RE: S0297 - fuite" }), // interne
    ];
    const { passer, repo, rangement } = monter(mails);
    const bilan = await passer();

    expect(bilan).toMatchObject({ actif: true, examines: 6, ranges: 1, echecs: 0, reportes: 0 });
    expect(bilan.refus).toEqual({ "pas-sure": 3, corbeille: 1, interne: 1 });
    expect(rangement.deplacer).toHaveBeenCalledTimes(1);
    const journal = await repo.journalDepuis(SYNDIC4);
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({
      internetMessageId: sure.internetMessageId,
      coproReference: "S0297",
      copros: ["S0297"],
      dossierNom: "GG",
      signal: "sure",
      candidats: ["S0297"],
      par: "automatique",
      simulation: false,
    });
    expect(rangement.etiqueter).toHaveBeenCalledWith(SYNDIC4, expect.any(String), { ajouter: ["S0297"] });
  });

  it("range une piste faible par le nom de l'immeuble, et journalise « faible »", async () => {
    const m = brut({ subject: "Intervention LE BELVEDERE" });
    const { passer, repo } = monter([m]);
    expect(await passer()).toMatchObject({ ranges: 1 });
    const [e] = await repo.journalDepuis(SYNDIC4);
    expect(e).toMatchObject({ coproReference: "S0520", signal: "faible", candidats: ["S0520"], par: "automatique" });
  });

  it("ne range pas une piste faible que la conversation contredit", async () => {
    const suite = brut({ conversationId: "fil-1", subject: "RE: intervention LE BELVEDERE" });
    const { passer, repo } = monter([suite]);
    // Un mail du meme fil deja range dans S0297 : l'ecran proposerait « plusieurs ».
    await repo.journaliser({
      boite: SYNDIC4,
      internetMessageId: "<premier@exemple.fr>",
      messageId: "g-premier",
      conversationId: "fil-1",
      expediteur: "inconnu@exemple.fr",
      objet: "S0297 - fuite",
      coproReference: "S0297",
      copros: ["S0297"],
      dossierNom: "GG",
      dossierCle: "binome:gina.gestion@real31.fr",
      signal: "sure",
      candidats: ["S0297"],
      simulation: false,
      par: "automatique",
    });
    const bilan = await passer();
    expect(bilan.ranges).toBe(0);
    expect(bilan.refus).toEqual({ "pas-sure": 1 });
  });

  it("annulé d'un clic : le mail revient dans la file et n'est plus rangé automatiquement", async () => {
    const m = brut({ from: "proprio@exemple.fr", subject: "Question" });
    const { passer, repo, deps, enReception } = monter([m]);
    expect((await passer()).ranges).toBe(1);
    expect(enReception()).toHaveLength(0);

    const [e] = await repo.journalDepuis(SYNDIC4);
    await annulerRangement(e!.id, "mylene@real31.fr", deps);
    expect(enReception().map((x) => x.internetMessageId)).toEqual([m.internetMessageId]);
    expect(await repo.dejaRanges(SYNDIC4, [m.internetMessageId], { reellesSeulement: true })).toEqual(new Set());

    const bilan = await passer();
    expect(bilan.ranges).toBe(0);
    expect(bilan.refus).toEqual({ "deja-passe": 1 });
    expect(enReception()).toHaveLength(1);
  });

  it("un mail déjà rangé (même en simulation, resté en réception) n'est pas rangé deux fois", async () => {
    const { passer, repo, rangement } = monter([brut({ subject: "S0297 - fuite" })], { simulation: true });
    // En simulation, rien ne bouge dans la boite (SimulationRangementTri).
    vi.mocked(rangement.deplacer).mockImplementation(async (_b, id) => ({ messageId: id }));
    expect((await passer()).ranges).toBe(1);
    const second = await passer();
    expect(second.ranges).toBe(0);
    expect(second.refus).toEqual({ "deja-passe": 1 });
    const journal = await repo.journalDepuis(SYNDIC4);
    expect(journal).toHaveLength(1);
    expect(journal[0]!.simulation).toBe(true);
  });

  it("en réel, une ligne simulée (session de dev sur la même base) ne retient pas le rangement", async () => {
    // Mesure du 27/10/2026 : 44 mails de syndic4 ignores par l'automatique a cause de lignes
    // simulees non annulees. Une ligne simulee n'a jamais deplace le mail.
    const m = brut({ subject: "S0297 - fuite" });
    const { passer, repo, enReception } = monter([m]);
    await repo.journaliser({
      boite: SYNDIC4, internetMessageId: m.internetMessageId, messageId: m.id, expediteur: m.from, objet: m.subject,
      coproReference: "S0297", copros: ["S0297"], dossierNom: "GG", dossierCle: "binome:gina.gestion@real31.fr",
      signal: "sure", candidats: ["S0297"], simulation: true, par: "sekou@real31.fr",
    });
    const bilan = await passer();
    expect(bilan.ranges).toBe(1);
    expect(bilan.refus).toEqual({});
    expect(enReception()).toHaveLength(0);
    const reelles = (await repo.journalDepuis(SYNDIC4)).filter((e) => !e.simulation);
    expect(reelles).toHaveLength(1);
    expect(reelles[0]).toMatchObject({ internetMessageId: m.internetMessageId, par: "automatique", simulation: false });
  });

  it("borne le nombre de rangements par passage ; le reste attend le suivant", async () => {
    const mails = Array.from({ length: 5 }, () => brut({ subject: "S0297 - fuite" }));
    const { passer, charger } = monter(mails);
    const premier = await passer({ max: 2 });
    expect(premier).toMatchObject({ ranges: 2, reportes: 3 });
    // Le referentiel n'est charge qu'une fois pour tout le passage.
    expect(charger).toHaveBeenCalledTimes(1);
    expect(await passer({ max: 2 })).toMatchObject({ ranges: 2, reportes: 1 });
  });

  it("s'arrête quand le budget de temps est dépassé", async () => {
    const mails = Array.from({ length: 3 }, () => brut({ subject: "S0297 - fuite" }));
    let t = 0;
    const { passer } = monter(mails);
    // Chaque lecture de l'horloge avance de 10 s : le budget de 15 s laisse passer 1 mail.
    const bilan = await passer({ budgetMs: 15_000, maintenant: () => (t += 10_000) });
    expect(bilan).toMatchObject({ ranges: 1, reportes: 2 });
  });

  it("un échec n'arrête pas le passage", async () => {
    const mails = [brut({ subject: "S0297 - fuite" }), brut({ subject: "S0305 - ascenseur" })];
    const { passer, rangement } = monter(mails);
    vi.mocked(rangement.deplacer).mockRejectedValueOnce(new Error("Graph indisponible"));
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const bilan = await passer();
    expect(bilan).toMatchObject({ ranges: 1, echecs: 1 });
    erreur.mockRestore();
  });
});


describe("rangerAutomatiquement : lecture des PDF (26/10/2026)", () => {
  const avecPj = (o: Partial<RawMail> = {}) => brut({ attachments: [{ name: "piece jointe" }], ...o });

  it("range seul un mail sans piste quand ses PDF ne désignent qu'une copro, journal « pj »", async () => {
    const m = avecPj({ subject: "Facture" });
    const { passer, repo } = monter([m]);
    const lirePdf = vi.fn(async () => ["S0305"]);
    const bilan = await passer({ lirePdf, memoirePj: new Map() });
    expect(bilan).toMatchObject({ ranges: 1, pj: { lus: 1, ranges: 1 } });
    expect(lirePdf).toHaveBeenCalledWith(m.internetMessageId, REF.copros);
    const [e] = await repo.journalDepuis(SYNDIC4);
    expect(e).toMatchObject({ coproReference: "S0305", signal: "pj", candidats: ["S0305"], par: "automatique" });
  });

  it("deux copros dans les PDF : pas d'automatique, et le mail n'est pas relu au passage suivant", async () => {
    const { passer } = monter([avecPj()]);
    const lirePdf = vi.fn(async () => ["S0297", "S0305"]);
    const memoirePj = new Map<string, number>();
    expect(await passer({ lirePdf, memoirePj })).toMatchObject({ ranges: 0, pj: { lus: 1, refus: { "pj-plusieurs": 1 } } });
    expect(await passer({ lirePdf, memoirePj })).toMatchObject({ ranges: 0, pj: { lus: 0, dejaLus: 1 } });
    expect(lirePdf).toHaveBeenCalledTimes(1);
  });

  it("refuse une copro du PDF que le mail ne propose pas, ou inactive", async () => {
    // Le mail propose S0297 (code dans le corps) ; le PDF dit S0305.
    const conflit = avecPj({ bodyText: "Voir S0297." });
    const { passer } = monter([conflit, avecPj({ subject: "Ancien immeuble" })]);
    const lirePdf = vi.fn(async (id: string) => (id === conflit.internetMessageId ? ["S0305"] : ["S0410"]));
    const bilan = await passer({ lirePdf, memoirePj: new Map() });
    expect(bilan.ranges).toBe(0);
    expect(bilan.pj.refus).toEqual({ "pj-conflit": 1, "copro-inactive": 1 });
  });

  it("ne lit pas les PDF d'un mail rangeable, à la corbeille, interne ou déjà passé", async () => {
    const deja = avecPj({ subject: "Facture" });
    const mails = [
      avecPj({ subject: "S0297 - facture" }),
      avecPj({ from: "postmaster@exemple.fr", subject: "Non remis : facture" }),
      avecPj({ from: "collegue@real31.fr", subject: "Facture" }),
      deja,
    ];
    const { passer, repo } = monter(mails);
    await repo.journaliser({
      boite: SYNDIC4, internetMessageId: deja.internetMessageId, messageId: "x", expediteur: "", objet: "", coproReference: null,
      copros: [], dossierNom: "Divers", dossierCle: "divers", signal: null, candidats: [], simulation: false, par: "mylene@real31.fr",
    });
    const lirePdf = vi.fn(async () => ["S0305"]);
    const bilan = await passer({ lirePdf, memoirePj: new Map() });
    expect(lirePdf).not.toHaveBeenCalled();
    expect(bilan).toMatchObject({ ranges: 1, pj: { lus: 0 } });
  });

  it("borne le nombre de mails lus et le temps ; un PDF trop long est abandonné et retenu", async () => {
    const { passer } = monter(Array.from({ length: 3 }, () => avecPj()));
    const lent = vi.fn(() => new Promise<string[]>(() => {}));
    const memoirePj = new Map<string, number>();
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const bilan = await passer({ lirePdf: lent, maxPj: 2, delaiPjMs: 5, memoirePj });
    expect(bilan.pj).toMatchObject({ lus: 2, erreurs: 2, reportes: 1 });
    expect(memoirePj.size).toBe(2);
    // Plus assez de budget pour une lecture (delai + marge) : rien n'est lu.
    const serre = await passer({ lirePdf: lent, budgetMs: 1_000, delaiPjMs: 5, memoirePj: new Map() });
    expect(serre.pj).toMatchObject({ lus: 0, reportes: 3 });
    erreur.mockRestore();
  });
});

describe("rangerAutomatiquement : publicité apprise du journal (26/10/2026)", () => {
  it("un expéditeur mis deux fois à la corbeille, jamais rangé : corbeille proposée, pas d'automatique", async () => {
    // L'objet cite le nom d'un immeuble : sans la publicité, la piste faible serait rangée.
    const pub = brut({ from: "Newsletter@pub.exemple.fr", subject: "Offre LE BELVEDERE", attachments: [{ name: "piece jointe" }] });
    const { passer, repo } = monter([pub]);
    for (const i of [1, 2]) {
      await repo.journaliser({
        boite: SYNDIC4, internetMessageId: `<pub${i}@exemple.fr>`, messageId: `p${i}`, expediteur: "newsletter@pub.exemple.fr",
        objet: "Offre d'automne", coproReference: null, copros: [], dossierNom: "Corbeille", dossierCle: "corbeille",
        signal: "aucune", candidats: [], simulation: false, par: "mylene@real31.fr",
      });
    }
    const lirePdf = vi.fn(async () => ["S0305"]);
    const bilan = await passer({ lirePdf, memoirePj: new Map() });
    expect(bilan.ranges).toBe(0);
    expect(bilan.refus).toEqual({ corbeille: 1 });
    expect(lirePdf).not.toHaveBeenCalled();
  });
});
