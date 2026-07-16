// Domaine PUR : appliquer des corrections MANUELLES a un jeu de donnees patrimoine (aucune I/O).
//
// Pourquoi : quand l'extraction IA lit mal un RCP scanne peu lisible, le jeu extrait porte des
// erreurs (un tantieme faux, un lot manque, un nom ecorche, un doublon d'owner). Le jeu etant en
// lecture seule, une erreur bloquante aux auto-checks = injection impossible (impasse d'usage
// reelle, cf. ADR-030, cas S0305/o9 corrige par script SQL). Ce module transforme ca en gestes :
// une union STRICTE de corrections typees, appliquees de facon IMMUTABLE et TRANSACTIONNELLE
// (tout ou rien) ; toute reference inconnue est REFUSEE avec un message clair, jamais un crash.
//
// Les auto-checks deterministes (auto-checks.ts) restent le filet : ce module ne re-verifie pas la
// coherence metier (ex. Σ tantiemes == totalAttendu), il applique fidelement les gestes humains ;
// c'est verifierTout qui dit ensuite si le jeu est pret a produire/injecter.
//
// PII : ce module manipule des noms d'owners (champs modifies) mais ne les recopie JAMAIS dans les
// notes/erreurs -> seuls des identifiants internes (ownerId), numeros de lot/cle et compteurs y
// figurent (les messages sont sans donnee personnelle, comme les warnings des auto-checks).

import type { Attribution, Cle, JeuDeDonnees, Lot, Owner, Tantieme } from "./patrimoine";

// --- Union STRICTE des corrections supportees ------------------------------

/** Champs d'un lot modifiables (le numero = EDD final, cle d'identite : jamais renumerote). */
export type ChampsLot = Partial<Omit<Lot, "numero">>;
/** Champs d'une cle modifiables (le code = cle d'identite). */
export type ChampsCle = Partial<Omit<Cle, "code">>;
/** Champs d'un owner modifiables (l'id interne = cle d'identite stable). */
export type ChampsOwner = Partial<Omit<Owner, "id">>;

export type CorrectionLot =
  | { type: "lot.modifier"; numero: number; champs: ChampsLot }
  | { type: "lot.ajouter"; lot: Lot }
  /** cascade requis si le lot porte des tantiemes/attributions (sinon refus explicite). */
  | { type: "lot.supprimer"; numero: number; cascade?: boolean };

export type CorrectionCle =
  | { type: "cle.modifier"; code: string; champs: ChampsCle }
  | { type: "cle.ajouter"; cle: Cle }
  /** cascade requis si des tantiemes sont rattaches a la cle. */
  | { type: "cle.supprimer"; code: string; cascade?: boolean };

export type CorrectionTantieme =
  | { type: "tantieme.modifier"; cleCode: string; lot: number; valeur: number }
  | { type: "tantieme.ajouter"; tantieme: Tantieme }
  | { type: "tantieme.supprimer"; cleCode: string; lot: number };

export type CorrectionOwner =
  | { type: "owner.modifier"; id: string; champs: ChampsOwner }
  | { type: "owner.ajouter"; owner: Owner }
  /** reattribuerVers requis si l'owner porte des attributions (sinon refus explicite). */
  | { type: "owner.supprimer"; id: string; reattribuerVers?: string }
  /** fusion de deux entites doublon : le survivant garde ses donnees, l'absorbe est reattache. */
  | { type: "owner.fusionner"; survivantId: string; absorbeId: string };

export type CorrectionAttribution =
  /** rattache le(s) lot -> versOwnerId ; deOwnerId precise l'owner d'origine (indivision). */
  | { type: "attribution.reattacher"; lot: number; versOwnerId: string; deOwnerId?: string }
  | { type: "attribution.ajouter"; ownerId: string; lot: number }
  | { type: "attribution.supprimer"; ownerId: string; lot: number };

export type Correction =
  | CorrectionLot
  | CorrectionCle
  | CorrectionTantieme
  | CorrectionOwner
  | CorrectionAttribution;

/** Resultat TRANSACTIONNEL : soit un nouveau jeu + notes informatives, soit la liste des refus. */
export type ResultatCorrections =
  | { ok: true; jeu: JeuDeDonnees; notes: string[] }
  | { ok: false; erreurs: string[] };

// --- Helpers purs ----------------------------------------------------------

/** Copie profonde legere du jeu : arrays et objets neufs -> l'entree n'est JAMAIS mutee. */
function cloner(jeu: JeuDeDonnees): JeuDeDonnees {
  return {
    lots: jeu.lots.map((l) => ({ ...l })),
    cles: jeu.cles.map((c) => ({ ...c })),
    tantiemes: jeu.tantiemes.map((t) => ({ ...t })),
    owners: jeu.owners.map((o) => ({ ...o })),
    attributions: jeu.attributions.map((a) => ({ ...a })),
    ...(jeu.liaisons450
      ? { liaisons450: jeu.liaisons450.map((l) => ({ ...l, candidats: l.candidats?.map((k) => ({ ...k })) })) }
      : {}),
  };
}

/** Applique une mise a jour partielle : seules les cles DEFINIES sont ecrites ("" efface, undefined = ne touche pas). */
function appliquerChamps<T extends object>(cible: T, champs: Partial<T>): void {
  for (const [k, v] of Object.entries(champs)) {
    if (v !== undefined) (cible as Record<string, unknown>)[k] = v;
  }
}

/** Deduplique les attributions par (ownerId, lot) en gardant la 1re (conserve un eventuel codeEstale). */
function dedupAttributions(attributions: Attribution[]): Attribution[] {
  const vus = new Set<string>();
  const out: Attribution[] = [];
  for (const a of attributions) {
    const cle = `${a.ownerId}#${a.lot}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(a);
  }
  return out;
}

// --- Application d'UNE correction (mute le working set, renvoie un message d'erreur ou null) --

function appliquerUne(w: JeuDeDonnees, c: Correction, notes: string[]): string | null {
  switch (c.type) {
    // --- LOTS ---
    case "lot.modifier": {
      const lot = w.lots.find((l) => l.numero === c.numero);
      if (!lot) return `Lot ${c.numero} introuvable (modification impossible).`;
      appliquerChamps(lot, c.champs);
      return null;
    }
    case "lot.ajouter": {
      if (w.lots.some((l) => l.numero === c.lot.numero)) return `Lot ${c.lot.numero} : numero deja present (ajout refuse).`;
      w.lots.push({ ...c.lot });
      return null;
    }
    case "lot.supprimer": {
      const idx = w.lots.findIndex((l) => l.numero === c.numero);
      if (idx < 0) return `Lot ${c.numero} introuvable (suppression impossible).`;
      const nbTant = w.tantiemes.filter((t) => t.lot === c.numero).length;
      const nbAttr = w.attributions.filter((a) => a.lot === c.numero).length;
      if ((nbTant > 0 || nbAttr > 0) && !c.cascade) {
        return `Lot ${c.numero} : ${nbTant} tantieme(s) et ${nbAttr} attribution(s) rattache(s) ; suppression en cascade requise.`;
      }
      w.lots.splice(idx, 1);
      if (nbTant > 0) w.tantiemes = w.tantiemes.filter((t) => t.lot !== c.numero);
      if (nbAttr > 0) w.attributions = w.attributions.filter((a) => a.lot !== c.numero);
      if (nbTant > 0 || nbAttr > 0) notes.push(`Lot ${c.numero} supprime en cascade (${nbTant} tantieme(s), ${nbAttr} attribution(s)).`);
      return null;
    }

    // --- CLES ---
    case "cle.modifier": {
      const cle = w.cles.find((k) => k.code === c.code);
      if (!cle) return `Cle ${c.code} introuvable (modification impossible).`;
      appliquerChamps(cle, c.champs);
      return null;
    }
    case "cle.ajouter": {
      if (w.cles.some((k) => k.code === c.cle.code)) return `Cle ${c.cle.code} : code deja present (ajout refuse).`;
      w.cles.push({ ...c.cle });
      return null;
    }
    case "cle.supprimer": {
      const idx = w.cles.findIndex((k) => k.code === c.code);
      if (idx < 0) return `Cle ${c.code} introuvable (suppression impossible).`;
      const nbTant = w.tantiemes.filter((t) => t.cleCode === c.code).length;
      if (nbTant > 0 && !c.cascade) {
        return `Cle ${c.code} : ${nbTant} tantieme(s) rattache(s) ; suppression en cascade requise.`;
      }
      w.cles.splice(idx, 1);
      if (nbTant > 0) {
        w.tantiemes = w.tantiemes.filter((t) => t.cleCode !== c.code);
        notes.push(`Cle ${c.code} supprimee en cascade (${nbTant} tantieme(s)).`);
      }
      return null;
    }

    // --- TANTIEMES ---
    case "tantieme.modifier": {
      const t = w.tantiemes.find((x) => x.cleCode === c.cleCode && x.lot === c.lot);
      if (!t) return `Tantieme (cle ${c.cleCode}, lot ${c.lot}) introuvable.`;
      t.valeur = c.valeur;
      return null;
    }
    case "tantieme.ajouter": {
      const { cleCode, lot } = c.tantieme;
      if (w.tantiemes.some((x) => x.cleCode === cleCode && x.lot === lot)) return `Tantieme (cle ${cleCode}, lot ${lot}) : ligne deja presente.`;
      if (!w.cles.some((k) => k.code === cleCode)) return `Tantieme : cle ${cleCode} inconnue.`;
      if (!w.lots.some((l) => l.numero === lot)) return `Tantieme : lot ${lot} inconnu.`;
      w.tantiemes.push({ ...c.tantieme });
      return null;
    }
    case "tantieme.supprimer": {
      const idx = w.tantiemes.findIndex((x) => x.cleCode === c.cleCode && x.lot === c.lot);
      if (idx < 0) return `Tantieme (cle ${c.cleCode}, lot ${c.lot}) introuvable.`;
      w.tantiemes.splice(idx, 1);
      return null;
    }

    // --- OWNERS ---
    case "owner.modifier": {
      const o = w.owners.find((x) => x.id === c.id);
      if (!o) return `Coproprietaire ${c.id} introuvable (modification impossible).`;
      appliquerChamps(o, c.champs);
      return null;
    }
    case "owner.ajouter": {
      if (w.owners.some((x) => x.id === c.owner.id)) return `Coproprietaire ${c.owner.id} : identifiant deja present (ajout refuse).`;
      w.owners.push({ ...c.owner });
      return null;
    }
    case "owner.supprimer": {
      const idx = w.owners.findIndex((x) => x.id === c.id);
      if (idx < 0) return `Coproprietaire ${c.id} introuvable (suppression impossible).`;
      const nbAttr = w.attributions.filter((a) => a.ownerId === c.id).length;
      if (nbAttr > 0 && !c.reattribuerVers) {
        return `Coproprietaire ${c.id} : ${nbAttr} attribution(s) rattachee(s) ; reattribution explicite requise avant suppression.`;
      }
      if (c.reattribuerVers) {
        if (c.reattribuerVers === c.id) return `Coproprietaire ${c.id} : reattribution vers lui-meme impossible.`;
        if (!w.owners.some((x) => x.id === c.reattribuerVers)) return `Reattribution : coproprietaire cible ${c.reattribuerVers} inconnu.`;
        for (const a of w.attributions) if (a.ownerId === c.id) a.ownerId = c.reattribuerVers;
        w.attributions = dedupAttributions(w.attributions);
        if (nbAttr > 0) notes.push(`Coproprietaire ${c.id} supprime : ${nbAttr} attribution(s) reattribuee(s) a ${c.reattribuerVers}.`);
      }
      w.owners.splice(idx, 1);
      // liaisons450 : l'owner supprime ne doit plus pointer un compte 450 (sinon liaison orpheline).
      if (w.liaisons450?.some((l) => l.ownerId === c.id)) {
        w.liaisons450 = w.liaisons450.filter((l) => l.ownerId !== c.id);
        notes.push(`Liaison compte 450 du coproprietaire ${c.id} retiree (owner supprime).`);
      }
      return null;
    }
    case "owner.fusionner": {
      if (c.survivantId === c.absorbeId) return `Fusion : survivant et absorbe identiques (${c.survivantId}).`;
      if (!w.owners.some((x) => x.id === c.survivantId)) return `Fusion : survivant ${c.survivantId} inconnu.`;
      if (!w.owners.some((x) => x.id === c.absorbeId)) return `Fusion : absorbe ${c.absorbeId} inconnu.`;
      let n = 0;
      for (const a of w.attributions) if (a.ownerId === c.absorbeId) { a.ownerId = c.survivantId; n++; }
      w.attributions = dedupAttributions(w.attributions);
      // liaisons450 : si l'absorbe portait un compte 450, le reattacher au survivant s'il n'en a
      // pas (on ne perd pas la cle de reprise compta) ; sinon on garde celle du survivant + trace.
      if (w.liaisons450) {
        const surv = w.liaisons450.find((l) => l.ownerId === c.survivantId);
        const abs = w.liaisons450.find((l) => l.ownerId === c.absorbeId);
        if (abs) {
          if (!surv) {
            abs.ownerId = c.survivantId;
            notes.push(`Fusion : liaison compte 450 reattachee au survivant ${c.survivantId}.`);
          } else {
            w.liaisons450 = w.liaisons450.filter((l) => l.ownerId !== c.absorbeId);
            notes.push(`Fusion : liaison 450 de l'absorbe abandonnee (survivant ${c.survivantId} deja lie).`);
          }
        }
      }
      w.owners = w.owners.filter((x) => x.id !== c.absorbeId);
      notes.push(`Fusion : coproprietaire ${c.absorbeId} absorbe par ${c.survivantId} (${n} attribution(s) reattachee(s)).`);
      return null;
    }

    // --- ATTRIBUTIONS ---
    case "attribution.reattacher": {
      if (!w.lots.some((l) => l.numero === c.lot)) return `Reattribution : lot ${c.lot} inconnu.`;
      if (!w.owners.some((o) => o.id === c.versOwnerId)) return `Reattribution : coproprietaire cible ${c.versOwnerId} inconnu.`;
      const cibles = w.attributions.filter((a) => a.lot === c.lot && (c.deOwnerId ? a.ownerId === c.deOwnerId : true));
      if (cibles.length === 0) {
        return `Reattribution : aucune attribution ${c.deOwnerId ? `de ${c.deOwnerId} ` : ""}sur le lot ${c.lot}.`;
      }
      if (!c.deOwnerId && cibles.length > 1) {
        return `Reattribution : lot ${c.lot} rattache a plusieurs coproprietaires ; preciser l'owner d'origine (deOwnerId).`;
      }
      for (const a of cibles) a.ownerId = c.versOwnerId;
      w.attributions = dedupAttributions(w.attributions);
      return null;
    }
    case "attribution.ajouter": {
      if (!w.lots.some((l) => l.numero === c.lot)) return `Attribution : lot ${c.lot} inconnu.`;
      if (!w.owners.some((o) => o.id === c.ownerId)) return `Attribution : coproprietaire ${c.ownerId} inconnu.`;
      if (w.attributions.some((a) => a.lot === c.lot && a.ownerId === c.ownerId)) return `Attribution (lot ${c.lot}, owner ${c.ownerId}) deja presente.`;
      w.attributions.push({ ownerId: c.ownerId, lot: c.lot });
      return null;
    }
    case "attribution.supprimer": {
      const idx = w.attributions.findIndex((a) => a.lot === c.lot && a.ownerId === c.ownerId);
      if (idx < 0) return `Attribution (lot ${c.lot}, owner ${c.ownerId}) introuvable.`;
      w.attributions.splice(idx, 1);
      return null;
    }

    default: {
      // Exhaustivite : toute nouvelle variante non geree devient une erreur de compilation.
      const _exhaustif: never = c;
      return `Correction non supportee : ${JSON.stringify(_exhaustif)}`;
    }
  }
}

/**
 * Applique une liste de corrections a un jeu, de facon IMMUTABLE et TRANSACTIONNELLE.
 *
 * - L'entree `jeu` n'est jamais mutee (copie profonde legere en interne).
 * - Les corrections s'appliquent SEQUENTIELLEMENT sur un working set (une correction peut
 *   s'appuyer sur l'etat produit par la precedente : ajouter un owner puis lui attribuer un lot).
 * - Toute reference inconnue (lot/cle/owner/attribution) est refusee avec un message clair ; on
 *   n'applique alors RIEN (tout ou rien) et on renvoie la liste des erreurs -> jamais de jeu a
 *   moitie corrige, jamais de crash.
 * - En succes : nouveau jeu + notes informatives (cascades, fusions, reattachements). Les
 *   liaisons450 (optionnelles, jeux sans grand livre) sont preservees / gerees explicitement.
 */
export function appliquerCorrections(jeu: JeuDeDonnees, corrections: Correction[]): ResultatCorrections {
  const w = cloner(jeu);
  const notes: string[] = [];
  const erreurs: string[] = [];
  for (const c of corrections) {
    const err = appliquerUne(w, c, notes);
    if (err) erreurs.push(err);
  }
  if (erreurs.length > 0) return { ok: false, erreurs };
  return { ok: true, jeu: w, notes };
}

/**
 * Resume PII-free d'un lot de corrections, pour le journal / le log serveur : ne compte que les
 * FAMILLES (aucun nom, aucune valeur). Ex. "2 lot(s), 3 tantieme(s), 1 fusion".
 */
export function resumerCorrections(corrections: Correction[]): string {
  const n = { lot: 0, cle: 0, tantieme: 0, owner: 0, attribution: 0, fusion: 0 };
  for (const c of corrections) {
    if (c.type === "owner.fusionner") n.fusion++;
    else n[c.type.split(".")[0] as "lot" | "cle" | "tantieme" | "owner" | "attribution"]++;
  }
  const parts: string[] = [];
  if (n.lot) parts.push(`${n.lot} lot(s)`);
  if (n.cle) parts.push(`${n.cle} cle(s)`);
  if (n.tantieme) parts.push(`${n.tantieme} tantieme(s)`);
  if (n.owner) parts.push(`${n.owner} coproprietaire(s)`);
  if (n.attribution) parts.push(`${n.attribution} attribution(s)`);
  if (n.fusion) parts.push(`${n.fusion} fusion(s)`);
  return parts.length > 0 ? parts.join(", ") : "aucune";
}
