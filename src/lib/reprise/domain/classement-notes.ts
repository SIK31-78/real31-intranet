// Classement des NOTES d'analyse d'une reprise (domaine PUR, aucune I/O).
//
// Les producteurs (orchestrateur-patrimoine, analyser-dossier, parseur grand livre, couche-texte,
// liaison-comptes, controle-comptes, mapping-compta, auto-checks) emettent des CHAINES PLATES.
// Elles s'affichaient en un seul pave illisible. Ici on les classe SANS toucher aux producteurs
// (retro-compatible avec les jeux deja persistes) via des heuristiques sur des prefixes/motifs
// stables :
//   - niveau : erreur (bloquant) > anomalie (donnee a corriger) > vigilance (a verifier/decider)
//     > info (comptage / statut de pipeline).
//   - source : patrimoine / proprietaires / compta / liaison / autre (regroupement discret en UI).
//
// Defaut robuste : jamais de crash ; une chaine non reconnue tombe en info/autre (ou sur le niveau
// par defaut passe en option, ex. "anomalie" pour les anomalies deja persistees d'un dossier).

export type NiveauNote = "erreur" | "anomalie" | "vigilance" | "info";
export type SourceNote = "patrimoine" | "proprietaires" | "compta" | "liaison" | "autre";

export interface NoteStructuree {
  niveau: NiveauNote;
  source: SourceNote;
  texte: string;
}

export interface OptionsClassement {
  /** Niveau attribue quand aucune heuristique ne tranche (defaut "info"). */
  niveauParDefaut?: NiveauNote;
}

/** Severite croissante : sert au tri et au choix "ouvert / replie par defaut" cote UI. */
export const ORDRE_NIVEAUX: NiveauNote[] = ["erreur", "anomalie", "vigilance", "info"];

// --- Detection de la SOURCE (regroupement discret) --------------------------
// Ordre volontaire : la liaison partage du vocabulaire avec la compta ("compte 450",
// "owner") -> testee en premier ; la compta avant le patrimoine ("compte" vs "cle").

function estLiaison(s: string): boolean {
  return /liaison 450|appariement 450|compte 450|revendique|owner \w+ ?:|homonyme/.test(s);
}

function estCompta(s: string): boolean {
  return /parseur|pipeline|couche texte|controle par compte|contr[oô]le par compte|grand livre|d[eé]s[eé]quilibre|[ée]criture|489|compte \d|classe [1-7]|bloc [abc]|ligne\(s\) [eé]cart[eé]e|fournisseur|balance|comptable|report|solde|sous-total|a-nouveau/.test(s);
}

function estPatrimoine(s: string): boolean {
  return /\bedd\b|\brcp\b|rgdd|tanti[eè]me|\bcl[eé]s?\b|\blots?\b|usage|r[eè]glement|descriptif|division|r[eé]partition|escalier|b[aâ]timent/.test(s);
}

function estProprietaires(s: string): boolean {
  return /\bsci\b|g[eé]rant|k-?bis|civilit[eé]|pr[eé]nom|\bnoms?\b|majuscule|title case|fusion|doublon|copropri[eé]taire|raison sociale|capital|personne morale/.test(s);
}

/** Source d'une note (heuristique sur le contenu). Exportee : les appelants qui forcent un niveau
 * (checks deja typés, anomalies persistees) reutilisent le meme regroupement. */
export function sourceNote(texte: string): SourceNote {
  const s = texte.toLowerCase();
  if (estLiaison(s)) return "liaison";
  if (estCompta(s)) return "compta";
  if (estPatrimoine(s)) return "patrimoine";
  if (estProprietaires(s)) return "proprietaires";
  return "autre";
}

// --- Detection du NIVEAU ----------------------------------------------------

/** Un motif "ecart <n>" ou "<n> en ecart" avec n != 0 -> vraie anomalie (0 -> reconcilie/info). */
function porteUnEcartNonNul(s: string): boolean {
  const motifs = [/ecart\s+(-?\d+(?:[.,]\d+)?)/g, /(\d+(?:[.,]\d+)?)\s+en\s+ecart/g];
  for (const re of motifs) {
    for (const m of s.matchAll(re)) {
      const n = parseFloat(m[1].replace(",", "."));
      if (Number.isFinite(n) && n !== 0) return true;
    }
  }
  return false;
}

function estErreur(s: string): boolean {
  // NB : "couche texte" seul est INFO (note de pipeline "Pipeline COUCHE TEXTE ...") ; seul le
  // message "ne porte pas de couche texte" (scan non exploitable) est une erreur. Idem "hors
  // classes" = comptage d'exclusions (info), a ne pas confondre avec un blocage.
  return /d[eé]s[eé]quilibre|erreur bloquante|avant r[eé]partition|non exploit|ne porte pas de couche texte|impossible|orphelin|introuvable/.test(
    s,
  );
}

function estAnomalie(s: string): boolean {
  return /fusion propos|doublon|hors liste|incompatible|non entier|invalide|sans raison|> 38|non en majuscule|title case|sans lot|absent de la cl[eé]|ecart de total|tanti[eè]me a 0|capital social non|numero de lot en doublon|aucune cl[eé]/.test(
    s,
  );
}

function estVigilance(s: string): boolean {
  return /[àa] trancher|[àa] valider|[àa] v[eé]rifier|\bv[eé]rifier\b|vigilance|[àa] fournir|[àa] analyser|d[eé]cider|validation requise|commentaire absent|non tranchable/.test(
    s,
  );
}

/** Niveau d'une note (heuristique). undefined = aucune regle ne tranche -> defaut appelant. */
function niveauNote(s: string): NiveauNote | undefined {
  if (estErreur(s)) return "erreur";
  if (porteUnEcartNonNul(s) || estAnomalie(s)) return "anomalie";
  if (estVigilance(s)) return "vigilance";
  return undefined;
}

// --- API --------------------------------------------------------------------

/** Classe UNE note plate en { niveau, source, texte }. */
export function classerNote(texte: string, opts?: OptionsClassement): NoteStructuree {
  const s = texte.toLowerCase();
  return {
    niveau: niveauNote(s) ?? opts?.niveauParDefaut ?? "info",
    source: sourceNote(texte),
    texte,
  };
}

/** Classe une liste de notes plates. Chaines vides ignorees ; jamais de crash. */
export function classerNotes(notes: readonly string[], opts?: OptionsClassement): NoteStructuree[] {
  return notes.filter((n) => typeof n === "string" && n.trim().length > 0).map((n) => classerNote(n, opts));
}
