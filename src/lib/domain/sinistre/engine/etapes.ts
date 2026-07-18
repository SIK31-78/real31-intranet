/**
 * Projection PURE d'un dossier sinistre (parcours DDE) en plan d'action -
 * une liste d'`EtapeDossier` (type domaine de l'intranet, src/lib/domain/dossier).
 *
 * Principe : on ne fabrique RIEN. Les etapes derivent uniquement de donnees
 * REELLES du parcours :
 *   - une etape par COURRIER recommande (selecteur `courriersRecommandes`),
 *   - + les JALONS clefs que le resultat terminal porte explicitement
 *     (expertise si le noeud resultat la mentionne, recours s'il y a lieu).
 * Un local dont le parcours n'est pas termine (`resultat` non atteint) ne
 * contribue a rien : pas d'invention. Multi-locaux : on agrege et on dedoublonne
 * par `id` stable (slug), pour qu'un meme courrier sur deux locaux ne donne qu'une
 * seule etape.
 *
 * Fonction pure : aucun effet de bord, aucune dependance UI / Supabase / next.
 */

import { courriers } from '../data';
import { courriersRecommandes, resultatNode } from './wizard';
import type { DossierState } from '../types';
import type { EtapeDossier } from '@/lib/domain/dossier';

// Titre lisible d'un courrier par son id (les declencheurs renvoient des ids).
const TITRE_COURRIER = new Map(courriers.map((c) => [c.id, c.titre]));

/** Slug stable et sans accents pour un id d'etape (a-z0-9 + tirets). */
function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Projette un dossier sinistre (multi-locaux) en `EtapeDossier[]`.
 *
 * Seuls les locaux TERMINES (noeud resultat atteint) contribuent. Les etapes
 * sont dedoublonnees par `id` (slug stable) : un courrier recommande sur
 * plusieurs locaux, ou un jalon commun, n'apparait qu'une fois. `fait: false`,
 * `assigneA` volontairement omis (l'assignation reste un choix utilisateur).
 *
 * Renvoie `[]` si aucun local n'est termine ou si rien n'est recommande/derive.
 */
export function projeterEtapesDepuisParcours(state: DossierState): EtapeDossier[] {
  const out: EtapeDossier[] = [];
  const vus = new Set<string>();

  const pousser = (id: string, label: string): void => {
    if (vus.has(id)) return;
    vus.add(id);
    out.push({ id, label, fait: false });
  };

  for (const local of state.locaux) {
    const w = local.wizard;
    const res = resultatNode(w);
    // Parcours non termine -> aucune etape (pas d'invention).
    if (!res) continue;

    // Une etape par courrier recommande (dans l'ordre du JSON, cf. selecteur).
    for (const id of courriersRecommandes(w)) {
      const titre = TITRE_COURRIER.get(id) ?? id;
      pousser(`courrier-${slug(id)}`, `Envoyer le courrier ${id} - ${titre}`);
    }

    // Jalons clefs deduits du resultat terminal, uniquement s'ils sont portes
    // explicitement par le noeud (jamais une liste arbitraire).
    if (res.expertise) {
      pousser('jalon-expertise', "Organiser / suivre l'expertise");
    }
    if (res.recours) {
      pousser('jalon-recours', 'Exercer le recours');
    }
  }

  return out;
}
