import { afterEach, describe, expect, it, vi } from "vitest";
import { AUCUN_BINOME, type EntreeJournalTri } from "@/lib/domain/tri-emails";
import type { EtatBascule, PieceComparee } from "@/lib/domain/bascule-boites";
import { MailHorsReception } from "@/lib/ports/rangement-tri-provider";
import type { RecopieInterBoitesProvider, SituationMail } from "@/lib/ports/recopie-inter-boites";
import { DejaRangeErreur, type NouvelleEntreeJournal } from "@/lib/ports/tri-repository";
import type { DepsRangement } from "./ranger";
import { annulerRangement } from "./ranger";
import { basculerMail, depsBascule, destinationsDeBascule, reprendreBascule, type DepsBascule } from "./basculer";
import { boiteTri } from "@/lib/domain/mail-gate";

const S4 = "syndic4@real31.fr";
const S2 = "syndic2@real31.fr";
/** Boîte « destination seulement » ("tri":false) : ML, relevée par Crypto (28/10/2026). */
const S1 = "syndic1@real31.fr";
/** La config de prod du 28/10/2026, plus syndic1 en destination seulement. */
const AVEC_ML = JSON.stringify([
  { boite: S4, agences: ["HLS"], depuis: "2026-10-14", ecriture: true, automatique: true, envoi: true },
  { boite: S2, agences: ["LGC", "ASN"], depuis: "2026-10-27", ecriture: true, automatique: true, envoi: true },
  { boite: S1, agences: ["ML"], tri: false, ecriture: true },
]);


afterEach(() => {
  vi.unstubAllEnvs();
});
const IMID = "<m1@x>";

/** Journal en mémoire d'UNE boîte, avec l'index unique des rangements réels actifs (REA-420). */
function journal(boite: string, initiales: EntreeJournalTri[] = []) {
  const lignes = [...initiales];
  let n = 0;
  const actives = () => lignes.filter((e) => !e.annuleLe);
  const ajouter = (e: NouvelleEntreeJournal, etat: "en_cours" | "fait") => {
    if (!e.simulation && actives().some((x) => x.internetMessageId === e.internetMessageId && !x.simulation)) throw new DejaRangeErreur();
    const id = `${boite}#${++n}`;
    lignes.push({ ...e, id, faitLe: new Date().toISOString(), annuleLe: null, etat });
    return id;
  };
  const repo = {
    lignes,
    rangementActif: vi.fn(async (_b: string, imid: string) => [...actives()].reverse().find((e) => e.internetMessageId === imid) ?? null),
    entree: vi.fn(async (id: string) => lignes.find((e) => e.id === id) ?? null),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- meme signature que le port
    marquerAnnule: vi.fn(async (id: string, _par?: string, _raison?: string) => {
      const e = lignes.find((x) => x.id === id);
      if (!e || e.annuleLe) return false;
      e.annuleLe = new Date().toISOString();
      return true;
    }),
    ouvrirRangement: vi.fn(async (e: NouvelleEntreeJournal) => ajouter(e, "en_cours")),
    confirmerRangement: vi.fn(async (id: string, messageId: string) => {
      const e = lignes.find((x) => x.id === id)!;
      e.etat = "fait";
      e.messageId = messageId;
    }),
    journaliser: vi.fn(async (e: NouvelleEntreeJournal) => ajouter(e, "fait")),
    dejaRanges: vi.fn(async (_b: string, ids: string[]) => new Set(actives().filter((e) => ids.includes(e.internetMessageId)).map((e) => e.internetMessageId))),
    dossier: vi.fn(async () => null),
    enregistrerDossier: vi.fn(async () => {}),
    binomes: vi.fn(async () => AUCUN_BINOME),
  };
  return repo;
}

/** Deux boîtes Graph en mémoire : où est chaque mail, et ses pièces. */
function boites() {
  type Mail = { boite: string; id: string; imid: string; lieu: SituationMail["lieu"]; recopieDe: string | null; pieces: PieceComparee[] };
  const mails: Mail[] = [];
  let n = 0;
  const trouver = (boite: string, imid: string) =>
    mails.filter((m) => m.boite === boite && m.imid === imid).sort((a, b) => Number(a.lieu === "corbeille") - Number(b.lieu === "corbeille"))[0];
  const recopie = {
    situer: vi.fn(async (boite: string, imid: string): Promise<SituationMail | null> => {
      const m = trouver(boite, imid);
      return m ? { messageId: m.id, lieu: m.lieu, recopieDe: m.recopieDe, expediteur: "x@y.fr", objet: "Fuite" } : null;
    }),
    pieces: vi.fn(async (boite: string, id: string) => mails.find((m) => m.boite === boite && m.id === id)?.pieces ?? []),
    effacerCopie: vi.fn(async (boite: string, id: string) => {
      const i = mails.findIndex((m) => m.boite === boite && m.id === id);
      if (i >= 0) mails.splice(i, 1);
    }),
    recopier: vi.fn(async (source: string, id: string, cible: string) => {
      const o = mails.find((m) => m.boite === source && m.id === id)!;
      const copie = { boite: cible, id: `c${++n}`, imid: o.imid, lieu: "reception" as const, recopieDe: source, pieces: [...o.pieces] };
      mails.push(copie);
      return { messageId: copie.id };
    }),
  } satisfies RecopieInterBoitesProvider;
  const rangement = (boite: string) => ({
    lireEnReception: vi.fn(async (_b: string, id: string) => {
      const m = mails.find((x) => x.boite === boite && x.id === id);
      return m && m.lieu === "reception" ? { internetMessageId: m.imid, expediteur: "x@y.fr", objet: "Fuite" } : null;
    }),
    assurerDossier: vi.fn(async () => ({ folderId: "f-binome" })),
    deplacer: vi.fn(async (_b: string, id: string) => {
      const m = mails.find((x) => x.boite === boite && x.id === id);
      if (!m) throw new MailHorsReception();
      m.lieu = "autre";
      return { messageId: id };
    }),
    supprimer: vi.fn(async (_b: string, id: string) => {
      const m = mails.find((x) => x.boite === boite && x.id === id);
      if (!m) throw new MailHorsReception();
      m.lieu = "corbeille";
      return { messageId: id };
    }),
    remettreEnReception: vi.fn(async (_b: string, id: string) => {
      mails.find((x) => x.boite === boite && x.id === id)!.lieu = "reception";
      return { messageId: id };
    }),
    etiqueter: vi.fn(async () => {}),
    localiser: vi.fn(async () => null),
  });
  return { mails, recopie, rangement };
}

const referentiel = {
  charger: async () => ({
    copros: [{ reference: "S0077", nom: "LES PINS", adresse: "Le Pecq", gestionnaire: { nomComplet: "Emmanuel LOPES", email: "emmanuel.lopes@real31.fr" }, assistant: null }],
    expediteurs: {},
  }),
};

function monter(o: { journalS4?: EntreeJournalTri[]; journalS2?: EntreeJournalTri[]; etat?: Partial<EtatBascule> } = {}) {
  const b = boites();
  const repoS4 = journal(S4, o.journalS4);
  const repoS2 = journal(S2, o.journalS2);
  const rS4 = b.rangement(S4);
  const rS2 = b.rangement(S2);
  const dep = (boite: string, repo: unknown, rangement: unknown, ref: unknown = referentiel, index?: unknown) =>
    ({
      boite,
      simulation: false,
      rangement,
      repo,
      referentiel: ref,
      initialesParEmail: async () => ({ "emmanuel.lopes@real31.fr": "EL" }),
      gestionnaires: async () => [],
      recopie: b.recopie,
      ...(index ? { index } : {}),
    }) as unknown as DepsRangement;
  const deps: DepsBascule = {
    source: dep(S4, repoS4, rS4),
    cible: dep(S2, repoS2, rS2),
    recopie: b.recopie,
    cibleTriee: true,
    etat: { source: S4, cible: S2, cibleConfiguree: true, ecritureSource: true, ecritureCible: true, graph: true, ...o.etat },
  };
  return { ...b, repoS4, repoS2, rS4, rS2, deps, dep };
}

/**
 * Un faux dont TOUT appel échoue ET est noté (une erreur avalée par un .catch se verrait quand
 * même) : le journal, l'index et le rangement d'une cible non triée.
 */
function piege(nom: string, appels: string[]): Record<string, never> {
  return new Proxy({} as Record<string, never>, {
    get: (_c, prop) => {
      if (prop === "then") return undefined;
      return () => {
        appels.push(`${nom}.${String(prop)}`);
        throw new Error(`${nom}.${String(prop)} appelé pour une boîte non triée`);
      };
    },
  });
}

/** Le référentiel de l'agence ML (copros Crypto), celui de syndic1. */
const referentielML = {
  charger: async () => ({
    copros: [{ reference: "S0208", nom: "LE CEDRE", adresse: "Maisons-Laffitte", gestionnaire: null, assistant: null }],
    expediteurs: {},
  }),
};

/** Une bascule de syndic4 vers syndic1, boîte « destination seulement » : la cible n'a ni journal, ni index, ni rangement. */
function monterVersML(o: { journalS4?: EntreeJournalTri[] } = {}) {
  const t = monter(o);
  const appelsCible: string[] = [];
  const deps: DepsBascule = {
    ...t.deps,
    cible: t.dep(S1, piege("journal", appelsCible), piege("rangement", appelsCible), referentielML, piege("index", appelsCible)),
    cibleTriee: false,
    etat: { ...t.deps.etat, cible: S1 },
  };
  return { ...t, deps, appelsCible };
}

const rangement = (o: Partial<EntreeJournalTri> = {}): EntreeJournalTri => ({
  id: "j-binome",
  boite: S4,
  internetMessageId: IMID,
  messageId: "o1",
  expediteur: "x@y.fr",
  objet: "Fuite",
  coproReference: "S0178",
  copros: ["S0178"],
  dossierNom: "NP-MP",
  dossierCle: "binome:nicolas.peloquin@real31.fr",
  signal: null,
  candidats: [],
  simulation: false,
  par: "tri",
  faitLe: new Date().toISOString(),
  annuleLe: null,
  etat: "fait",
  ...o,
});

const PDF = { nom: "devis.pdf", isInline: false };

describe("bascule d'un mail vers une autre boîte triée", () => {
  it("depuis la file du tri : copie dans la réception de la cible, original à la corbeille, ligne « basculé vers » confirmée", async () => {
    const t = monter();
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: null, pieces: [PDF] });
    const r = await basculerMail({ internetMessageId: IMID }, "mylene.pin@real31.fr", t.deps);

    expect(r).toEqual({ boiteCible: S2, dossierNom: null, dejaPresent: false, rangementRefuse: null, cibleTriee: true });
    expect(t.recopie.recopier).toHaveBeenCalledWith(S4, "o1", S2);
    expect(t.mails.find((m) => m.boite === S2)).toMatchObject({ lieu: "reception", recopieDe: S4 });
    expect(t.mails.find((m) => m.boite === S4)!.lieu).toBe("corbeille");
    expect(t.repoS4.lignes).toEqual([
      expect.objectContaining({ dossierCle: "bascule:syndic2@real31.fr", dossierNom: "Basculé vers syndic2@real31.fr", par: "mylene.pin@real31.fr", etat: "fait", annuleLe: null }),
    ]);
    // La copie attend le tri de la cible : rien n'est écrit dans son journal.
    expect(t.repoS2.lignes).toHaveLength(0);
  });

  it("depuis « E-mails » avec la copro : l'ancien rangement est annulé, la copie est rangée chez le binôme de la cible", async () => {
    const t = monter({ journalS4: [rangement()] });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "autre", recopieDe: null, pieces: [] });
    const r = await basculerMail({ internetMessageId: IMID, copro: "S0077" }, "mp", t.deps);

    expect(r.dossierNom).toBe("EL");
    expect(t.repoS4.lignes[0]).toMatchObject({ id: "j-binome", annuleLe: expect.any(String) });
    expect(t.repoS4.marquerAnnule).toHaveBeenCalledWith("j-binome", "mp", "basculé vers syndic2@real31.fr");
    expect(t.repoS4.lignes[1]).toMatchObject({ dossierCle: "bascule:syndic2@real31.fr", coproReference: "S0077", etat: "fait" });
    expect(t.repoS2.lignes).toEqual([expect.objectContaining({ coproReference: "S0077", dossierNom: "EL", par: "mp" })]);
  });

  it("écriture coupée sur la cible : refus lisible, rien n'est écrit nulle part", async () => {
    const t = monter({ etat: { ecritureCible: false } });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: null, pieces: [] });
    await expect(basculerMail({ internetMessageId: IMID }, "mp", t.deps)).rejects.toThrow(/coupée sur syndic2/);
    expect(t.recopie.situer).not.toHaveBeenCalled();
    expect(t.repoS4.lignes).toHaveLength(0);
  });

  it("copro inconnue de la cible : refusée avant tout geste", async () => {
    const t = monter({ journalS4: [rangement()] });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "autre", recopieDe: null, pieces: [] });
    await expect(basculerMail({ internetMessageId: IMID, copro: "S0999" }, "mp", t.deps)).rejects.toThrow(/pas dans ESTALE/);
    expect(t.repoS4.marquerAnnule).not.toHaveBeenCalled();
    expect(t.recopie.recopier).not.toHaveBeenCalled();
  });

  it("copie impossible : la ligne est annulée, l'ancien rangement rétabli, l'original n'a pas bougé", async () => {
    const t = monter({ journalS4: [rangement()] });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "autre", recopieDe: null, pieces: [] });
    t.recopie.recopier.mockRejectedValueOnce(new Error("Graph création de la copie 400"));
    await expect(basculerMail({ internetMessageId: IMID }, "mp", t.deps)).rejects.toThrow(/400/);

    expect(t.mails.find((m) => m.boite === S4)!.lieu).toBe("autre");
    const actives = t.repoS4.lignes.filter((e) => !e.annuleLe);
    expect(actives).toEqual([expect.objectContaining({ dossierCle: "binome:nicolas.peloquin@real31.fr", coproReference: "S0178", etat: "fait" })]);
  });

  it("original non retiré après la copie : la ligne reste « en_cours » pour la reprise, message clair", async () => {
    const t = monter();
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: null, pieces: [] });
    t.rS4.supprimer.mockRejectedValueOnce(new Error("Graph 503"));
    await expect(basculerMail({ internetMessageId: IMID }, "mp", t.deps)).rejects.toThrow(/la tâche planifiée terminera/);
    expect(t.repoS4.lignes[0]).toMatchObject({ etat: "en_cours", annuleLe: null });
    expect(t.mails.filter((m) => m.boite === S2)).toHaveLength(1);
  });

  it("recliquer après une panne : la copie complète est reprise, jamais en double", async () => {
    const t = monter();
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: null, pieces: [PDF] });
    t.mails.push({ boite: S2, id: "c-avant", imid: IMID, lieu: "reception", recopieDe: S4, pieces: [PDF] });
    const r = await basculerMail({ internetMessageId: IMID }, "mp", t.deps);
    expect(r.dejaPresent).toBe(true);
    expect(t.recopie.recopier).not.toHaveBeenCalled();
    expect(t.mails.filter((m) => m.boite === S2)).toHaveLength(1);
  });

  it("une copie incomplète (pièce manquante) est effacée et refaite", async () => {
    const t = monter();
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: null, pieces: [PDF] });
    t.mails.push({ boite: S2, id: "c-partielle", imid: IMID, lieu: "reception", recopieDe: S4, pieces: [] });
    await basculerMail({ internetMessageId: IMID }, "mp", t.deps);
    expect(t.recopie.effacerCopie).toHaveBeenCalledWith(S2, "c-partielle");
    expect(t.mails.filter((m) => m.boite === S2)).toEqual([expect.objectContaining({ pieces: [PDF] })]);
  });

  it("le mail est déjà arrivé pour de vrai dans la cible : rien n'est recopié, jamais effacé", async () => {
    const t = monter();
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: null, pieces: [PDF] });
    t.mails.push({ boite: S2, id: "recu", imid: IMID, lieu: "reception", recopieDe: null, pieces: [] });
    const r = await basculerMail({ internetMessageId: IMID }, "mp", t.deps);
    expect(r.dejaPresent).toBe(true);
    expect(t.recopie.recopier).not.toHaveBeenCalled();
    expect(t.recopie.effacerCopie).not.toHaveBeenCalled();
  });

  it("aller-retour : l'ancienne ligne « basculé vers » de la cible est annulée, la copie revient dans sa file", async () => {
    const t = monter({ journalS2: [rangement({ id: "j-aller", boite: S2, dossierCle: "bascule:syndic4@real31.fr", dossierNom: "Basculé vers syndic4@real31.fr" })] });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: S2, pieces: [] });
    t.mails.push({ boite: S2, id: "o0", imid: IMID, lieu: "corbeille", recopieDe: null, pieces: [] });
    await basculerMail({ internetMessageId: IMID }, "mp", t.deps);
    expect(t.repoS2.lignes[0]!.annuleLe).not.toBeNull();
    expect(t.recopie.recopier).toHaveBeenCalled();
  });

  it("déjà basculé : refusé", async () => {
    const t = monter({ journalS4: [rangement({ dossierCle: "bascule:syndic2@real31.fr" })] });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "autre", recopieDe: null, pieces: [] });
    await expect(basculerMail({ internetMessageId: IMID }, "mp", t.deps)).rejects.toThrow(/déjà été basculé/);
  });

  it("une bascule ne s'annule pas depuis le journal (le mail serait en double)", async () => {
    const t = monter({ journalS4: [rangement({ dossierCle: "bascule:syndic2@real31.fr" })] });
    await expect(annulerRangement("j-binome", "mp", t.deps.source)).rejects.toThrow(/basculé vers une autre boîte/);
  });
});

describe("bascule vers une boîte « destination seulement » (syndic1, ML, non triée)", () => {
  it("copie dans la réception de syndic1, original à la corbeille, ligne au départ seulement ; rien côté cible", async () => {
    const t = monterVersML({ journalS4: [rangement()] });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "autre", recopieDe: null, pieces: [PDF] });
    const r = await basculerMail({ internetMessageId: IMID, copro: "s208" }, "mp", t.deps);

    expect(r).toEqual({ boiteCible: S1, dossierNom: null, dejaPresent: false, rangementRefuse: null, cibleTriee: false });
    expect(t.recopie.recopier).toHaveBeenCalledWith(S4, "o1", S1);
    expect(t.mails.find((m) => m.boite === S1)).toMatchObject({ lieu: "reception", recopieDe: S4 });
    expect(t.mails.find((m) => m.boite === S4)!.lieu).toBe("corbeille");
    // La copro ML choisie est notée sur la ligne de DÉPART (référence du référentiel ML).
    expect(t.repoS4.lignes[1]).toMatchObject({ dossierCle: "bascule:syndic1@real31.fr", coproReference: "S0208", etat: "fait" });
    // Aucun rangement chez un binôme de syndic4 non plus : seul l'ancien a été annulé.
    expect(t.rS4.deplacer).not.toHaveBeenCalled();
    expect(t.rS4.etiqueter).not.toHaveBeenCalled();
    // Ni journal, ni index, ni rangement, ni catégorie côté syndic1.
    expect(t.appelsCible).toEqual([]);
  });

  it("sans copro (bouton « Envoyer à syndic1 ») : même chose, la copie attend dans la réception", async () => {
    const t = monterVersML();
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: null, pieces: [] });
    const r = await basculerMail({ internetMessageId: IMID }, "mp", t.deps);
    expect(r).toMatchObject({ boiteCible: S1, dossierNom: null, cibleTriee: false });
    expect(t.repoS4.lignes).toEqual([expect.objectContaining({ dossierNom: "Basculé vers syndic1@real31.fr", etat: "fait" })]);
    expect(t.appelsCible).toEqual([]);
  });

  it("copro absente du référentiel ML : refusée avant tout geste", async () => {
    const t = monterVersML({ journalS4: [rangement()] });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "autre", recopieDe: null, pieces: [] });
    await expect(basculerMail({ internetMessageId: IMID, copro: "S0077" }, "mp", t.deps)).rejects.toThrow(
      "La copropriété S0077 n'est pas dans le référentiel de la boîte syndic1@real31.fr.",
    );
    expect(t.repoS4.marquerAnnule).not.toHaveBeenCalled();
    expect(t.recopie.recopier).not.toHaveBeenCalled();
  });

  it("recliquer : la copie complète déjà dans syndic1 est reprise, jamais en double", async () => {
    const t = monterVersML();
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: null, pieces: [PDF] });
    t.mails.push({ boite: S1, id: "c-avant", imid: IMID, lieu: "reception", recopieDe: S4, pieces: [PDF] });
    const r = await basculerMail({ internetMessageId: IMID }, "mp", t.deps);
    expect(r).toMatchObject({ dejaPresent: true, cibleTriee: false });
    expect(t.recopie.recopier).not.toHaveBeenCalled();
    expect(t.mails.filter((m) => m.boite === S1)).toHaveLength(1);
    expect(t.appelsCible).toEqual([]);
  });

  it("le mail déjà relevé hors réception de syndic1 (Crypto l'a classé) : rien n'est recopié", async () => {
    const t = monterVersML();
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: null, pieces: [] });
    t.mails.push({ boite: S1, id: "recu", imid: IMID, lieu: "autre", recopieDe: null, pieces: [] });
    expect(await basculerMail({ internetMessageId: IMID }, "mp", t.deps)).toMatchObject({ dejaPresent: true });
    expect(t.recopie.recopier).not.toHaveBeenCalled();
    expect(t.recopie.effacerCopie).not.toHaveBeenCalled();
  });

  it("écriture coupée sur syndic1 : refus lisible, rien n'est écrit", async () => {
    const t = monterVersML();
    t.deps.etat.ecritureCible = false;
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "reception", recopieDe: null, pieces: [] });
    await expect(basculerMail({ internetMessageId: IMID }, "mp", t.deps)).rejects.toThrow(/coupée sur syndic1/);
    expect(t.repoS4.lignes).toHaveLength(0);
  });

  describe("reprise (tâche planifiée de syndic4), cible non triée", () => {
    const enCoursML = () =>
      rangement({ id: "j-b", dossierCle: "bascule:syndic1@real31.fr", dossierNom: "Basculé vers syndic1@real31.fr", etat: "en_cours" });

    it("copie complète dans syndic1 : on termine, sans rien lire du journal de syndic1", async () => {
      const t = monterVersML({ journalS4: [enCoursML()] });
      t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "autre", recopieDe: null, pieces: [PDF] });
      t.mails.push({ boite: S1, id: "c1", imid: IMID, lieu: "reception", recopieDe: S4, pieces: [PDF] });
      expect(await reprendreBascule(t.repoS4.lignes[0]!, t.deps.source)).toBe("confirmee");
      expect(t.mails.find((m) => m.boite === S4)!.lieu).toBe("corbeille");
    });

    it("copie partielle : effacée dans syndic1 (écriture de syndic1 lue dans la liste de bascule), l'original revient", async () => {
      vi.stubEnv("MAIL_TRI_ECRITURE", "on");
      vi.stubEnv("MAIL_TRI_BOITES", AVEC_ML);
      const t = monterVersML({ journalS4: [enCoursML()] });
      t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "autre", recopieDe: null, pieces: [PDF] });
      t.mails.push({ boite: S1, id: "c1", imid: IMID, lieu: "reception", recopieDe: S4, pieces: [] });
      // ecritureCible par défaut : la config de syndic1 vient de boiteDestinationBascule (boiteTri la rendrait nulle).
      expect(await reprendreBascule(t.repoS4.lignes[0]!, t.deps.source)).toBe("annulee");
      expect(t.recopie.effacerCopie).toHaveBeenCalledWith(S1, "c1");
      expect(t.mails.find((m) => m.boite === S4)!.lieu).toBe("reception");
    });
  });
});

describe("destinations de bascule (config MAIL_TRI_BOITES)", () => {
  const ouvrir = (config = AVEC_ML) => {
    vi.stubEnv("MAIL_TRI_BOITES", config);
    vi.stubEnv("MAIL_TRI_ECRITURE", "on");
    vi.stubEnv("MAIL_SOURCE", "graph");
  };

  it("syndic1 (tri:false) est une destination depuis syndic4 et syndic2, marquée non triée", () => {
    ouvrir();
    expect(destinationsDeBascule(S4)).toEqual([
      { boite: S2, agences: ["LGC", "ASN"], triee: true },
      { boite: S1, agences: ["ML"], triee: false },
    ]);
    expect(destinationsDeBascule(S2).map((d) => d.boite)).toEqual([S4, S1]);
  });

  it("syndic1 n'est jamais une boîte de départ (pas d'écran) : aucune destination, refus", () => {
    ouvrir();
    expect(destinationsDeBascule(S1)).toEqual([]);
    const faux = { boite: S1, agences: ["ML"], depuis: null, ecriture: true, automatique: false, envoi: false };
    expect(depsBascule(faux, S4).etat.source).toBeNull();
  });

  it("depsBascule vers syndic1 : cible non triée, sans index de réception", () => {
    ouvrir();
    const d = depsBascule(boiteTri(S4), S1);
    expect(d.cibleTriee).toBe(false);
    expect(d.etat).toMatchObject({ source: S4, cible: S1, cibleConfiguree: true, ecritureSource: true, ecritureCible: true });
    expect(d.cible.index).toBeUndefined();
    expect(depsBascule(boiteTri(S4), S2).cibleTriee).toBe(true);
  });

  it("ecriture:false sur syndic1, ou interrupteur global coupé : syndic1 disparaît des destinations", () => {
    ouvrir(AVEC_ML.replace('"tri":false,"ecriture":true', '"tri":false,"ecriture":false'));
    expect(destinationsDeBascule(S4).map((d) => d.boite)).toEqual([S2]);
    ouvrir();
    vi.stubEnv("MAIL_TRI_ECRITURE", "");
    expect(destinationsDeBascule(S4)).toEqual([]);
  });
});

describe("reprise d'une bascule interrompue (tâche planifiée de la boîte de départ)", () => {
  const enCours = () => rangement({ id: "j-b", dossierCle: "bascule:syndic2@real31.fr", dossierNom: "Basculé vers syndic2@real31.fr", etat: "en_cours" });

  it("original déjà à la corbeille : la copie avait été faite, ligne confirmée", async () => {
    const t = monter({ journalS4: [enCours()] });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "corbeille", recopieDe: null, pieces: [] });
    expect(await reprendreBascule(t.repoS4.lignes[0]!, t.deps.source)).toBe("confirmee");
    expect(t.repoS4.lignes[0]!.etat).toBe("fait");
  });

  it("copie complète dans la cible, original encore là : on termine (corbeille, confirmation)", async () => {
    const t = monter({ journalS4: [enCours()] });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "autre", recopieDe: null, pieces: [PDF] });
    t.mails.push({ boite: S2, id: "c1", imid: IMID, lieu: "reception", recopieDe: S4, pieces: [PDF] });
    expect(await reprendreBascule(t.repoS4.lignes[0]!, t.deps.source)).toBe("confirmee");
    expect(t.mails.find((m) => m.boite === S4)!.lieu).toBe("corbeille");
  });

  it("copie absente ou incomplète : copie partielle effacée, ligne annulée, l'original revient en réception", async () => {
    const t = monter({ journalS4: [enCours()] });
    t.mails.push({ boite: S4, id: "o1", imid: IMID, lieu: "autre", recopieDe: null, pieces: [PDF] });
    t.mails.push({ boite: S2, id: "c1", imid: IMID, lieu: "reception", recopieDe: S4, pieces: [] });
    expect(await reprendreBascule(t.repoS4.lignes[0]!, t.deps.source, t.recopie, () => true)).toBe("annulee");
    expect(t.mails.filter((m) => m.boite === S2)).toHaveLength(0);
    expect(t.mails.find((m) => m.boite === S4)!.lieu).toBe("reception");
    expect(t.repoS4.lignes[0]!.annuleLe).not.toBeNull();
  });

  it("sans Graph (simulation) : rien", async () => {
    const t = monter({ journalS4: [enCours()] });
    expect(await reprendreBascule(t.repoS4.lignes[0]!, { ...t.deps.source, simulation: true })).toBe("aucune");
  });
});
