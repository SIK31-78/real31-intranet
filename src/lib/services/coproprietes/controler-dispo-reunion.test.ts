// Tests du controle serveur des dispos (OCCUPE = BLOQUANT, defense en profondeur).
// Le provider calendrier (router) est mocke : on pilote la dispo par cible et on
// verifie le refus (occupe), le passage (libre / inconnu / panne Graph) et le cas
// replanification creneau inchange (plan vide -> AUCUN appel Graph, jamais bloque
// par notre propre evenement).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { planifierControlesDispo } from "@/lib/domain/disponibilite-reunion";

const etat = vi.hoisted(() => {
  const ref = {
    dispos: new Map<string, "libre" | "occupee" | "inconnu">(),
    appels: [] as { cible: string; debut: string; fin: string }[],
    enPanne: false,
    reset() {
      ref.dispos.clear();
      ref.appels.length = 0;
      ref.enPanne = false;
    },
  };
  return ref;
});

vi.mock("@/lib/adapters/router", () => ({
  getCalendrierOutboundProvider: () => ({
    async disponibiliteSalle(_boite: string, cible: string, debut: string, fin: string) {
      if (etat.enPanne) throw new Error("Graph getSchedule 403");
      etat.appels.push({ cible, debut, fin });
      return etat.dispos.get(cible) ?? "inconnu";
    },
  }),
}));

import { controlerDisposReunion } from "@/lib/services/coproprietes/controler-dispo-reunion";

const BOITE = "remi@real31.fr";
const SALLE = "real31lgc@real31.fr";
const COLLEGUE = "emmanuel@real31.fr";
const DEBUT = "2026-09-15T18:00:00";

// Plan "premiere pose" : tout controler (agenda + salle + collegue).
const planComplet = planifierControlesDispo(
  { date: "", heure: "", salle: "", collaborateurs: [] },
  { date: "2026-09-15", heure: "18:00", salle: SALLE, collaborateurs: [COLLEGUE] },
);

beforeEach(() => {
  etat.reset();
});

describe("controlerDisposReunion - refus si occupe", () => {
  it("mon agenda occupe -> refus qui nomme l'agenda et invite a changer de creneau", async () => {
    etat.dispos.set(BOITE, "occupee");
    const refus = await controlerDisposReunion("S024", "AG", DEBUT, BOITE, planComplet);
    expect(refus).toContain("ton agenda est occupé");
    expect(refus).toContain("Change de créneau");
  });

  it("salle occupee -> refus qui nomme la salle (libelle, pas l'email)", async () => {
    etat.dispos.set(SALLE, "occupee");
    const refus = await controlerDisposReunion("S024", "AG", DEBUT, BOITE, planComplet);
    expect(refus).toContain("LGC - Salle de reunions");
    expect(refus).not.toContain(SALLE); // pas d'email brut dans le message
  });

  it("collegue occupe -> refus 'un collegue' (pas d'email en clair, pas de PII)", async () => {
    etat.dispos.set(COLLEGUE, "occupee");
    const refus = await controlerDisposReunion("S024", "CS", DEBUT, BOITE, planComplet);
    expect(refus).toContain("collègue");
    expect(refus).not.toContain(COLLEGUE);
  });

  it("plusieurs cibles occupees -> le refus liste chaque blocage", async () => {
    etat.dispos.set(BOITE, "occupee");
    etat.dispos.set(SALLE, "occupee");
    const refus = await controlerDisposReunion("S024", "AG", DEBUT, BOITE, planComplet);
    expect(refus).toContain("ton agenda est occupé");
    expect(refus).toContain("LGC - Salle de reunions");
  });
});

describe("controlerDisposReunion - passage si libre / inconnu / panne", () => {
  it("tout libre -> null (on peut fixer la date)", async () => {
    etat.dispos.set(BOITE, "libre");
    etat.dispos.set(SALLE, "libre");
    etat.dispos.set(COLLEGUE, "libre");
    expect(await controlerDisposReunion("S024", "AG", DEBUT, BOITE, planComplet)).toBeNull();
    expect(etat.appels).toHaveLength(3); // agenda + salle + collegue interroges
  });

  it("'inconnu' (Graph off / 403 Access Policy) ne bloque JAMAIS", async () => {
    // dispos non renseignees -> le mock repond "inconnu" partout.
    expect(await controlerDisposReunion("S024", "AG", DEBUT, BOITE, planComplet)).toBeNull();
  });

  it("Graph en panne (throw) -> degrade en 'inconnu', jamais bloquant", async () => {
    etat.enPanne = true;
    expect(await controlerDisposReunion("S024", "AG", DEBUT, BOITE, planComplet)).toBeNull();
  });

  it("date sans heure (journee entiere) : pas de creneau cadrable -> null, aucun appel", async () => {
    etat.dispos.set(BOITE, "occupee");
    expect(await controlerDisposReunion("S024", "AG", "2026-09-15", BOITE, planComplet)).toBeNull();
    expect(etat.appels).toHaveLength(0);
  });
});

describe("controlerDisposReunion - replanification creneau inchange (faux positif)", () => {
  it("plan vide (rien a controler) -> null et AUCUN appel Graph, meme tout 'occupe'", async () => {
    // Tout est marque occupe (ce serait notre propre evenement projete) ...
    etat.dispos.set(BOITE, "occupee");
    etat.dispos.set(SALLE, "occupee");
    etat.dispos.set(COLLEGUE, "occupee");
    // ... mais le creneau est INCHANGE : le plan exclut toutes les cibles.
    const plan = planifierControlesDispo(
      { date: "2026-09-15", heure: "18:00", salle: SALLE, collaborateurs: [COLLEGUE] },
      { date: "2026-09-15", heure: "18:00", salle: SALLE, collaborateurs: [COLLEGUE] },
    );
    expect(await controlerDisposReunion("S024", "AG", DEBUT, BOITE, plan)).toBeNull();
    expect(etat.appels).toHaveLength(0);
  });

  it("creneau inchange + NOUVEAU collegue occupe -> seul lui est controle, et il bloque", async () => {
    const nouveau = "dimitri@real31.fr";
    etat.dispos.set(BOITE, "occupee"); // notre propre evenement : ignore par le plan
    etat.dispos.set(nouveau, "occupee"); // vrai conflit du nouvel invite
    const plan = planifierControlesDispo(
      { date: "2026-09-15", heure: "18:00", salle: SALLE, collaborateurs: [COLLEGUE] },
      { date: "2026-09-15", heure: "18:00", salle: SALLE, collaborateurs: [COLLEGUE, nouveau] },
    );
    const refus = await controlerDisposReunion("S024", "AG", DEBUT, BOITE, plan);
    expect(refus).toContain("collègue");
    expect(etat.appels.map((a) => a.cible)).toEqual([nouveau]); // ni agenda ni salle ni collegue deja invite
  });
});
