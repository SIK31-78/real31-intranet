import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plusJours, type Cycle, type NouvelleEntreeJournal } from "@/lib/domain/contrats-copro";

// Le cron « échéances de contrats » : armé sujet par sujet, un envoi par période de cadence,
// le binôme en destinataires, les référents d'agence en copie quand c'est rouge, la clé
// libérée si l'envoi échoue.

const etat = vi.hoisted(() => ({
  cycles: [] as Cycle[],
  copros: [] as Record<string, unknown>[],
  collaborateurs: [] as Record<string, unknown>[],
  traces: new Set<string>(),
  traceKo: false,
  panneMail: false,
  envois: [] as { boite: string; a: string[]; cc: string[]; sujet: string; corps: string }[],
  journal: [] as NouvelleEntreeJournal[],
}));

vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));
vi.mock("./journal", () => ({
  journaliser: async (e: NouvelleEntreeJournal) => {
    etat.journal.push(e);
  },
}));
vi.mock("@/lib/adapters/router", () => ({
  getContratsCoproRepository: () => ({
    listerCycles: async (f: { sujets?: string[]; statuts?: string[] }) =>
      etat.cycles.filter((c) => (!f.sujets || f.sujets.includes(c.sujet)) && (!f.statuts || f.statuts.includes(c.statut))),
    listerReglesRelance: async () => ({
      assurance: { sujet: "assurance", premierRappelJours: 180, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
      gaz: { sujet: "gaz", premierRappelJours: 90, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
      ctq_ascenseur: { sujet: "ctq_ascenseur", premierRappelJours: 120, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
      ctq_vmc: { sujet: "ctq_vmc", premierRappelJours: 120, orangeJours: 30, rougeJours: 60, cadenceJours: 7 },
    }),
  }),
  getCoproRepository: () => ({ listerToutes: async () => etat.copros }),
  getGestionnaireRepository: () => ({
    listTous: async () => [
      { id: "g1", email: "gest@real31.fr" },
      { id: "g2", email: "assist@real31.fr" },
    ],
  }),
  getCollaborateurRepository: () => ({ listerTous: async () => etat.collaborateurs }),
  getAgenceRepository: () => ({ listerAgences: async () => [{ id: "ag-hls", code: "HLS" }] }),
  getRappelEnvoyeRepository: () => ({
    async reserver(cle: string) {
      if (etat.traceKo) throw new Error("Trace des rappels absente");
      if (etat.traces.has(cle)) return false;
      etat.traces.add(cle);
      return true;
    },
    async liberer(cle: string) {
      etat.traces.delete(cle);
    },
  }),
  getMailOutboundProvider: () => ({
    async envoyerNeuf(p: (typeof etat.envois)[number]) {
      if (etat.panneMail) throw new Error("Graph HTTP 503");
      etat.envois.push(p);
    },
  }),
}));

import { envoyerRappelsContrats, lienFicheCopro, sujetsArmes } from "./relances";

// 17/05/2026 à 7 h à Paris.
const MAINTENANT = new Date("2026-05-17T05:00:00Z");
const AUJ = "2026-05-17";

/** Échéance d'assurance telle que la fenêtre (180 j) soit ouverte depuis `jours` jours. */
const ouverteDepuis = (jours: number) => plusJours(AUJ, 180 - jours);

const cycle = (over: Partial<Cycle> = {}): Cycle => ({
  id: "c1", sujet: "assurance", coproCode: "S1", statut: "en_cours", echeanceISO: ouverteDepuis(10), etapes: {}, demarreManuellement: null, creeLeISO: "2026-01-01", ...over,
});
const copro = (code: string, over: Record<string, unknown> = {}) => ({ code, nom: `Copro ${code}`, statut: "active", agenceId: "ag-hls", managerId: "g1", assistantId: "g2", ...over });
const referent = { id: "t", email: "titouan@real31.fr", actif: true, habilitations: [{ id: "h1", type: "referent_syndic", agence: "HLS", depuisISO: "2026-01-01" }] };

beforeEach(() => {
  etat.cycles = [];
  etat.copros = [copro("S1")];
  etat.collaborateurs = [referent];
  etat.traces = new Set();
  etat.traceKo = false;
  etat.panneMail = false;
  etat.envois = [];
  etat.journal = [];
  vi.stubEnv("CONTRATS_RAPPELS_SUJETS", "assurance");
  vi.stubEnv("INTRANET_URL", "https://real31.app/");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sujetsArmes", () => {
  it("lit CONTRATS_RAPPELS_SUJETS, ignore l'inconnu, vide = aucun", () => {
    vi.stubEnv("CONTRATS_RAPPELS_SUJETS", " Gaz, assurance ;chauffage");
    expect(sujetsArmes()).toEqual(["assurance", "gaz"]);
    vi.stubEnv("CONTRATS_RAPPELS_SUJETS", "");
    expect(sujetsArmes()).toEqual([]);
  });

  it("le lien de la fiche ne double pas le slash", () => {
    expect(lienFicheCopro("S1")).toBe("https://real31.app/copropriete/S1");
  });
});

describe("envoyerRappelsContrats", () => {
  it("sujet non armé -> rien ne part, même avec un rappel dû", async () => {
    vi.stubEnv("CONTRATS_RAPPELS_SUJETS", "");
    etat.cycles = [cycle()];
    const b = await envoyerRappelsContrats(MAINTENANT);
    expect(b.sujetsArmes).toEqual([]);
    expect(b.candidats).toBe(0);
    expect(etat.envois).toHaveLength(0);
  });

  it("un autre sujet armé que celui du cycle -> rien", async () => {
    vi.stubEnv("CONTRATS_RAPPELS_SUJETS", "gaz");
    etat.cycles = [cycle()];
    const b = await envoyerRappelsContrats(MAINTENANT);
    expect(b.candidats).toBe(0);
    expect(etat.envois).toHaveLength(0);
  });

  it("rappel dû (vert) -> un mail au binôme depuis la boîte du gestionnaire, sans copie, journalisé, une seule fois", async () => {
    etat.cycles = [cycle()];
    const b = await envoyerRappelsContrats(MAINTENANT);
    expect(b.jour).toBe(AUJ);
    expect(b.candidats).toBe(1);
    expect(b.envoyes).toEqual(["contrats|assurance|c1|1"]);
    expect(etat.envois).toHaveLength(1);
    const m = etat.envois[0];
    expect(m.boite).toBe("gest@real31.fr");
    expect(m.a).toEqual(["gest@real31.fr", "assist@real31.fr"]);
    expect(m.cc).toEqual([]);
    expect(m.sujet).toBe(`[Échéance Assurance] Copro S1 (S1) : échéance ${ouverteDepuis(10).split("-").reverse().join("/")}`);
    expect(m.corps).toContain("https://real31.app/copropriete/S1");
    expect(m.corps).toContain("Niveau vert");
    expect(etat.journal).toHaveLength(1);
    expect(etat.journal[0]).toMatchObject({ coproCode: "S1", sujet: "assurance", cycleId: "c1", type: "rappel_envoye", parUserId: null, details: { a: m.a, niveau: "vert" } });

    // IDEMPOTENT : le second passage de la même période ne renvoie pas.
    const b2 = await envoyerRappelsContrats(MAINTENANT);
    expect(b2.dejaEnvoyes).toEqual(["contrats|assurance|c1|1"]);
    expect(etat.envois).toHaveLength(1);
  });

  it("rouge -> les référents syndic de l'agence en copie", async () => {
    etat.cycles = [cycle({ echeanceISO: ouverteDepuis(65) })];
    const b = await envoyerRappelsContrats(MAINTENANT);
    expect(b.envoyes).toHaveLength(1);
    expect(etat.envois[0].cc).toEqual(["titouan@real31.fr"]);
    expect(etat.envois[0].corps).toContain("Niveau rouge");
    expect(b.ignores).toEqual([]);
    expect(etat.journal[0].details).toMatchObject({ niveau: "rouge", cc: ["titouan@real31.fr"] });
  });

  it("rouge sans référent d'agence (habilitation close, inactif, autre agence) -> envoyé sans copie, dit dans le bilan", async () => {
    etat.cycles = [cycle({ echeanceISO: ouverteDepuis(65) })];
    etat.collaborateurs = [
      { ...referent, habilitations: [{ id: "h1", type: "referent_syndic", agence: "HLS", depuisISO: "2026-01-01", jusquaISO: "2026-05-01" }] },
      { ...referent, id: "u2", email: "parti@real31.fr", actif: false },
      { ...referent, id: "u3", email: "ml@real31.fr", habilitations: [{ id: "h3", type: "referent_syndic", agence: "ML", depuisISO: "2026-01-01" }] },
    ];
    const b = await envoyerRappelsContrats(MAINTENANT);
    expect(b.envoyes).toHaveLength(1);
    expect(etat.envois[0].cc).toEqual([]);
    expect(b.ignores).toEqual([{ cle: "contrats|assurance|c1|9", raison: "aucun référent d'agence (HLS) : rappel rouge envoyé sans copie direction" }]);
  });

  it("panne du mail -> clé libérée, erreur au bilan, pas de journal ; le passage suivant retente", async () => {
    etat.cycles = [cycle()];
    etat.panneMail = true;
    const b1 = await envoyerRappelsContrats(MAINTENANT);
    expect(b1.erreurs).toEqual([{ cle: "contrats|assurance|c1|1", message: "Graph HTTP 503" }]);
    expect(etat.traces.size).toBe(0);
    expect(etat.journal).toHaveLength(0);
    etat.panneMail = false;
    expect((await envoyerRappelsContrats(MAINTENANT)).envoyes).toEqual(["contrats|assurance|c1|1"]);
  });

  it("trace illisible (SQL pas passé) -> aucun envoi", async () => {
    etat.cycles = [cycle()];
    etat.traceKo = true;
    const b = await envoyerRappelsContrats(MAINTENANT);
    expect(b.envoyes).toEqual([]);
    expect(b.erreurs).toHaveLength(1);
    expect(etat.envois).toHaveLength(0);
  });

  it("repli sur l'assistant ; sans boîte -> ignoré ; copro inactive ou inconnue -> écartée ; fenêtre fermée -> rien", async () => {
    etat.copros = [copro("S1", { managerId: undefined }), copro("S2", { managerId: "inconnu", assistantId: undefined }), copro("S3", { statut: "inactive" })];
    etat.cycles = [
      cycle({ id: "c1", coproCode: "S1" }),
      cycle({ id: "c2", coproCode: "S2" }),
      cycle({ id: "c3", coproCode: "S3" }),
      cycle({ id: "c4", coproCode: "S9" }),
      cycle({ id: "c5", coproCode: "S1", echeanceISO: ouverteDepuis(-1) }),
    ];
    const b = await envoyerRappelsContrats(MAINTENANT);
    expect(b.candidats).toBe(2);
    expect(b.envoyes).toEqual(["contrats|assurance|c1|1"]);
    expect(etat.envois[0].boite).toBe("assist@real31.fr");
    expect(etat.envois[0].a).toEqual(["assist@real31.fr"]);
    expect(b.ignores).toEqual([{ cle: "contrats|assurance|c2|1", raison: "aucune boîte d'envoi (gestionnaire et assistant sans e-mail)" }]);
  });
});
