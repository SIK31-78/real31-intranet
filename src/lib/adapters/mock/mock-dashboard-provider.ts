// Adapter mock du dashboard : donnees en memoire, zero dependance externe.
// Sert au dev et aux tests tant que Supabase / Estale ne sont pas branches.
// Cf. ADR-001. Un adapter ne depend que du domaine et des ports, jamais d'un autre adapter.

import type { DashboardProvider } from "@/lib/ports/dashboard-provider";
import type { DashboardData } from "@/lib/domain/dashboard";

// Portefeuille fictif coherent : cabinet REAL31, gestionnaire EL, copros La Garenne-Colombes (92).
const DONNEES: DashboardData = {
  gestionnaire: { id: "el", nomComplet: "Élise Lambert", initiales: "EL" },
  dateCourante: "Mercredi 27 mai 2026",

  // 3 compteurs ACTIONNABLES (des piles de travail, pas des totaux a contempler).
  compteurs: [
    {
      id: "convocations",
      label: "À envoyer",
      valeur: 3,
      unite: "convocations",
      detail: "cette semaine",
      detailFort: "1 en retard",
      severiteDetail: "late",
      icone: "send",
    },
    {
      id: "ag-en-retard",
      label: "À planifier",
      valeur: 2,
      unite: "AG en retard",
      detail: "pas d'AG depuis > 11 mois",
      icone: "calendar-clock",
    },
    {
      id: "sinistres",
      label: "À traiter",
      valeur: 2,
      unite: "sinistres actifs",
      detail: "dont 1 en attente de devis",
      icone: "alert-triangle",
    },
  ],

  // Liste "Ce qui demande votre attention", deja triee par urgence (late -> soon -> ok).
  attention: [
    {
      id: "a1",
      jalon: { label: "+2 j", severite: "late" },
      coproCode: "S104",
      titre: "Résidence Les Marronniers - convocation en retard",
      badge: { texte: "Légal dépassé", ton: "err" },
    },
    {
      id: "a2",
      jalon: { label: "+1 j", severite: "late" },
      coproCode: "S067",
      titre: "Résidence Nationale - relance des pouvoirs en retard",
      echeance: "26/05",
    },
    {
      id: "a3",
      jalon: { label: "J‑2", severite: "soon" },
      coproCode: "S016",
      titre: "12 boulevard de la République - convocation à envoyer",
      echeance: "29/05",
    },
    {
      id: "a4",
      jalon: { label: "J‑3", severite: "soon" },
      coproCode: "S132",
      titre: "Le Médéric - valider l'ordre du jour avec le CS",
      echeance: "30/05",
    },
    {
      id: "a5",
      jalon: { label: "J‑5", severite: "soon" },
      coproCode: "S088",
      titre: "Résidence Foch - relance des pouvoirs et présences",
      echeance: "01/06",
    },
    {
      id: "a6",
      jalon: { label: "J‑6", severite: "soon" },
      coproCode: "S073",
      titre: "Le Clos Voltaire - préparer les supports d'AG",
      echeance: "02/06",
    },
    {
      id: "a7",
      jalon: { label: "J‑9", severite: "ok" },
      coproCode: "S019",
      titre: "5 rue de l'Aigle - convocation interne REAL31",
      echeance: "05/06",
    },
    {
      id: "a8",
      jalon: { label: "J‑12", severite: "ok" },
      coproCode: "S121",
      titre: "Villa des Vallées - préparer les supports d'AG",
      echeance: "08/06",
    },
    {
      id: "a9",
      jalon: { label: "J‑15", severite: "ok" },
      coproCode: "S150",
      titre: "Les Bourguignons - relance des copropriétaires",
      echeance: "11/06",
    },
    {
      id: "a10",
      jalon: { label: "J‑18", severite: "ok" },
      coproCode: "S045",
      titre: "8 rue Sartoris - envoyer le PV de la dernière AG",
      echeance: "14/06",
    },
  ],

  // Flux d'activite recente (lecture seule, discret).
  activite: [
    { id: "ac1", icone: "file-check", tonIcone: "ok", texte: "PV de l'AG publié", coproCode: "S121", quand: "il y a 2 h" },
    { id: "ac2", icone: "mail", tonIcone: "info", texte: "3 mails copropriétaires", coproCode: "S016", quand: "il y a 4 h" },
    { id: "ac3", icone: "banknote", tonIcone: "neutral", texte: "Devis ascenseur reçu", coproCode: "S088", quand: "hier, 16:40" },
    { id: "ac4", icone: "vote", tonIcone: "neutral", texte: "5 pouvoirs reçus", coproCode: "S104", quand: "hier, 11:15" },
    { id: "ac5", icone: "file-text", tonIcone: "neutral", texte: "Convocation envoyée", coproCode: "S045", quand: "hier, 09:30" },
    { id: "ac6", icone: "alert-triangle", tonIcone: "neutral", texte: "Sinistre dégât des eaux signalé", coproCode: "S067", quand: "avant-hier" },
  ],
};

export class MockDashboardProvider implements DashboardProvider {
  // Le mock ignore l'id pour l'instant (un seul portefeuille fictif, EL) : on omet
  // simplement le parametre. En TS une implementation peut accepter moins d'arguments
  // que l'interface, donc le contrat DashboardProvider reste satisfait.
  async getDashboard(): Promise<DashboardData> {
    return DONNEES;
  }
}
