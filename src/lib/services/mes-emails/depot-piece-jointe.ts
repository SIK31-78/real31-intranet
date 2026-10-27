// Service : les fichiers de l'ordinateur joints à une réponse, déposés sur le brouillon déjà
// préparé, une tranche à la fois (REA-421, 27/10/2026). Avant, ils voyageaient en base64 dans
// l'action d'envoi : au-delà de 4,5 Mo par requête, Vercel coupait, et Graph refusait une pièce
// de plus de 3 Mo en un seul POST. Maintenant : le navigateur envoie chaque fichier par tranches
// de 3,75 Mio à la route de dépôt ; sous 3 Mo, un POST simple ; au-delà, une session d'upload
// Graph ouverte à la première tranche, dont l'URL voyage chiffrée dans un jeton.

import { getMailOutboundProvider } from "@/lib/adapters/router";
import { TAILLE_ENVOI_SIMPLE, TAILLE_MAX_FICHIER, TRANCHE_UPLOAD, typePieceJointe } from "@/lib/domain/piece-jointe-flux";
import { DUREE_JETON_MS, ouvrirJeton, scellerJeton, type JetonBrouillon } from "./jeton-envoi";

export type ResultatDepot = { ok: true; fini: boolean; session?: string } | { ok: false; statut: number; erreur: string };

const refus = (statut: number, erreur: string): ResultatDepot => ({ ok: false, statut, erreur });

const ENVOI_EXPIRE = "L'envoi a expiré (15 minutes) : recommence l'envoi.";

/** Le brouillon du jeton, s'il appartient bien à la personne connectée. */
export function brouillonDe(jeton: string, gid: string): JetonBrouillon | null {
  const j = ouvrirJeton(jeton, "brouillon");
  return j && j.gid === gid ? j : null;
}

export async function deposerTranche(p: {
  jeton: string;
  /** Jeton de session d'upload rendu par la tranche précédente (absent à la première). */
  session: string | null;
  gid: string;
  nom: string;
  type: string;
  taille: number;
  debut: number;
  octets: Uint8Array;
}): Promise<ResultatDepot> {
  const brouillon = brouillonDe(p.jeton, p.gid);
  if (!brouillon) return refus(410, ENVOI_EXPIRE);
  const nom = p.nom.trim();
  if (!nom || nom.length > 255) return refus(400, "Nom de fichier invalide.");
  if (!Number.isSafeInteger(p.taille) || p.taille < 1) return refus(400, `« ${nom} » est vide.`);
  if (p.taille > TAILLE_MAX_FICHIER) return refus(413, `« ${nom} » dépasse 25 Mo : à déposer sur SharePoint et à envoyer en lien.`);
  // Les tranches arrivent dans l'ordre, chacune pleine sauf la dernière.
  const attendue = Math.min(TRANCHE_UPLOAD, p.taille - p.debut);
  if (!Number.isSafeInteger(p.debut) || p.debut < 0 || p.debut % TRANCHE_UPLOAD !== 0 || p.debut >= p.taille || p.octets.byteLength !== attendue) {
    return refus(400, "Tranche de fichier invalide.");
  }
  const sortant = getMailOutboundProvider();
  const contentType = p.type.trim() || typePieceJointe(nom, null);
  try {
    if (p.taille < TAILLE_ENVOI_SIMPLE) {
      await sortant.ajouterPieceJointe({ boite: brouillon.boite, draftId: brouillon.draftId, nom, contentType, octets: p.octets });
      return { ok: true, fini: true };
    }
    let uploadUrl: string;
    if (p.debut === 0) {
      if (p.session) return refus(400, "Tranche de fichier invalide.");
      ({ uploadUrl } = await sortant.ouvrirSessionUpload({ boite: brouillon.boite, draftId: brouillon.draftId, nom, contentType, taille: p.taille }));
    } else {
      const s = p.session ? ouvrirJeton(p.session, "upload") : null;
      if (!s || s.gid !== p.gid || s.draftId !== brouillon.draftId) return refus(410, ENVOI_EXPIRE);
      if (s.nom !== nom || s.taille !== p.taille) return refus(400, "Tranche de fichier invalide.");
      uploadUrl = s.uploadUrl;
    }
    const { fini } = await sortant.envoyerTranche({ uploadUrl, debut: p.debut, octets: p.octets, taille: p.taille });
    if (fini) return { ok: true, fini: true };
    const session = scellerJeton({ nature: "upload", uploadUrl, draftId: brouillon.draftId, gid: p.gid, nom, taille: p.taille, exp: Date.now() + DUREE_JETON_MS });
    return { ok: true, fini: false, session };
  } catch (e) {
    console.warn("[mes-emails] dépôt de pièce jointe refusé :", e instanceof Error ? e.message : e);
    return refus(502, `Outlook a refusé « ${nom} ». Réessaie, ou envoie-le depuis Outlook.`);
  }
}

/** Le brouillon préparé part (mode « envoyer », garde d'envoi passée à la préparation). */
export async function envoyerBrouillonPrepare(j: JetonBrouillon): Promise<void> {
  await getMailOutboundProvider().envoyerBrouillon({ boite: j.boite, id: j.draftId });
}

/** Un fichier n'a pas pu être joint : le brouillon incomplet est retiré de la boîte. */
export async function abandonnerBrouillonPrepare(j: JetonBrouillon): Promise<void> {
  await getMailOutboundProvider().supprimerBrouillon({ boite: j.boite, id: j.draftId });
}
