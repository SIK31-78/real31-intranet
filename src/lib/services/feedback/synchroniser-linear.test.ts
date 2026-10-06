// Tests du pont remontees <-> Linear. Le REPOSITORY reste le mock reel (adapters mock
// par defaut, COPRO_SOURCE non defini) : on verifie donc de vrais aller-retours en
// base. Seul le TRACKER est remplace par un faux, pour ne jamais appeler api.linear.app.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Feedback } from "@/lib/domain/feedback";
import type { EtatTicket, TicketCree, TicketTracker } from "@/lib/ports/ticket-tracker";
import { etatLinearPourStatut } from "@/lib/domain/feedback-linear";

/** Faux tracker : enregistre ce qu'on lui demande, rend ce qu'on lui a prepare. */
class TrackerFactice implements TicketTracker {
  actif = true;
  creees: Feedback[] = [];
  etats: EtatTicket[] = [];
  renommes: { issueId: string; titre: string }[] = [];
  /** Titre dont la creation doit echouer (pour tester l'isolation des erreurs). */
  echoueSur?: string;
  private seq = 0;

  estActif(): boolean {
    return this.actif;
  }

  async creerTicket(remontee: Feedback): Promise<TicketCree> {
    if (this.echoueSur && remontee.titre === this.echoueSur) {
      throw new Error("Linear : création du ticket refusée.");
    }
    this.creees.push(remontee);
    const n = ++this.seq;
    const issueId = `uuid-${n}`;
    const identifiant = `REA-${100 + n}`;
    // On IMITE le vrai adapter : le ticket naît dans l'état déduit du statut, et cet
    // état est immédiatement lisible par le retour du même passage. C'est ce qui rend
    // le test de non-régression du triage significatif.
    const typeEtat = etatLinearPourStatut(remontee.statut);
    this.etats.push({ issueId, identifiant, titre: remontee.titre, nomEtat: typeEtat, typeEtat });
    return { issueId, identifiant, url: `https://linear.app/real31/issue/${identifiant}` };
  }

  async renommerTicket(issueId: string, titre: string): Promise<void> {
    const e = this.etats.find((x) => x.issueId === issueId);
    if (e) e.titre = titre;
    this.renommes.push({ issueId, titre });
  }

  async lireEtats(issueIds: readonly string[]): Promise<EtatTicket[]> {
    return this.etats.filter((e) => issueIds.includes(e.issueId));
  }
}

const tracker = new TrackerFactice();

vi.mock("@/lib/adapters/router", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("@/lib/adapters/router")>();
  return { ...vrai, getTicketTracker: () => tracker };
});

const { synchroniserLinear } = await import("./synchroniser-linear");
const { getFeedbackRepository } = await import("@/lib/adapters/router");
const { creerFeedback } = await import("./creer-feedback");
const { creerEntreeAdmin } = await import("./creer-entree-admin");
const { changerStatutFeedback } = await import("./changer-statut");

beforeEach(() => {
  tracker.creees = [];
  tracker.etats = [];
  tracker.renommes = [];
  tracker.echoueSur = undefined;
  tracker.actif = true;
});

describe("synchroniserLinear - l'aller", () => {
  it("pousse une remontée de collaborateur et la rattache à son ticket", async () => {
    const f = await creerFeedback(
      { type: "bug", description: "Le CS supplémentaire n'est pas facturable", severite: "genant" },
      { email: "remi.bard@real31.fr" },
    );

    const bilan = await synchroniserLinear();

    expect(bilan.actif).toBe(true);
    expect(bilan.pousses.map((p) => p.id)).toContain(f.id);
    expect(tracker.creees.map((c) => c.id)).toContain(f.id);

    // Le rattachement est bien ECRIT : c'est lui qui rend le cron idempotent.
    const relu = await getFeedbackRepository().get(f.id);
    expect(relu?.linearIssueId).toBeTruthy();
    expect(relu?.linearIdentifiant).toMatch(/^REA-\d+$/);
    expect(relu?.linearSyncAt).toBeTruthy();
  });

  it("ne repousse pas une remontée déjà rattachée (idempotence)", async () => {
    await creerFeedback(
      { type: "bug", description: "Doublon à éviter", severite: "bloquant" },
      { email: "sekou.koma@real31.fr" },
    );
    await synchroniserLinear();
    const premierLot = tracker.creees.length;
    expect(premierLot).toBeGreaterThan(0);

    tracker.creees = [];
    await synchroniserLinear();
    expect(tracker.creees).toHaveLength(0);
  });

  it("ignore les entrées « maison » de l'admin", async () => {
    const maison = await creerEntreeAdmin(
      { type: "idee", titre: "Nouveauté du changelog", statut: "livre" },
      { email: "sekou.koma@real31.fr" },
    );
    const bilan = await synchroniserLinear();
    expect(tracker.creees.map((c) => c.id)).not.toContain(maison.id);
    expect(bilan.ignorees).toBeGreaterThan(0);
    expect((await getFeedbackRepository().get(maison.id))?.linearIssueId).toBeUndefined();
  });

  // Un raté sur une remontée ne doit pas emporter les autres : le passage du
  // lendemain la reprendra puisque rien n'aura été écrit pour elle.
  it("isole un échec de création et continue le lot", async () => {
    const casse = await creerFeedback(
      { type: "bug", description: "Celle qui casse", severite: "genant" },
      { email: "a@real31.fr" },
    );
    const ok = await creerFeedback(
      { type: "bug", description: "Celle qui passe", severite: "genant" },
      { email: "b@real31.fr" },
    );
    tracker.echoueSur = casse.titre;

    const bilan = await synchroniserLinear();

    expect(bilan.erreurs.some((e) => e.quoi.includes("Celle qui casse"))).toBe(true);
    expect(bilan.pousses.map((p) => p.id)).toContain(ok.id);
    expect((await getFeedbackRepository().get(casse.id))?.linearIssueId).toBeUndefined();
    expect((await getFeedbackRepository().get(ok.id))?.linearIssueId).toBeTruthy();
  });

  // LE bug trouvé à la simulation du premier passage : 25 des 67 remontées à pousser
  // étaient déjà triées, et l'aller les faisait naître en Backlog -> le retour du même
  // passage les ramenait à `nouveau`, hors de /nouveautes.
  it("ne dégrade PAS une remontée déjà triée (aller + retour dans le même passage)", async () => {
    const repo = getFeedbackRepository();
    const f = await creerFeedback(
      { type: "idee", description: "Déjà triée avant le pont", severite: "genant" },
      { email: "d@real31.fr" },
    );
    await changerStatutFeedback(f.id, "prevu", { par: "sekou.koma@real31.fr" });
    expect((await repo.get(f.id))?.statut).toBe("prevu");

    await synchroniserLinear();

    const relu = await repo.get(f.id);
    expect(relu?.linearIssueId).toBeTruthy();
    expect(relu?.statut).toBe("prevu");
  });

  it("ne fait rien du tout quand Linear n'est pas configuré", async () => {
    tracker.actif = false;
    const bilan = await synchroniserLinear();
    expect(bilan.actif).toBe(false);
    expect(bilan.pousses).toHaveLength(0);
    expect(tracker.creees).toHaveLength(0);
  });
});

describe("synchroniserLinear - le retour", () => {
  async function remonteePoussee(description: string): Promise<Feedback> {
    const f = await creerFeedback({ type: "bug", description, severite: "genant" }, { email: "c@real31.fr" });
    await synchroniserLinear();
    const relu = await getFeedbackRepository().get(f.id);
    if (!relu?.linearIssueId) throw new Error("la remontée n'a pas été poussée");
    return relu;
  }

  it("réaligne le statut depuis l'état Linear et date la livraison", async () => {
    const f = await remonteePoussee("Récap AG absent de l'app");
    tracker.etats = [
      {
        issueId: f.linearIssueId!,
        identifiant: f.linearIdentifiant!,
        titre: f.titre,
        nomEtat: "Done",
        typeEtat: "completed",
        termineAt: "2026-10-05T14:00:00.000Z",
      },
    ];

    const bilan = await synchroniserLinear();

    expect(bilan.realignes).toEqual(
      expect.arrayContaining([{ identifiant: f.linearIdentifiant, de: "nouveau", vers: "livre" }]),
    );
    const relu = await getFeedbackRepository().get(f.id);
    expect(relu?.statut).toBe("livre");
    expect(relu?.livreAt).toBe("2026-10-05T14:00:00.000Z");
  });

  it("écarte avec une raison quand le ticket est annulé (le domaine l'exige)", async () => {
    const f = await remonteePoussee("Idée abandonnée");
    tracker.etats = [
      {
        issueId: f.linearIssueId!,
        identifiant: f.linearIdentifiant!,
        titre: f.titre,
        nomEtat: "Canceled",
        typeEtat: "canceled",
      },
    ];

    await synchroniserLinear();

    const relu = await getFeedbackRepository().get(f.id);
    expect(relu?.statut).toBe("ecarte");
    expect(relu?.raisonEcart).toBe(`Canceled dans Linear (${f.linearIdentifiant})`);
  });

  // C'est le prix assumé du "une seule saisie" : Linear est la source de vérité, donc
  // le retour court-circuite verifierTransition (`livre` est terminal côté domaine).
  it("ramène une remontée livrée en cours si le ticket repart en arrière", async () => {
    const f = await remonteePoussee("Celle qui repart");
    tracker.etats = [
      { issueId: f.linearIssueId!, identifiant: f.linearIdentifiant!,
        titre: f.titre, nomEtat: "Done", typeEtat: "completed", termineAt: "2026-10-05T14:00:00.000Z" },
    ];
    await synchroniserLinear();
    expect((await getFeedbackRepository().get(f.id))?.statut).toBe("livre");

    tracker.etats = [
      { issueId: f.linearIssueId!, identifiant: f.linearIdentifiant!,
        titre: f.titre, nomEtat: "In Progress", typeEtat: "started" },
    ];
    await synchroniserLinear();

    const relu = await getFeedbackRepository().get(f.id);
    expect(relu?.statut).toBe("en_cours");
    // La date de livraison est RETIREE : sinon /nouveautes daterait une livraison annulée.
    expect(relu?.livreAt).toBeUndefined();
  });

  it("ne touche à rien sur un état Linear inconnu", async () => {
    const f = await remonteePoussee("État maison dans Linear");
    tracker.etats = [
      { issueId: f.linearIssueId!, identifiant: f.linearIdentifiant!,
        titre: f.titre, nomEtat: "À chiffrer", typeEtat: "etat_maison" },
    ];

    const bilan = await synchroniserLinear();

    expect(bilan.realignes.some((r) => r.identifiant === f.linearIdentifiant)).toBe(false);
    expect((await getFeedbackRepository().get(f.id))?.statut).toBe("nouveau");
  });

  // Le titre est porté par la base (c'est lui qui s'affiche sur /nouveautes) : après
  // reformulation au triage, le cron pousse la même phrase dans Linear pour que les
  // deux surfaces ne montrent pas deux libellés de la même chose.
  it("renomme le ticket après reformulation du titre au triage", async () => {
    const repo = getFeedbackRepository();
    const f = await remonteePoussee("qd on clic ca marche pas la recherche copro");
    expect(tracker.renommes).toHaveLength(0);

    await repo.patch(f.id, { titre: "La recherche trouve les copros de toute l'équipe" });
    await synchroniserLinear();

    expect(tracker.renommes).toEqual([
      { issueId: f.linearIssueId, titre: "La recherche trouve les copros de toute l'équipe" },
    ]);

    // Idempotent : une fois les deux titres égaux, plus aucun renommage.
    tracker.renommes = [];
    await synchroniserLinear();
    expect(tracker.renommes).toHaveLength(0);
  });

  // Archivé = hors du pont DANS LES DEUX SENS. Le filtre n'était d'abord que sur
  // l'aller, et cette asymétrie laissait le retour réécrire le statut d'une entrée
  // que l'admin avait délibérément masquée.
  it("laisse tranquille une remontée archivée, même si son ticket bouge", async () => {
    const repo = getFeedbackRepository();
    const f = await remonteePoussee("Sujet archivé volontairement");
    await repo.patch(f.id, { archive: true });

    tracker.etats = [
      { issueId: f.linearIssueId!, identifiant: f.linearIdentifiant!, titre: f.titre, nomEtat: "Canceled", typeEtat: "canceled" },
    ];
    const bilan = await synchroniserLinear();

    expect(bilan.archivees).toBeGreaterThan(0);
    expect(bilan.realignes.some((r) => r.identifiant === f.linearIdentifiant)).toBe(false);
    const relu = await repo.get(f.id);
    expect(relu?.statut).toBe("nouveau");
    expect(relu?.raisonEcart).toBeUndefined();
    // Et elle n'est pas comptée comme orpheline : elle est hors du pont, pas perdue.
    expect(bilan.orphelins).not.toContain(f.linearIdentifiant);

    await repo.patch(f.id, { archive: false }); // ne pas polluer le STORE partagé
  });

  // Ticket effacé à la main dans Linear : on le SIGNALE sans délier, sinon le passage
  // suivant recréerait un ticket, en boucle.
  it("signale un ticket orphelin sans le délier", async () => {
    const f = await remonteePoussee("Ticket supprimé dans Linear");
    tracker.etats = [];

    const bilan = await synchroniserLinear();

    expect(bilan.orphelins).toContain(f.linearIdentifiant);
    expect((await getFeedbackRepository().get(f.id))?.linearIssueId).toBe(f.linearIssueId);
  });
});
