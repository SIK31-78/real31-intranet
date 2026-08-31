// Domaine PUR de l'auto-save de l'ODJ editable : suivi des brouillons de champs
// entre la frappe et la confirmation serveur. Aucune I/O - le composant client
// (document-odj-editable) orchestre les timers et les server actions, ce module
// ne fait que tenir l'etat et le statut a afficher.
//
// Cycle d'un champ : frappe -> ATTENTE (debounce) -> EN VOL (action partie)
// -> atterrissage (ok : brouillon consomme ; echec : retour en attente + echec
// signale, la valeur n'est jamais perdue). Une nouvelle frappe PENDANT le vol
// prime toujours sur la valeur en vol.

export type StatutSauvegarde = "repos" | "en-attente" | "enregistrement" | "enregistre" | "erreur";

export interface Brouillons {
  /** champId -> valeur tapee, pas encore envoyee (debounce en cours). */
  attente: Record<string, string>;
  /** champId -> valeur partie au serveur, reponse pas encore revenue. */
  enVol: Record<string, string>;
  /** champIds dont le DERNIER envoi a echoue (leur valeur est repassee en attente). */
  echecs: string[];
  /** Au moins une sauvegarde a reussi depuis l'ouverture de la page. */
  dejaEnregistre: boolean;
}

export const BROUILLONS_VIDES: Brouillons = {
  attente: {},
  enVol: {},
  echecs: [],
  dejaEnregistre: false,
};

/** Frappe du gestionnaire : la valeur entre en attente et efface l'echec precedent
 *  du champ (il va etre re-essaye avec la nouvelle valeur). */
export function poserBrouillon(b: Brouillons, champId: string, valeur: string): Brouillons {
  return {
    ...b,
    attente: { ...b.attente, [champId]: valeur },
    echecs: b.echecs.filter((id) => id !== champId),
  };
}

/** Depart d'un envoi : tout ce qui est en attente part en vol. Renvoie l'etat et la
 *  cargaison a envoyer (fige AVANT l'await : ce qui sera tape pendant le vol restera
 *  en attente et repartira au vol suivant). */
export function partirEnVol(b: Brouillons): { etat: Brouillons; cargaison: Record<string, string> } {
  if (Object.keys(b.attente).length === 0) return { etat: b, cargaison: {} };
  return {
    etat: { ...b, attente: {}, enVol: { ...b.enVol, ...b.attente } },
    cargaison: { ...b.attente },
  };
}

/** Atterrissage d'UN champ. ok : brouillon consomme (le serveur fait foi). echec : la
 *  valeur revient en attente pour re-essai - SAUF si une frappe plus recente l'a deja
 *  remplacee (la frappe prime toujours). */
export function atterrir(b: Brouillons, champId: string, ok: boolean): Brouillons {
  const valeurEnVol = b.enVol[champId];
  const enVol = { ...b.enVol };
  delete enVol[champId];
  if (ok) {
    return { ...b, enVol, dejaEnregistre: true, echecs: b.echecs.filter((id) => id !== champId) };
  }
  const dejaRetape = champId in b.attente;
  return {
    ...b,
    enVol,
    attente: dejaRetape || valeurEnVol === undefined ? b.attente : { ...b.attente, [champId]: valeurEnVol },
    echecs: b.echecs.includes(champId) ? b.echecs : [...b.echecs, champId],
  };
}

/** Valeur a AFFICHER pour un champ : le brouillon local prime sur la valeur serveur
 *  (attente = la plus recente, sinon celle en vol), undefined = rien de local. */
export function valeurLocale(b: Brouillons, champId: string): string | undefined {
  if (champId in b.attente) return b.attente[champId];
  return b.enVol[champId];
}

/** Des modifications locales risquent-elles d'etre perdues en quittant la page ? */
export function aDesModifsNonSauvees(b: Brouillons): boolean {
  return Object.keys(b.attente).length > 0 || Object.keys(b.enVol).length > 0;
}

/** Statut global affiche a cote du bouton Enregistrer. L'echec prime (il demande un
 *  geste), puis l'activite en cours, puis le repos. */
export function statutGlobal(b: Brouillons): StatutSauvegarde {
  if (b.echecs.length > 0) return "erreur";
  if (Object.keys(b.enVol).length > 0) return "enregistrement";
  if (Object.keys(b.attente).length > 0) return "en-attente";
  return b.dejaEnregistre ? "enregistre" : "repos";
}
