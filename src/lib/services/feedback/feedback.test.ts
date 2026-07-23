// Tests des services feedback (adapters MOCK par defaut, COPRO_SOURCE non defini) :
//  - creerFeedback : l'auteur vient bien du 2e argument (session), pas de la saisie ;
//  - getNouveautes : la vitrine EXCLUT nouveau/ecarte et n'expose aucun champ interne ;
//  - changerStatutFeedback : valide la transition via le domaine, pose livre_at.
// Le STORE mock est module-level (partage entre les it) -> on verifie par IDENTITE des
// remontees creees, jamais par comptage absolu.

import { describe, expect, it } from "vitest";
import { creerFeedback } from "./creer-feedback";
import { creerEntreeAdmin } from "./creer-entree-admin";
import { getNouveautes } from "./get-nouveautes";
import { changerStatutFeedback } from "./changer-statut";
import { getFeedbackRepository } from "@/lib/adapters/router";
import { estArchivee, estVisiblePublic } from "@/lib/domain/feedback";

describe("creerFeedback (auteur deduit de la session)", () => {
  it("porte l'auteur passe en 2e argument, jamais un auteur venu de la saisie", async () => {
    const f = await creerFeedback(
      { type: "bug", description: "Le bouton X ne répond pas", severite: "genant", page: "/copropriete/S104" },
      { email: "sekou.koma@real31.fr", initiales: "SK" },
    );
    expect(f.statut).toBe("nouveau");
    expect(f.auteurEmail).toBe("sekou.koma@real31.fr");
    expect(f.auteurInitiales).toBe("SK");
    expect(f.page).toBe("/copropriete/S104");
    // La saisie n'a aucun canal "auteur" (le type SaisieFeedback l'interdit) : meme si un
    // client bricole un champ auteur, il est ignore - seul le 2e argument fait foi.
    const bricole = await creerFeedback(
      // @ts-expect-error - auteurEmail n'existe pas dans SaisieFeedback ; ignore a l'execution.
      { type: "bug", description: "tentative d'injection", severite: "confort", auteurEmail: "pirate@x.fr" },
      { email: "vrai.auteur@real31.fr" },
    );
    expect(bricole.auteurEmail).toBe("vrai.auteur@real31.fr");
  });

  it("derive un titre depuis la description", async () => {
    const f = await creerFeedback(
      { type: "idee", description: "  Ajouter un   export CSV  ", severite: "confort" },
      { initiales: "EL" },
    );
    expect(f.titre).toBe("Ajouter un export CSV");
  });
});

describe("creerEntreeAdmin (entree « maison » : nouveaute / roadmap)", () => {
  it("cree directement au statut choisi, avec le titre FOURNI (jamais derive)", async () => {
    const f = await creerEntreeAdmin(
      { type: "idee", titre: "Nouvel accueil", statut: "prevu", description: "Une longue description qui NE doit PAS devenir le titre." },
      { email: "sekou.koma@real31.fr", initiales: "SK" },
    );
    expect(f.statut).toBe("prevu");
    // Titre fourni tel quel, pas derive de la description.
    expect(f.titre).toBe("Nouvel accueil");
    expect(f.livreAt).toBeUndefined();
    // Pas de severite sur une entree « maison ».
    expect(f.severite).toBeUndefined();
    expect(f.auteurInitiales).toBe("SK");
  });

  it("pose livreAt quand l'entree naît directement en `livre` (date du changelog)", async () => {
    const f = await creerEntreeAdmin(
      { type: "idee", titre: "Facturation de la gestion courante", statut: "livre" },
      { initiales: "SK" },
    );
    expect(f.statut).toBe("livre");
    expect(f.livreAt).toBeTruthy();
  });

  it("apparaît dans la vitrine /nouveautes quand creee en `livre`, sans champ interne", async () => {
    const f = await creerEntreeAdmin(
      { type: "idee", titre: "Espace comptable dédié", statut: "livre", description: "Note interne éventuelle" },
      { email: "prive-admin@real31.fr", initiales: "SK" },
    );
    const { livre } = await getNouveautes();
    const cible = livre.find((e) => e.titre === f.titre);
    expect(cible).toBeDefined();
    expect(JSON.stringify(livre)).not.toContain("prive-admin@real31.fr");
    expect(cible).not.toHaveProperty("description");
    expect(cible).not.toHaveProperty("auteurEmail");
  });
});

describe("getNouveautes (filtre public)", () => {
  it("EXCLUT nouveau et ecarte, ne montre que prevu/en_cours/livre, sans champ interne", async () => {
    // Une remontee de chaque statut, avec un auteur (PII) reconnaissable.
    const nouveau = await creerFeedback(
      { type: "bug", description: "Remontée restée à trier", severite: "bloquant" },
      { email: "prive@real31.fr" },
    );
    const prevu = await creerFeedback(
      { type: "idee", description: "Export CSV des copros", severite: "confort" },
      { email: "prive@real31.fr" },
    );
    const ecarte = await creerFeedback(
      { type: "bug", description: "Doublon d'une autre remontée", severite: "genant" },
      { email: "prive@real31.fr" },
    );
    await changerStatutFeedback(prevu.id, "prevu");
    await changerStatutFeedback(ecarte.id, "ecarte", { raisonEcart: "doublon" });

    const { aVenir, livre } = await getNouveautes();
    const tous = [...aVenir, ...livre];
    const titres = tous.map((e) => e.titre);

    // Le prevu est visible ; le nouveau et l'ecarte ne le sont pas.
    expect(titres).toContain(prevu.titre);
    expect(titres).not.toContain(nouveau.titre);
    expect(titres).not.toContain(ecarte.titre);

    // L'auteur (PII) ne fuit JAMAIS dans la projection publique.
    const json = JSON.stringify(tous);
    expect(json).not.toContain("prive@real31.fr");
    for (const e of tous) {
      expect(Object.keys(e).sort()).toEqual(
        expect.arrayContaining(["type", "titre", "statut"]),
      );
      expect(e).not.toHaveProperty("auteurEmail");
      expect(e).not.toHaveProperty("description");
      expect(e).not.toHaveProperty("noteInterne");
    }
  });
});

describe("archivage (masquage REVERSIBLE)", () => {
  it("estArchivee / estVisiblePublic : une entree livre archivee n'est plus visible du public", () => {
    expect(estArchivee({ archiveAt: "2026-07-23T10:00:00Z" })).toBe(true);
    expect(estArchivee({})).toBe(false);
    expect(estVisiblePublic({ statut: "livre" })).toBe(true);
    expect(estVisiblePublic({ statut: "livre", archiveAt: "2026-07-23T10:00:00Z" })).toBe(false);
    // archivee mais statut non public : de toute facon invisible.
    expect(estVisiblePublic({ statut: "nouveau" })).toBe(false);
  });

  it("archiver une entree livree la retire de /nouveautes ; desarchiver la remet", async () => {
    const f = await creerEntreeAdmin(
      { type: "idee", titre: "Entrée à masquer un jour", statut: "livre" },
      { initiales: "SK" },
    );
    const repo = getFeedbackRepository();

    // Presente au depart.
    expect((await getNouveautes()).livre.some((e) => e.titre === f.titre)).toBe(true);

    // Archivee -> disparue de la vitrine, mais toujours en base (get la retrouve, archiveAt pose).
    const arch = await repo.patch(f.id, { archive: true });
    expect(arch?.archiveAt).toBeTruthy();
    expect((await getNouveautes()).livre.some((e) => e.titre === f.titre)).toBe(false);
    expect(await repo.get(f.id)).not.toBeNull();

    // Desarchivee -> reapparait.
    const rest = await repo.patch(f.id, { archive: false });
    expect(rest?.archiveAt).toBeUndefined();
    expect((await getNouveautes()).livre.some((e) => e.titre === f.titre)).toBe(true);
  });

  it("editer la description et le type d'une entree existante", async () => {
    const f = await creerEntreeAdmin({ type: "idee", titre: "Entrée éditable", statut: "prevu" }, { initiales: "SK" });
    const repo = getFeedbackRepository();
    const maj = await repo.patch(f.id, { description: "Texte ajouté après coup", type: "bug" });
    expect(maj?.description).toBe("Texte ajouté après coup");
    expect(maj?.type).toBe("bug");
  });
});

describe("changerStatutFeedback (transition via le domaine)", () => {
  it("refuse une transition hors cycle (nouveau -> livre)", async () => {
    const f = await creerFeedback({ type: "bug", description: "saut interdit", severite: "confort" }, {});
    const r = await changerStatutFeedback(f.id, "livre");
    expect(r).toEqual({ ok: false, refus: "transition_interdite" });
  });

  it("refuse d'ecarter sans raison, accepte avec raison", async () => {
    const f = await creerFeedback({ type: "bug", description: "à écarter", severite: "confort" }, {});
    expect(await changerStatutFeedback(f.id, "ecarte")).toEqual({ ok: false, refus: "raison_ecart_requise" });
    const ok = await changerStatutFeedback(f.id, "ecarte", { raisonEcart: "hors périmètre" });
    expect(ok.ok).toBe(true);
  });

  it("pose livre_at au passage a livre (via en_cours)", async () => {
    const f = await creerFeedback({ type: "idee", description: "à livrer", severite: "confort" }, {});
    await changerStatutFeedback(f.id, "en_cours");
    const r = await changerStatutFeedback(f.id, "livre");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.feedback.statut).toBe("livre");
      expect(r.feedback.livreAt).toBeTruthy();
    }
  });

  it("introuvable -> refus propre", async () => {
    expect(await changerStatutFeedback("inexistant", "prevu")).toEqual({ ok: false, refus: "introuvable" });
  });
});
