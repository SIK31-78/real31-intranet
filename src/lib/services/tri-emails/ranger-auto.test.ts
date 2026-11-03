import { describe, expect, it, vi } from "vitest";
import { AUCUN_BINOME, RAISON_AR24, RAISON_NON_REMIS, type CoproTri, type EntreeJournalTri, type ReferentielTri } from "@/lib/domain/tri-emails";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import type { PositionMail, RangementTriProvider } from "@/lib/ports/rangement-tri-provider";
import type { NouvelleEntreeJournal, OptionsDejaRange, TriRepository } from "@/lib/ports/tri-repository";
import { annulerRangement, type DepsRangement } from "./ranger";
import { rangerAutomatiquement } from "./ranger-auto";
import { avecPropositionAutreAgence, mailDeLaFile } from "./lire-file";
import type { ReceptionIndex } from "@/lib/ports/reception-index";

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

// Un second gestionnaire : deux copros de dossiers differents ne se rangent pas seules.
const HUGO = { nomComplet: "Hugo Gestion", email: "hugo.gestion@real31.fr" };

const REF: ReferentielTri = {
  copros: [
    copro("S0297"),
    copro("S0305", { gestionnaire: HUGO }),
    copro("S0410", { inactive: true }),
    copro("S0520", { nom: "LE BELVEDERE", adresse: "4 allée des Tilleuls 78800 Houilles", gestionnaire: HUGO }),
    copro("S0298"),
  ],
  expediteurs: { "proprio@exemple.fr": [{ reference: "S0297", qualite: "copropriétaire" }], "ascenseurs@exemple.fr": [{ reference: "S0297", qualite: "fournisseur" }] },
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
    // Journal transactionnel (REA-420) : la ligne s'ouvre « en_cours » avant le deplacement.
    ouvrirRangement: async (e: NouvelleEntreeJournal) => {
      const id = `j${lignes.length + 1}`;
      lignes.push({ ...e, id, faitLe: new Date().toISOString(), annuleLe: null, etat: "en_cours" });
      return id;
    },
    confirmerRangement: async (id: string, messageId: string) => {
      const e = lignes.find((x) => x.id === id);
      if (e) Object.assign(e, { etat: "fait", messageId });
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

/** Index de la reception en memoire : juste ce que le rangement, l'annulation et la lecture utilisent. */
class MemoireReceptionIndex {
  private lignes = new Map<string, { m: RawMail; sorti: boolean }>();
  async appliquer(_b: string, d: { ajoutes: RawMail[]; retires: string[] }) {
    for (const m of d.ajoutes) this.lignes.set(m.internetMessageId, { m, sorti: false });
    return { sortis: [] };
  }
  // Une seule boite dans ces tests : la boite n'est pas lue.
  async enReception(boite?: string) {
    void boite;
    return [...this.lignes.values()].filter((l) => !l.sorti).map((l) => l.m);
  }
  async compter(boite?: string) {
    return (await this.enReception(boite)).length;
  }
  async sortir(_b: string, ids: string[]) {
    for (const id of ids) {
      const l = this.lignes.get(id);
      if (l) l.sorti = true;
    }
  }
  async remettre(_b: string, id: string, messageId?: string) {
    const l = this.lignes.get(id);
    if (l) this.lignes.set(id, { m: { ...l.m, ...(messageId ? { id: messageId } : {}) }, sorti: false });
  }
}
const commeIndex = (i: MemoireReceptionIndex) => i as unknown as ReceptionIndex;

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
    initialesParEmail: async () => ({ "gina.gestion@real31.fr": "GG", "hugo.gestion@real31.fr": "HG" }),
    gestionnaires: async () => [],
  };
  const passer = (opts: Parameters<typeof rangerAutomatiquement>[1] = {}) =>
    rangerAutomatiquement(deps, { actif: true, lireMails: async () => boite.enReception(), ...opts });
  return { repo, deps, passer, charger, ...boite };
}

describe("rangerAutomatiquement (cron, piste sûre)", () => {
  it("coupé (MAIL_TRI_AUTO absent) : ne lit rien, ne range rien", async () => {
    vi.stubEnv("MAIL_TRI_AUTO", "");
    const lireMails = vi.fn(async () => [brut({ subject: "S0297 - fuite" })]);
    const { deps } = monter([]);
    const bilan = await rangerAutomatiquement(deps, { lireMails });
    expect(bilan.actif).toBe(false);
    expect(lireMails).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("automatique coupé dans la config de la boîte (MAIL_TRI_AUTO ouvert) : ne lit rien", async () => {
    vi.stubEnv("MAIL_TRI_AUTO", "on");
    vi.stubEnv(
      "MAIL_TRI_BOITES",
      JSON.stringify([
        { boite: SYNDIC4, agences: ["HLS"], ecriture: true, automatique: true, envoi: false },
        { boite: "syndic2@real31.fr", agences: ["LGC", "ASN"], ecriture: true, automatique: false, envoi: false },
      ]),
    );
    const lireMails = vi.fn(async () => [brut({ subject: "S0297 - fuite" })]);
    const coupee = await rangerAutomatiquement(monter([], { boite: "syndic2@real31.fr" }).deps, { lireMails });
    expect(coupee.actif).toBe(false);
    expect(lireMails).not.toHaveBeenCalled();
    // Une boîte hors de la config non plus.
    expect((await rangerAutomatiquement(monter([], { boite: "syndic1@real31.fr" }).deps, { lireMails })).actif).toBe(false);
    // La boîte ouverte, elle, lit sa réception.
    expect((await rangerAutomatiquement(monter([]).deps, { lireMails })).actif).toBe(true);
    expect(lireMails).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("range la piste sûre comme un clic, et seulement elle", async () => {
    const sure = brut({ subject: "S0297 - fuite" });
    const mails = [
      sure,
      brut({ subject: "S0297 et S0305 : deux immeubles" }), // plusieurs
      brut({ subject: "Bonjour", bodyText: "Voir S0305 et S0298." }), // plusieurs codes dans le corps
      brut({ subject: "Ancien immeuble", bodyText: "Voir S0410." }), // inactive, code dans le corps : faible
      brut({ subject: "Réponse automatique : S0297" }), // corbeille
      brut({ from: "collegue@real31.fr", subject: "RE: fuite", bodyText: "Voir S0297." }), // interne sans piste sûre
    ];
    const { passer, repo, rangement } = monter(mails);
    const bilan = await passer();

    expect(bilan).toMatchObject({ actif: true, examines: 6, ranges: 1, echecs: 0, reportes: 0 });
    // « Voir S0410. » : code dans le corps rangeable depuis le 03/11/2026, mais copro inactive.
    expect(bilan.refus).toEqual({ "pas-sure": 2, "copro-inactive": 1, corbeille: 1, interne: 1 });
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

  it("avis de non-remise (03/11/2026) : rangé au binôme si la copro est sûre, sinon laissé à la main sans corbeille", async () => {
    const avecCode = brut({ from: "postmaster@exemple.fr", subject: "Non remis : Convocation AG S0297" });
    const exchange = brut({ from: "MicrosoftExchange329e71ec88ae4615bbc36ab6ce41109e@real31.fr", subject: "Undeliverable: Appel de fonds" });
    const { passer, repo } = monter([avecCode, exchange]);
    const bilan = await passer();
    expect(bilan).toMatchObject({ examines: 2, ranges: 1 });
    // L'avis d'Exchange, sans indice : ni corbeille, ni « interne » (adresse technique @real31.fr).
    expect(bilan.refus).toEqual({ "pas-sure": 1 });
    const journal = await repo.journalDepuis(SYNDIC4);
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({ internetMessageId: avecCode.internetMessageId, coproReference: "S0297", dossierNom: "GG", signal: "sure" });
  });

  it("mailDeLaFile : un avis de non-remise est signalé, sans corbeille ; une réponse automatique garde la corbeille", () => {
    const avis = mailDeLaFile(brut({ from: "postmaster@exemple.fr", subject: "Non remis : Bonjour" }), SYNDIC4, REF, null);
    expect(avis.nonRemis).toBe(true);
    expect(avis.corbeille).toBeUndefined();
    expect(avis.suggestion).toMatchObject({ nature: "aucune", candidats: [] });
    expect(avis.suggestion.raison.startsWith(RAISON_NON_REMIS)).toBe(true);
    // La conversation du mail envoyé (même conversationId) : piste faible, mention gardée.
    const fil = mailDeLaFile(brut({ from: "postmaster@exemple.fr", subject: "Non remis : Bonjour", conversationId: "c1" }), SYNDIC4, REF, "S0297");
    expect(fil.suggestion).toMatchObject({ nature: "faible", candidats: ["S0297"], origine: "conversation" });
    expect(fil.suggestion.raison.startsWith(RAISON_NON_REMIS)).toBe(true);
    // Une vraie réponse à un avis : un mail ordinaire.
    const reponse = mailDeLaFile(brut({ subject: "RE: Non remis : Convocation AG" }), SYNDIC4, REF, null);
    expect(reponse.nonRemis).toBeUndefined();
    expect(reponse.corbeille).toBeUndefined();
    // Publicité apprise ou réponse automatique : la corbeille, comme avant.
    const absence = mailDeLaFile(brut({ subject: "Réponse automatique : S0297" }), SYNDIC4, REF, null);
    expect(absence.corbeille).toBe("reponse-auto");
    expect(absence.suggestion.candidats).toEqual([]);
    const pub = mailDeLaFile(brut({ from: "postmaster@exemple.fr", subject: "Non remis : S0297" }), SYNDIC4, REF, null, new Set(["postmaster@exemple.fr"]));
    expect(pub.corbeille).toBeUndefined();
    expect(pub.suggestion).toMatchObject({ nature: "sure", candidats: ["S0297"] });
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

  it("index de la réception (REA-419) : rangé pour de vrai, il en sort tout de suite ; annulé, il y revient", async () => {
    const m = brut({ from: "proprio@exemple.fr", subject: "Question" });
    const { repo, deps, enReception } = monter([m]);
    const index = new MemoireReceptionIndex();
    await index.appliquer(SYNDIC4, { ajoutes: [m], retires: [] });
    deps.index = commeIndex(index);
    // Lecture par defaut remplacee par l'index, comme dans la tache planifiee.
    const bilan = await rangerAutomatiquement(deps, { actif: true, lireMails: (b) => index.enReception(b) });
    expect(bilan.ranges).toBe(1);
    expect(await index.compter(SYNDIC4)).toBe(0);

    const [e] = await repo.journalDepuis(SYNDIC4);
    await annulerRangement(e!.id, "mylene@real31.fr", deps);
    const remis = await index.enReception(SYNDIC4);
    expect(remis.map((x) => x.internetMessageId)).toEqual([m.internetMessageId]);
    // Avec son nouvel id dans la reception, celui que Graph lui a donne en revenant.
    expect(remis[0]!.id).toBe(enReception()[0]!.id);
  });

  it("en simulation, l'index ne bouge pas : le mail est toujours dans la boîte", async () => {
    const m = brut({ subject: "S0297 - fuite" });
    const { deps, rangement } = monter([m], { simulation: true });
    vi.mocked(rangement.deplacer).mockImplementation(async (_b, id) => ({ messageId: id }));
    const index = new MemoireReceptionIndex();
    await index.appliquer(SYNDIC4, { ajoutes: [m], retires: [] });
    deps.index = commeIndex(index);
    expect((await rangerAutomatiquement(deps, { actif: true, lireMails: (b) => index.enReception(b) })).ranges).toBe(1);
    expect(await index.compter(SYNDIC4)).toBe(1);
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
    // Le mail propose S0297 (fournisseur connu d'elle seule) ; le PDF dit S0305.
    const conflit = avecPj({ from: "ascenseurs@exemple.fr" });
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
      avecPj({ subject: "Réponse automatique : facture" }),
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

describe("rangerAutomatiquement : candidates d'un même dossier de binôme (28/10/2026)", () => {
  it("deux copros citées, même binôme : rangé dans son dossier, étiqueté des deux", async () => {
    const m = brut({ subject: "S0297 et S0298 : contrat d'entretien" });
    const { passer, repo, rangement } = monter([m]);
    expect(await passer()).toMatchObject({ ranges: 1, refus: {} });
    const [e] = await repo.journalDepuis(SYNDIC4);
    expect(e).toMatchObject({ dossierNom: "GG", dossierCle: "binome:gina.gestion@real31.fr", copros: ["S0297", "S0298"], signal: "plusieurs", par: "automatique" });
    expect(rangement.etiqueter).toHaveBeenCalledWith(SYNDIC4, expect.any(String), { ajouter: ["S0297", "S0298"] });
  });

  it("deux binômes différents : rien n'est rangé", async () => {
    const { passer } = monter([brut({ subject: "S0297 et S0305 : contrat d'entretien" })]);
    expect(await passer()).toMatchObject({ ranges: 0, refus: { "pas-sure": 1 } });
  });

  it("PDF qui citent deux copros du même binôme : rangé dans son dossier, journal « pj »", async () => {
    const m = brut({ subject: "Factures", attachments: [{ name: "pj" }] });
    const { passer, repo } = monter([m]);
    const bilan = await passer({ lirePdf: vi.fn(async () => ["S0297", "S0298"]), memoirePj: new Map() });
    expect(bilan).toMatchObject({ ranges: 1, pj: { ranges: 1 } });
    const [e] = await repo.journalDepuis(SYNDIC4);
    expect(e).toMatchObject({ dossierNom: "GG", copros: ["S0297", "S0298"], signal: "pj", candidats: ["S0297", "S0298"] });
  });
});

describe("rangerAutomatiquement : copro inactive citée par son code (28/10/2026)", () => {
  it("code dans l'objet : rangée dans le dossier de son ancien binôme, journal « faible »", async () => {
    const m = brut({ subject: "S0410 - coordonnées du nouveau syndic" });
    const { passer, repo } = monter([m]);
    expect(await passer()).toMatchObject({ ranges: 1 });
    const [e] = await repo.journalDepuis(SYNDIC4);
    expect(e).toMatchObject({ coproReference: "S0410", dossierNom: "GG", signal: "faible", par: "automatique" });
  });
});

describe("rangerAutomatiquement : Comptabilité par l'objet (03/11/2026)", () => {
  it("un relevé de compteur part en Comptabilité, étiqueté de sa copro", async () => {
    const m = brut({ from: "proprio@exemple.fr", subject: "Re: RELANCE demande relevé compteurs" });
    const { passer, repo, rangement } = monter([m]);
    expect(await passer()).toMatchObject({ ranges: 1 });
    const [e] = await repo.journalDepuis(SYNDIC4);
    expect(e).toMatchObject({ dossierNom: "Comptabilité", dossierCle: "comptabilite", coproReference: "S0297", copros: ["S0297"], par: "automatique" });
    expect(rangement.etiqueter).toHaveBeenCalledWith(SYNDIC4, expect.any(String), { ajouter: ["S0297"] });
  });
});

describe("rangerAutomatiquement : mail d'un collègue avec le code de la copro (03/11/2026)", () => {
  it("code dans l'objet : rangé seul comme un autre mail", async () => {
    const m = brut({ from: "collegue@real31.fr", subject: "RE: S0297 - fuite" });
    const { passer, repo } = monter([m]);
    expect(await passer()).toMatchObject({ ranges: 1 });
    const [e] = await repo.journalDepuis(SYNDIC4);
    expect(e).toMatchObject({ coproReference: "S0297", dossierNom: "GG", signal: "sure", par: "automatique" });
  });
});

describe("rangerAutomatiquement : bascule vers l'autre agence, piste vraiment sûre (03/11/2026)", () => {
  const AUTRES: ReferentielTri = {
    copros: [copro("S0178", { nom: "LES ROSIERS", adresse: "125 rue Louise Michel 78500 SARTROUVILLE", agence: "LGC" })],
    expediteurs: {},
  };
  it("code exact d'une copro d'une autre agence : basculé ; nom seul : laissé en proposition", async () => {
    const sur = brut({ subject: "S0178 - facture d'entretien" });
    const nomSeul = brut({ subject: "SDC LES ROSIERS FACTURE CONTRAT" });
    const basculer = vi.fn(async () => {});
    const { passer } = monter([sur, nomSeul]);
    const bilan = await passer({ autres: async () => AUTRES, basculer });
    expect(bilan.bascules).toEqual({ faites: 1, refusees: 0, echecs: 0, reportees: 0 });
    expect(basculer).toHaveBeenCalledTimes(1);
    expect(basculer).toHaveBeenCalledWith(sur.internetMessageId, "S0178", "LGC");
  });
  it("garde de la bascule fermée : refusée, rien d'autre ne casse", async () => {
    const { BasculeRefusee } = await import("./ranger-auto");
    const { passer } = monter([brut({ subject: "S0178 - facture d'entretien" })]);
    const bilan = await passer({ autres: async () => AUTRES, basculer: async () => { throw new BasculeRefusee("écriture coupée"); } });
    expect(bilan.bascules).toEqual({ faites: 0, refusees: 1, echecs: 0, reportees: 0 });
  });
});

describe("rangerAutomatiquement : recommandé AR24 non délivré (03/11/2026)", () => {
  const OBJET = "Votre courrier recommandé n'a pas été délivré";
  const avis = (adresse: string, o: Partial<RawMail> = {}) =>
    brut({
      from: "notification@ar24.fr",
      subject: OBJET,
      bodyText: `Echec de la notification de courrier recommandé\n\nCeci est un e-mail automatique vous prévenant que l'adresse suivante a renvoyé une erreur à notre serveur :\n\n${adresse}\n\nLe serveur a retourné une erreur indiquant que cette adresse n'existe pas.`,
      attachments: [{ name: `Preuve de non distribution ${adresse} 2026-10-29 17_55_04.pdf`, contentType: "application/pdf" }],
      ...o,
    });
  const AUTRES: ReferentielTri = {
    copros: [copro("S0178", { agence: "ML" })],
    expediteurs: { "voisin@exemple.fr": [{ reference: "S0178", qualite: "copropriétaire" }] },
  };

  it("adresse du destinataire connue d'une copro : rangé au binôme, avec la mention ; ses PDF ne sont pas lus", async () => {
    const connu = avis("proprio@exemple.fr");
    const inconnu = avis("personne@exemple.fr");
    const { passer, repo } = monter([connu, inconnu]);
    const lirePdf = vi.fn(async () => ["S0305"]);
    const bilan = await passer({ lirePdf, memoirePj: new Map() });
    expect(bilan).toMatchObject({ ranges: 1, refus: { "pas-sure": 1 } });
    expect(lirePdf).not.toHaveBeenCalled();
    const [e] = await repo.journalDepuis(SYNDIC4);
    expect(e).toMatchObject({ internetMessageId: connu.internetMessageId, coproReference: "S0297", signal: "sure", par: "automatique" });
  });

  it("mailDeLaFile : la mention AR24, jamais de corbeille, même expéditeur appris comme publicité", () => {
    const m = mailDeLaFile(avis("proprio@exemple.fr"), SYNDIC4, REF, null, new Set(["notification@ar24.fr"]));
    expect(m.corbeille).toBeUndefined();
    expect(m.nonRemis).toBe(true);
    expect(m.suggestion).toMatchObject({ nature: "sure", candidats: ["S0297"] });
    expect(m.suggestion.raison.startsWith(RAISON_AR24)).toBe(true);
    // Un fournisseur connu à cette adresse n'est pas le destinataire d'un recommandé.
    const fournisseur = mailDeLaFile(avis("ascenseurs@exemple.fr"), SYNDIC4, REF, null);
    expect(fournisseur.suggestion).toMatchObject({ nature: "aucune", candidats: [] });
    expect(fournisseur.suggestion.raison.startsWith(RAISON_AR24)).toBe(true);
    // La facture AR24 n'est pas concernée.
    expect(mailDeLaFile(brut({ from: "notification@ar24.fr", subject: "Votre facture AR24" }), SYNDIC4, REF, null).nonRemis).toBeUndefined();
  });

  it("copro d'une autre agence : proposée à la bascule, jamais basculée seule", async () => {
    const m = avis("voisin@exemple.fr");
    const basculer = vi.fn(async () => {});
    const { passer } = monter([m]);
    const bilan = await passer({ autres: async () => AUTRES, basculer });
    expect(bilan.ranges).toBe(0);
    expect(basculer).not.toHaveBeenCalled();
    const vu = avecPropositionAutreAgence(mailDeLaFile(m, SYNDIC4, REF, null), m, AUTRES);
    expect(vu.suggestion.autreAgence).toEqual({ reference: "S0178", agence: "ML" });
    expect(vu.suggestion.raison.startsWith(RAISON_AR24)).toBe(true);
  });
});
