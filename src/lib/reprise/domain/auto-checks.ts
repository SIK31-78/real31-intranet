// Auto-checks deterministes (role de l'"Agent 3" : aucun LLM ici). Transcription
// fidele de la section AUTO-CHECKS de la CLAUDE.md vault. Si UN check de niveau
// "erreur" echoue, on NE LIVRE PAS les .xlsx. Les "warnings" sont actionnables
// mais non bloquants (identites a verifier, fusions a valider...).
//
// Pur, sans I/O : alimente l'orchestrateur (recap GO/STOP) et les tests.

import type { JeuDeDonnees } from "./patrimoine";
import { estCiviliteValide, estCivilliteProValide, estCodeCleValide, estMajuscules, estTitleCase, estUsageValide } from "./regles";
import { detecterDoublons } from "./dedup";

export type Niveau = "erreur" | "warning" | "info";

export interface Probleme {
  /** Code court stable (ex. "LOT_NUMERO_DOUBLON") pour filtrage/metriques. */
  code: string;
  niveau: Niveau;
  message: string;
}

export interface ResultatChecks {
  ok: boolean; // true si aucune erreur (les warnings n'empechent pas la livraison)
  erreurs: Probleme[];
  warnings: Probleme[];
  /** Etat d'avancement, pas anomalie : ex. links pas encore verses en phase A. */
  infos: Probleme[];
}

const CODE_CLE_GENERALE = "001";

/** LOTS : N° uniques et > 0 ; usage liste fermee ; etage entier ; commentaire present. */
export function verifierLots(d: JeuDeDonnees): Probleme[] {
  const p: Probleme[] = [];
  const vus = new Set<number>();
  for (const lot of d.lots) {
    if (!Number.isInteger(lot.numero) || lot.numero <= 0) {
      p.push({ code: "LOT_NUMERO_INVALIDE", niveau: "erreur", message: `Lot avec numero invalide : ${lot.numero}` });
    }
    if (vus.has(lot.numero)) {
      p.push({ code: "LOT_NUMERO_DOUBLON", niveau: "erreur", message: `Numero de lot en doublon : ${lot.numero}` });
    }
    vus.add(lot.numero);
    if (!estUsageValide(lot.usage)) {
      p.push({ code: "LOT_USAGE_HORS_LISTE", niveau: "erreur", message: `Lot ${lot.numero} : usage hors liste fermee ("${lot.usage}")` });
    }
    if (lot.etage !== undefined && !Number.isInteger(lot.etage)) {
      p.push({ code: "LOT_ETAGE_NON_ENTIER", niveau: "erreur", message: `Lot ${lot.numero} : etage non entier (${lot.etage})` });
    }
    if (!lot.commentaire || !lot.commentaire.trim()) {
      p.push({ code: "LOT_COMMENTAIRE_VIDE", niveau: "warning", message: `Lot ${lot.numero} : commentaire absent (description RCP a verifier)` });
    }
  }
  return p;
}

/**
 * TANTIEMES : codes cles prefixes 3 chiffres ; aucun 0 (lot non concerne = OMIS) ;
 * tout N° present dans lots ; Σ par cle = total attendu de la cle.
 */
export function verifierTantiemes(d: JeuDeDonnees): Probleme[] {
  const p: Probleme[] = [];
  const numerosLots = new Set(d.lots.map((l) => l.numero));
  const sommeParCle = new Map<string, number>();

  for (const t of d.tantiemes) {
    if (!estCodeCleValide(t.cleCode)) {
      p.push({ code: "TANT_CODE_CLE_INVALIDE", niveau: "erreur", message: `Code cle non prefixe sur 3 chiffres : "${t.cleCode}"` });
    }
    if (t.valeur === 0) {
      p.push({ code: "TANT_VALEUR_ZERO", niveau: "erreur", message: `Cle ${t.cleCode}, lot ${t.lot} : tantieme a 0 (un lot non concerne doit etre OMIS, pas a 0)` });
    } else if (!Number.isInteger(t.valeur) || t.valeur < 0) {
      p.push({ code: "TANT_VALEUR_INVALIDE", niveau: "erreur", message: `Cle ${t.cleCode}, lot ${t.lot} : tantieme invalide (${t.valeur})` });
    }
    if (!numerosLots.has(t.lot)) {
      p.push({ code: "TANT_LOT_INCONNU", niveau: "erreur", message: `Cle ${t.cleCode} : tantieme sur un lot inexistant (${t.lot})` });
    }
    sommeParCle.set(t.cleCode, (sommeParCle.get(t.cleCode) ?? 0) + t.valeur);
  }

  for (const cle of d.cles) {
    const somme = sommeParCle.get(cle.code) ?? 0;
    if (somme !== cle.totalAttendu) {
      p.push({
        code: "TANT_ECART_TOTAL",
        niveau: "erreur",
        message: `Cle ${cle.code} (${cle.libelle}) : ecart de total (somme ${somme} != attendu ${cle.totalAttendu})`,
      });
    }
  }
  return p;
}

/** LOTS x CLE GENERALE : tout lot doit etre present au moins sur la cle 001. */
export function verifierCoherenceLotsCles(d: JeuDeDonnees): Probleme[] {
  const p: Probleme[] = [];
  const aGenerale = d.cles.some((c) => c.code === CODE_CLE_GENERALE);
  if (!aGenerale) {
    p.push({ code: "CLE_GENERALE_ABSENTE", niveau: "warning", message: `Aucune cle "${CODE_CLE_GENERALE}" (charges generales) detectee` });
    return p;
  }
  const lotsGenerale = new Set(d.tantiemes.filter((t) => t.cleCode === CODE_CLE_GENERALE).map((t) => t.lot));
  const lotsAvecTantieme = new Set(d.tantiemes.map((t) => t.lot));
  for (const lot of d.lots) {
    if (lotsGenerale.has(lot.numero)) continue;
    // Un lot appartenant au SYNDICAT (loge du gardien, salle commune, parking issu des parties
    // communes) porte des tantiemes de propriete mais AUCUNE charge generale : le syndicat ne se
    // facture pas a lui-meme. Cas reel S0304 (lots 43, 62, 85, 194 : le RCP inscrit "Gardien" a la
    // place du tantieme). Ce n'est donc une ERREUR que si le lot n'apparait sur aucune cle ;
    // sinon c'est un WARNING a confirmer par le gestionnaire.
    if (lotsAvecTantieme.has(lot.numero)) {
      p.push({ code: "LOT_ABSENT_CLE_GENERALE", niveau: "warning", message: `Lot ${lot.numero} absent de la cle generale ${CODE_CLE_GENERALE} : lot du syndicat (partie commune, loge) ? a confirmer` });
    } else {
      p.push({ code: "LOT_SANS_AUCUN_TANTIEME", niveau: "erreur", message: `Lot ${lot.numero} absent de TOUTES les cles de repartition` });
    }
  }
  return p;
}

/** OWNERS : civilite liste fermee ; nom MAJ / prenom Title Case ; SCI -> raison sociale ; Pro -> civilite compatible ; doublons. */
export function verifierOwners(d: JeuDeDonnees): Probleme[] {
  const p: Probleme[] = [];
  for (const o of d.owners) {
    if (!estCiviliteValide(o.civilite)) {
      p.push({ code: "OWNER_CIVILITE_HORS_LISTE", niveau: "erreur", message: `${o.nom} : civilite hors liste fermee ("${o.civilite}")` });
    }
    if (!estMajuscules(o.nom)) {
      p.push({ code: "OWNER_NOM_NON_MAJ", niveau: "erreur", message: `Nom non en MAJUSCULES : "${o.nom}"` });
    }
    if (o.nom.length > 38) {
      p.push({ code: "OWNER_NOM_TROP_LONG", niveau: "erreur", message: `Nom > 38 caracteres : "${o.nom}"` });
    }
    // Personne morale : le champ Prenom porte le representant legal, et la convention du cabinet
    // impose "SERVICE SYNDIC" quand aucun gerant n'est identifie (references/conventions-cabinet.md).
    // La regle Title Case ne s'applique donc qu'aux personnes physiques.
    if (!o.pro && o.prenom && o.prenom.trim() && !estTitleCase(o.prenom)) {
      p.push({ code: "OWNER_PRENOM_NON_TITLECASE", niveau: "erreur", message: `${o.nom} : prenom pas en Title Case ("${o.prenom}")` });
    }
    if (o.pro) {
      if (!o.raisonSociale || !o.raisonSociale.trim()) {
        p.push({ code: "OWNER_SCI_SANS_RAISON", niveau: "erreur", message: `${o.nom} : personne morale (Pro) sans raison sociale` });
      }
      if (estCiviliteValide(o.civilite) && !estCivilliteProValide(o.civilite)) {
        p.push({ code: "OWNER_PRO_CIVILITE", niveau: "erreur", message: `${o.nom} : civilite "${o.civilite}" incompatible avec une personne morale (attendu "m" par defaut ou celle du gerant)` });
      }
      if (o.capital !== undefined && !Number.isFinite(o.capital)) {
        p.push({ code: "OWNER_CAPITAL_NON_NUMERIQUE", niveau: "erreur", message: `${o.nom} : capital social non numerique (eStale le refuse)` });
      }
    }
  }

  for (const g of detecterDoublons(d.owners)) {
    if (g.type === "fusion_proposee") {
      p.push({ code: "OWNER_FUSION_A_VALIDER", niveau: "warning", message: `Fusion proposee (R7) pour "${g.cle}" : ${g.owners.length} entites identiques a fusionner (validation requise)` });
    } else {
      p.push({ code: "OWNER_DOUBLON_NON_TRANCHABLE", niveau: "warning", message: `Doublon non tranchable pour "${g.cle}" : donnees divergentes, garder les ${g.owners.length} lignes et verifier` });
    }
  }
  return p;
}

/** LINKS : 0 lot orphelin ; tout owner a >= 1 lot ; tout N° present dans lots ; phase B = codes 4 car valides. */
export function verifierLinks(d: JeuDeDonnees): Probleme[] {
  const p: Probleme[] = [];
  // Phase A : les attributions ne sont produites qu'APRES releve des codes Estale (regle R2 du
  // skill estale-migration). Tant que links n'est pas verse, aucun lot n'est "orphelin" : c'est
  // l'etape qui n'est pas atteinte. Un seul message d'information, pas un par lot.
  if (d.attributions.length === 0) {
    if (d.lots.length > 0) {
      p.push({ code: "LINKS_NON_FOURNIS", niveau: "info", message: `Attributions non fournies (${d.lots.length} lots) : etape links a realiser apres le releve des codes Estale` });
    }
    return p;
  }
  const numerosLots = new Set(d.lots.map((l) => l.numero));
  const ownerIds = new Set(d.owners.map((o) => o.id));
  const lotsAttribues = new Set<number>();
  const ownersAvecLot = new Set<string>();

  for (const a of d.attributions) {
    if (!numerosLots.has(a.lot)) {
      p.push({ code: "LINK_LOT_INCONNU", niveau: "erreur", message: `Attribution sur un lot inexistant (${a.lot})` });
    }
    if (!ownerIds.has(a.ownerId)) {
      p.push({ code: "LINK_OWNER_INCONNU", niveau: "erreur", message: `Attribution vers un proprietaire inconnu (id ${a.ownerId})` });
    }
    lotsAttribues.add(a.lot);
    ownersAvecLot.add(a.ownerId);
    if (a.codeEstale !== undefined && !/^[0-9A-Za-z]{4}$/.test(a.codeEstale)) {
      p.push({ code: "LINK_CODE_4CAR_INVALIDE", niveau: "erreur", message: `Code eStale invalide (attendu 4 caracteres) : "${a.codeEstale}"` });
    }
  }

  for (const lot of d.lots) {
    if (!lotsAttribues.has(lot.numero)) {
      p.push({ code: "LINK_LOT_ORPHELIN", niveau: "erreur", message: `Lot orphelin (aucun proprietaire attribue) : ${lot.numero}` });
    }
  }
  for (const o of d.owners) {
    if (!ownersAvecLot.has(o.id)) {
      p.push({ code: "LINK_OWNER_SANS_LOT", niveau: "warning", message: `Copropriétaire sans lot attribue : ${o.nom}` });
    }
  }
  return p;
}

/** Lance tous les checks et agrege erreurs/warnings. ok = aucune erreur. */
export function verifierTout(d: JeuDeDonnees): ResultatChecks {
  const tous = [
    ...verifierLots(d),
    ...verifierTantiemes(d),
    ...verifierCoherenceLotsCles(d),
    ...verifierOwners(d),
    ...verifierLinks(d),
  ];
  const erreurs = tous.filter((x) => x.niveau === "erreur");
  const warnings = tous.filter((x) => x.niveau === "warning");
  const infos = tous.filter((x) => x.niveau === "info");
  return { ok: erreurs.length === 0, erreurs, warnings, infos };
}
