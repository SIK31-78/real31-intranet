import { describe, expect, it, vi } from "vitest";
import { AUCUN_BINOME, type CoproTri, type EntreeJournalTri, type ReferentielTri } from "@/lib/domain/tri-emails";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import type { PositionMail, RangementTriProvider } from "@/lib/ports/rangement-tri-provider";
import type { NouvelleEntreeJournal, TriRepository } from "@/lib/ports/tri-repository";
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
  copros: [copro("S0297"), copro("S0305"), copro("S0410", { inactive: true })],
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
    dejaRanges: async (boite: string, ids: string[]) =>
      new Set(lignes.filter((e) => e.boite === boite && !e.annuleLe && ids.includes(e.internetMessageId)).map((e) => e.internetMessageId)),
    dejaJournalises: async (boite: string, ids: string[]) =>
      new Set(lignes.filter((e) => e.boite === boite && ids.includes(e.internetMessageId)).map((e) => e.internetMessageId)),
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

  it("annulé d'un clic : le mail revient dans la file et n'est plus rangé automatiquement", async () => {
    const m = brut({ from: "proprio@exemple.fr", subject: "Question" });
    const { passer, repo, deps, enReception } = monter([m]);
    expect((await passer()).ranges).toBe(1);
    expect(enReception()).toHaveLength(0);

    const [e] = await repo.journalDepuis(SYNDIC4);
    await annulerRangement(e!.id, "mylene@real31.fr", deps);
    expect(enReception().map((x) => x.internetMessageId)).toEqual([m.internetMessageId]);
    expect(await repo.dejaRanges(SYNDIC4, [m.internetMessageId])).toEqual(new Set());

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

