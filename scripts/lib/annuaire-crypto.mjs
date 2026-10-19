// Construction de l'annuaire des expediteurs a partir de l'export Crypto (REA-291).
// Fonctions PURES : aucun fichier, aucune base. scripts/sync-annuaire-crypto.mjs lit
// l'export et pousse le resultat ; les tests (annuaire-crypto.test.mjs) les appellent seules.
//
// LA CHAINE (Sekou, 12/10/2026) : une adresse appartient a une identite (Tiers, ou un de
// ses correspondants), qui peut etre copropriétaire (MandatCopro) d'un ou plusieurs
// immeubles. Immeuble.IdEntite = MandatCopro.IdSociete ; l'entite porte le numero
// d'immatriculation (Registre_Numero), qui donne notre code copro (Copropriete.registrationNumber).

export const norm = (s) => (s ?? "").toString().replace(/\s+/g, "").toUpperCase();
const vrai = (v) => v === "Vrai" || v === true || v === "1";

const MOTIF_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Une fiche peut porter plusieurs adresses dans le meme champ, separees par ; , ou espace. */
export function adresses(champ) {
  return (champ ?? "")
    .split(/[;,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => MOTIF_EMAIL.test(e));
}

// Casquettes qui ne disent rien du metier (voeux, listes de relance, retours de courrier,
// telephonie 3CX, prospects).
const CASQUETTE_SANS_METIER = /v(oe|œ)ux|r[ée]guliers|npai|riverain|commer[çc]ants|3cx|prospect/i;

/**
 * Le metier d'une fiche, d'apres ses casquettes Crypto : seulement les casquettes « hors
 * service » (CodeServiceConcerne 0 : Entrep. Plomberie, Notaire, Assureur…). Les casquettes
 * de service ((S) Copropriétaire, (G) Locataire…) sont deja portees par la qualite.
 */
export function metiersParTiers(casquettes, typesDeK) {
  const libelle = new Map();
  for (const t of typesDeK) {
    if (String(t.CodeServiceConcerne) !== "0") continue;
    const nom = (t.NomK ?? "").trim();
    if (nom && !CASQUETTE_SANS_METIER.test(nom)) libelle.set(String(t.RefId), nom);
  }
  const parTiers = new Map();
  for (const c of casquettes) {
    const nom = libelle.get(String(c.RefIdTypeDeK));
    if (nom && !parTiers.has(String(c.IdTiers))) parTiers.set(String(c.IdTiers), nom);
  }
  return parTiers;
}

/**
 * @param {object} e
 * @param {any[]} e.tiers            Tiers.txt
 * @param {any[]} e.correspondants   TiersCorrespondants.txt
 * @param {any[]} e.mandats          MandatCopro.txt
 * @param {Set<string>} e.mandatsAvecLot  IdRef des mandats qui portent au moins un lot (Lot.IdPropSyndic)
 * @param {any[]} e.immeubles        Immeuble.txt
 * @param {any[]} e.locataires       Locataire.txt
 * @param {Map<string,string>} e.metiers   tiers -> metier (metiersParTiers)
 * @param {Map<string,string>} e.codeParRnic  numero d'immatriculation normalise -> code copro
 * @returns {{ lignes: object[], bilan: object }}
 */
export function construireAnnuaire({ tiers, correspondants, mandats, mandatsAvecLot, immeubles, locataires, metiers, codeParRnic }) {
  // Obligatoire : sans cet ensemble, chaque ancien copropriétaire redeviendrait destinataire.
  if (!(mandatsAvecLot instanceof Set)) throw new Error("construireAnnuaire : mandatsAvecLot (Set des IdRef de mandat avec lot) manquant.");
  const rnicParEntite = new Map();
  for (const i of immeubles) {
    const r = norm(i.Registre_Numero);
    if (r && i.IdEntite && String(i.IdEntite) !== "0") rnicParEntite.set(String(i.IdEntite), r);
  }

  // Ce qu'on sait de chaque fiche : ses copros et si elle siege au conseil syndical.
  const coprosDe = new Map();
  const auConseil = new Set();
  let mandatsSansCopro = 0;
  let mandatsSansLot = 0;
  for (const m of mandats) {
    const t = String(m.IDTiers);
    const code = codeParRnic.get(rnicParEntite.get(String(m.IdSociete)) ?? "");
    if (!code) {
      mandatsSansCopro++;
      continue;
    }
    // REA-356 (19/10/2026) : Crypto garde le mandat d'un copropriétaire qui a vendu tous ses
    // lots (« copropriétaire sans lot »). Le rattacher envoyait le mail « toute la
    // copropriété » aux anciens copropriétaires (S178 : 65 mandats pour 42 propriétaires,
    // 80 adresses au lieu de 61). Le propriétaire d'un lot est Lot.IdPropSyndic = MandatCopro.IdRef :
    // un mandat sans lot ne rattache plus la fiche à la copro, ni au conseil syndical.
    if (!mandatsAvecLot.has(String(m.IdRef))) {
      mandatsSansLot++;
      continue;
    }
    (coprosDe.get(t) ?? coprosDe.set(t, new Set()).get(t)).add(code);
    if (vrai(m.ConseilSyndical) || vrai(m.PresidentCS) || vrai(m.Suppleant)) auConseil.add(`${t}|${code}`);
  }
  const estLocataire = new Set(locataires.map((l) => String(l.IdTiers)));
  const nomDe = new Map(tiers.map((t) => [String(t.IdRef), (t.Identite ?? "").trim() || null]));

  const lignes = [];
  const vues = new Set();
  const ajouter = (email, tiersId, nom, source) => {
    const copros = coprosDe.get(tiersId);
    const metier = metiers.get(tiersId) ?? null;
    const base = (code) => ({
      email,
      tiers_id: tiersId,
      nom,
      qualite: code
        ? auConseil.has(`${tiersId}|${code}`) ? "conseil_syndical" : "coproprietaire"
        : estLocataire.has(tiersId) ? "locataire" : metier ? "professionnel" : "autre",
      metier,
      copro_code: code,
      source,
    });
    for (const code of copros ?? [null]) {
      const cle = `${email}|${tiersId}|${code ?? ""}`;
      if (vues.has(cle)) continue;
      vues.add(cle);
      lignes.push(base(code));
    }
  };

  for (const t of tiers) for (const e of adresses(t.EMail)) ajouter(e, String(t.IdRef), nomDe.get(String(t.IdRef)) ?? null, "fiche");
  let correspondantsInactifs = 0;
  for (const c of correspondants) {
    if (vrai(c.Inactif)) {
      correspondantsInactifs++;
      continue;
    }
    const tiersId = String(c.IdrefTiers);
    const nom = (c.Nom ?? "").trim() || nomDe.get(tiersId) || null;
    for (const e of adresses(c.Email)) ajouter(e, tiersId, nom, "correspondant");
  }

  const emails = new Set(lignes.map((l) => l.email));
  const avecCopro = new Set(lignes.filter((l) => l.copro_code).map((l) => l.email));
  return {
    lignes,
    bilan: {
      lignes: lignes.length,
      adresses: emails.size,
      adressesAvecCopro: avecCopro.size,
      mandatsSansCopro,
      mandatsSansLot,
      correspondantsInactifs,
    },
  };
}

/**
 * IdRef des mandats qui portent au moins un lot, lus dans le texte de Lot.txt (REA-356).
 * Lot.txt pese 192 Mo : on ne le parse pas en JSON, on n'en extrait que la colonne
 * IdPropSyndic. Appelable sur des morceaux successifs du fichier (lecture en flux) en
 * passant le meme ensemble ; 0 ou vide = lot sans proprietaire syndic, ignore.
 * @param {string} texte
 * @param {Set<string>} [dans]
 * @returns {Set<string>}
 */
export function mandatsAvecLotDepuisTexte(texte, dans = new Set()) {
  for (const m of texte.matchAll(/"IdPropSyndic"\s*:\s*"(\d*)"/g)) {
    if (m[1] && !/^0+$/.test(m[1])) dans.add(m[1]);
  }
  return dans;
}

/** Numero d'immatriculation normalise -> notre code copro, depuis la table Copropriete. */
export function codesParRnic(copros) {
  const m = new Map();
  for (const c of copros) {
    const r = norm(c.registrationNumber);
    if (r && c.referenceCrypto) m.set(r, c.referenceCrypto.trim());
  }
  return m;
}
