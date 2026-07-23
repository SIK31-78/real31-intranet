// GET /api/v1/copros/{code} - la fiche d'une copropriete : identite, dates AG/CS,
// equipe (collaborateurs cabinet), cycle AG avec l'action du moment, jalons, conformite.
// Handler MINCE sur getFicheCopro (le service de la fiche UI).
//
// ZERO PII coproprietaires : le conseil syndical (noms/emails d'owners), les debiteurs
// et tout champ nominatif d'owner sont VOLONTAIREMENT absents de la reponse - seuls
// les champs referentiels + metier sortent. L'equipe (gestionnaire/assistant...) est
// composee de collaborateurs REAL31, pas de coproprietaires.

import { z } from "zod";
import { avecCleApi, erreurJson, okJson } from "@/lib/auth/cle-api";
import { getFicheCopro } from "@/lib/services/fiche-copro/get-fiche-copro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const zCode = z.string().trim().min(1).max(40);

type Ctx = { params: Promise<{ code: string }> };

export const GET = avecCleApi<Ctx>("lecture", async (_req, ctx, acces) => {
  const { code } = await ctx.params;
  if (!zCode.safeParse(code).success) {
    return erreurJson(400, "parametres_invalides", "Code de copropriété invalide.");
  }
  const today = new Date().toISOString().slice(0, 10);

  // Cle gestionnaire : lecture CLOISONNEE (hors portefeuille -> null -> 404, anti-IDOR).
  // Cle cabinet : lecture transverse (meme regle que le pole comptable dans l'UI).
  const fiche = acces.managerId
    ? await getFicheCopro(code, acces.managerId, today)
    : await getFicheCopro(code, "", today, { transverse: true });
  if (!fiche) return erreurJson(404, "introuvable", "Copropriété inconnue ou hors périmètre.");

  const c = fiche.copro;
  return okJson({
    copro: {
      code: c.code,
      nom: c.nom,
      source: c.source,
      statut: c.statut,
      adresse: c.adresse,
      lotsPrincipaux: c.lotsPrincipaux,
      lotsAutres: c.lotsAutres,
      exercice: c.exercice,
      priseEnGestion: c.priseEnGestion,
      ...(c.nomSdc ? { nomSdc: c.nomSdc } : {}),
      ...(c.immatriculation ? { immatriculation: c.immatriculation } : {}),
      ...(c.pptVote !== undefined ? { pptVote: c.pptVote } : {}),
      ...(c.agConnect !== undefined ? { agConnect: c.agConnect } : {}),
      ...(c.assuranceEcheance ? { assuranceEcheance: c.assuranceEcheance } : {}),
      ...(c.mandatSyndicFin ? { mandatSyndicFin: c.mandatSyndicFin } : {}),
      ...(c.derniereAgDate ? { derniereAgDate: c.derniereAgDate } : {}),
      ...(c.prochaineAg
        ? {
            prochaineAg: {
              date: c.prochaineAg.date,
              statut: c.prochaineAg.statut,
              ...(c.prochaineAg.heure ? { heure: c.prochaineAg.heure } : {}),
              ...(c.prochaineAg.supervisionId ? { supervisionId: c.prochaineAg.supervisionId } : {}),
            },
          }
        : {}),
      ...(c.derniereCsDate ? { derniereCsDate: c.derniereCsDate } : {}),
      ...(c.prochaineCsDate ? { prochaineCsDate: c.prochaineCsDate } : {}),
      ...(c.prochaineCsHeure ? { prochaineCsHeure: c.prochaineCsHeure } : {}),
      ...(fiche.agenceCode ? { agence: fiche.agenceCode } : {}),
    },
    equipe: c.equipe.map((m) => ({ nomComplet: m.nomComplet, initiales: m.initiales, role: m.role })),
    ...(fiche.cycle
      ? {
          cycle: {
            etat: fiche.cycle.etat,
            enRetard: fiche.cycle.enRetard,
            etapeCourante: fiche.cycle.etapeCourante,
            actionDuMoment: fiche.cycle.actionDuMoment,
            ...(fiche.cycle.echeance ? { echeance: fiche.cycle.echeance } : {}),
          },
        }
      : {}),
    jalons: fiche.jalons.map((j) => ({
      code: j.code,
      libelle: j.libelle,
      cibleDate: j.cibleDate,
      source: j.source,
      statut: j.statut,
      ...(j.realiseDate ? { realiseDate: j.realiseDate } : {}),
      ...(j.marquePar ? { marquePar: j.marquePar } : {}),
    })),
    conformite: fiche.conformite,
    historique: fiche.historique.map((h) => ({
      date: h.date,
      type: h.type,
      ...(h.libelle ? { libelle: h.libelle } : {}),
      ...(h.presents !== undefined ? { presents: h.presents } : {}),
      ...(h.total !== undefined ? { total: h.total } : {}),
    })),
    ...(fiche.compta
      ? { compta: { comptesVerifies: fiche.compta.comptesVerifies, envoyerAvant: fiche.compta.envoyerAvant } }
      : {}),
    ...(fiche.confirmationAg ? { confirmationAg: fiche.confirmationAg } : {}),
    ...(fiche.confirmationCs ? { confirmationCs: fiche.confirmationCs } : {}),
    ...(fiche.estaleIndisponible ? { estaleIndisponible: true } : {}),
  });
});
