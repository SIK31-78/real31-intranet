// Adapter mock de l'ecran "Mes evenements". Donnees coherentes avec les autres mocks :
// liens vers la supervision e1 (S104) et vers les fiches copro existantes. Ancre = 2026-05-27.
// Ne depend que du domaine et des ports.

import type { MesEvenementsProvider } from "@/lib/ports/mes-evenements-provider";
import type { MesEvenements } from "@/lib/domain/mes-evenements";

const DATA: MesEvenements = {
  gestionnaire: { nomComplet: "Élise Lambert", initiales: "EL" },
  nbCopros: 23,
  dateCourante: "27 mai 2026",
  actionsCeMois: 12,

  aTraiter: [
    {
      id: "a1",
      titre: "Envoyer les convocations AG",
      badge: { texte: "AUJOURD'HUI", ton: "err" },
      contexte: "S104 · Les Marronniers · AG du 28 mai · délai légal J-21",
      severite: "late",
      lien: "/supervision-ag/e1",
    },
    {
      id: "a2",
      titre: "Récupérer les devis de ravalement",
      badge: { texte: "DANS 3 JOURS", ton: "warn" },
      contexte: "S088 · Résidence Foch · prépa AG du 25 juin · jalon J-45",
      severite: "soon",
      lien: "/copropriete/S088",
    },
    {
      id: "a3",
      titre: "Valider l'ODJ avec le Conseil Syndical",
      badge: { texte: "DANS 6 JOURS", ton: "neutral" },
      contexte: "S045 · Rue Sartoris · CS avant l'AG du 18 juin",
      severite: "ok",
      lien: "/copropriete/S045",
    },
    {
      id: "a4",
      titre: "Planifier l'AG annuelle",
      badge: { texte: "À PROGRAMMER", ton: "err" },
      contexte: "S121 · Villa des Vallées · aucune AG tenue à ce jour",
      severite: "late",
      lien: "/copropriete/S121",
    },
    {
      id: "a5",
      titre: "Relancer les pouvoirs et votes par correspondance",
      badge: { texte: "DANS 24 JOURS", ton: "neutral" },
      contexte: "S104 · Les Marronniers · J-2 avant l'AG du 28 mai",
      severite: "ok",
      lien: "/supervision-ag/e1",
    },
  ],

  agAVenir: [
    {
      id: "ag1",
      coproCode: "S104",
      coproNom: "Les Marronniers",
      date: "2026-05-28",
      heure: "18:30",
      badge: { texte: "DEMAIN", ton: "err" },
      jalonsFaits: 4,
      jalonsTotal: 5,
      prochainJalon: "tenue de l'AG (demain)",
      prochainJalonSeverite: "late",
      lien: "/supervision-ag/e1",
    },
    {
      id: "ag2",
      coproCode: "S045",
      coproNom: "Rue Sartoris",
      date: "2026-06-18",
      heure: "19:00",
      badge: { texte: "DANS 22 JOURS", ton: "neutral" },
      jalonsFaits: 2,
      jalonsTotal: 5,
      prochainJalon: "valider l'ODJ avec le CS (dans 7 jours)",
      prochainJalonSeverite: "soon",
      lien: "/copropriete/S045",
    },
    {
      id: "ag3",
      coproCode: "S088",
      coproNom: "Résidence Foch",
      date: "2026-06-25",
      heure: "18:30",
      badge: { texte: "DANS 29 JOURS", ton: "neutral" },
      jalonsFaits: 2,
      jalonsTotal: 5,
      prochainJalon: "récupérer les devis (dans 3 jours)",
      prochainJalonSeverite: "soon",
      lien: "/copropriete/S088",
    },
  ],

  coprosSansAg: [
    {
      coproCode: "S121",
      coproNom: "Villa des Vallées",
      detail: "Aucune AG tenue à ce jour · à programmer en urgence",
      severite: "late",
      lien: "/copropriete/S121",
    },
    {
      coproCode: "S019",
      coproNom: "Rue de l'Aigle",
      detail: "Dernière AG : 12 mai 2025 · prochaine à programmer avant mai 2026",
      severite: "soon",
      lien: "/copropriete/S019",
    },
  ],
};

export class MockMesEvenementsProvider implements MesEvenementsProvider {
  async getMesEvenements(): Promise<MesEvenements> {
    return DATA;
  }
}
