// Service d'orchestration des FICHES DE RENSEIGNEMENTS (post-reprise). Server-only.
// Trois moments :
//   1. genererCourriers  : depuis le jeu persiste (owners), cree/regenere une fiche par owner
//      (token + code neufs, hashes) et renvoie les secrets EN CLAIR (une seule fois, jamais
//      relogues/restockes) pour bâtir le document courrier.
//   2. consulterFiche / soumettreFiche : cote PUBLIC, apres verification du code.
//   3. validerFiche : cote gestionnaire, ecrit l'email dans eStale (via le port) + declenche
//      le mail "espace client pret" (callback fourni par l'action, qui porte le gate mail).
//
// Le token/code en clair ne sortent QUE de genererCourriers (retour direct). Tout le reste ne
// manipule que des hash.

import type { Owner } from "@/lib/reprise/domain/patrimoine";
import type { Dossier } from "@/lib/reprise/domain/dossier";
import {
  calculerExpiration,
  peutSoumettre,
  estExpiree,
  type DonneesConnues,
  type DonneesSoumises,
  type FicheRenseignement,
  type FicheStatut,
} from "@/lib/reprise/domain/fiche-renseignements";
import type { FicheRenseignementsRepository } from "@/lib/reprise/ports/fiche-renseignements-repository";
import type {
  EstaleFicheContactProvider,
  MajEmailResultat,
} from "@/lib/reprise/ports/estale-fiche-contact-provider";
import type { CourrierOwner } from "@/lib/reprise/domain/fiche-courrier";
import { genererToken, genererCode, hacher, hashEgal, normaliserCode } from "@/lib/reprise/services/fiche-token";
import {
  objetMailFicheRenseignements,
  corpsMailFicheRenseignements,
} from "@/lib/reprise/domain/mail-fiche-renseignements";
import QRCode from "qrcode";

/** Validation SOUPLE d'un email (le vrai controle reste eStale a l'ecriture). */
export function emailValide(email: string | undefined): email is string {
  return typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

/**
 * QR code SVG (chaine, encode le lien tokenise complet) pour l'impression papier : gros et net
 * (le SVG est vectoriel, la taille finale est fixee par le CSS >= 3 cm). Correction 'M' :
 * bon compromis lisibilite / robustesse a un scan de courrier plie. Ne jette jamais : un QR
 * absent (cas improbable) laisse simplement l'encadre afficher lien + code.
 */
async function genererQrSvg(lien: string): Promise<string | undefined> {
  try {
    return await QRCode.toString(lien, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  } catch {
    return undefined;
  }
}

/** Snapshot "connu" a partir d'un owner du jeu (PII : reste en base interne). */
export function connuesDepuisOwner(owner: Owner, lots: number[]): DonneesConnues {
  return {
    civilite: owner.civilite,
    nom: owner.nom,
    ...(owner.prenom ? { prenom: owner.prenom } : {}),
    pro: owner.pro,
    ...(owner.email ? { emailConnu: owner.email } : {}),
    ...(owner.telFixe ? { telFixe: owner.telFixe } : {}),
    ...(owner.telPortable ? { telPortable: owner.telPortable } : {}),
    ...(owner.adrNum ? { adrNum: owner.adrNum } : {}),
    ...(owner.adrVoie ? { adrVoie: owner.adrVoie } : {}),
    ...(owner.adrComplement ? { adrComplement: owner.adrComplement } : {}),
    ...(owner.adrCodePostal ? { adrCodePostal: owner.adrCodePostal } : {}),
    ...(owner.adrVille ? { adrVille: owner.adrVille } : {}),
    ...(owner.paysAdresse ? { pays: owner.paysAdresse } : {}),
    ...(lots.length > 0 ? { lots } : {}),
  };
}

/** Lots detenus par un owner, depuis les attributions du jeu. */
function lotsDeOwner(dossier: Dossier, ownerId: string): number[] {
  return (dossier.jeu?.attributions ?? [])
    .filter((a) => a.ownerId === ownerId)
    .map((a) => a.lot)
    .sort((a, b) => a - b);
}

export interface GenererOptions {
  /** Base URL publique (ex "https://intranet.real31.fr") : le lien = base + /fiche/<token>. */
  baseUrl: string;
  /** Restreindre a ces ownerIds (relance ciblee). Absent = tous les owners du jeu. */
  ownerIds?: string[];
  /** true = relance (marque derniereRelanceAt). */
  relance?: boolean;
  /** Horloge ISO (fournie par l'appelant). */
  nowISO: string;
}

export interface GenererResultat {
  courriers: CourrierOwner[];
  /** Owners ignores car deja soumis/valides (on n'ecrase pas leur reponse). */
  ignores: number;
  /** Persistance indisponible : aucun courrier produit (codes qui seraient invalides). */
  erreur?: string;
}

/**
 * Cree/regenere les fiches d'une copro et renvoie les courriers (secrets EN CLAIR). Une fiche
 * deja SOUMISE ou VALIDEE n'est PAS regeneree (on ne detruit pas une reponse recue) -> comptee
 * dans `ignores`. Sinon : token + code neufs (les anciens deviennent caducs), expiration a +90j.
 */
export async function genererCourriers(
  repo: FicheRenseignementsRepository,
  dossier: Dossier,
  opts: GenererOptions,
): Promise<GenererResultat> {
  const owners = dossier.jeu?.owners ?? [];
  // Dossier sans coproprietaires (ex. analyse GRAND LIVRE SEUL -> jeu patrimoine vide) : message
  // explicite plutot qu'un "0 courrier" muet - les fiches partent des owners du PATRIMOINE.
  if (owners.length === 0) {
    return {
      courriers: [],
      ignores: 0,
      erreur:
        "Aucun coproprietaire dans le jeu de ce dossier : analyse d'abord le PATRIMOINE (feuille de presence, EDD/RCP...) - les fiches de renseignements sont generees pour les coproprietaires extraits.",
    };
  }
  const cibles = opts.ownerIds ? owners.filter((o) => opts.ownerIds!.includes(o.id)) : owners;

  const existantes = await repo.listerParDossier(dossier.ref);
  const parOwner = new Map(existantes.map((f) => [f.ownerId, f]));

  const courriers: CourrierOwner[] = [];
  let ignores = 0;

  for (const owner of cibles) {
    const dejaLa = parOwner.get(owner.id);
    if (dejaLa && dejaLa.statut !== "courrier_genere") {
      ignores++; // reponse deja recue : on ne regenere pas
      continue;
    }
    const token = genererToken();
    const code = genererCode();
    const connues = connuesDepuisOwner(owner, lotsDeOwner(dossier, owner.id));
    const fiche: FicheRenseignement = {
      coproCode: dossier.ref,
      ownerId: owner.id,
      tokenHash: hacher(token),
      codeHash: hacher(code),
      statut: "courrier_genere",
      connues,
      courrierGenereAt: opts.nowISO,
      expiresAt: calculerExpiration(opts.nowISO),
      ...(opts.relance ? { derniereRelanceAt: opts.nowISO } : {}),
    };
    await repo.sauver(fiche);
    const lien = `${opts.baseUrl.replace(/\/$/, "")}/fiche/${token}`;
    const qrSvg = await genererQrSvg(lien);
    courriers.push({
      ownerId: owner.id,
      connues,
      lien,
      code,
      ...(qrSvg ? { qrSvg } : {}),
      ...(opts.relance ? { relance: true } : {}),
    });
  }

  // GARDE-FOU (constate par Sekou : codes imprimes invalides) : si la persistance est un no-op
  // silencieux (table reprise_fiche_renseignements absente -> l'adapter degrade), les courriers
  // porteraient des tokens que RIEN ne peut verifier. On relit une fiche ecrite : introuvable =
  // persistance KO -> on le dit clairement au lieu de laisser imprimer des courriers morts.
  if (courriers.length > 0) {
    const relue = await repo.obtenirParTokenHash(hacher(courriers[courriers.length - 1].lien.split("/fiche/")[1]));
    if (!relue) {
      return {
        courriers: [],
        ignores,
        erreur:
          "Persistance indisponible : les fiches generees ne sont pas enregistrees (table reprise_fiche_renseignements absente ?). Execute supabase/sql/reprise_fiche_renseignements.sql puis regenere - les courriers n'ont pas ete produits pour eviter d'imprimer des codes invalides.",
      };
    }
  }

  return { courriers, ignores };
}

// --- BONUS EMAIL : envoyer la fiche PAR EMAIL (au lieu du courrier postal) --------

export interface EnvoyerFicheEmailResultat {
  ok: boolean;
  message: string;
  /** true si le mail est effectivement parti (module mail actif). */
  envoye: boolean;
  /** Note quand le mail n'a pas ete envoye (module inactif, erreur Graph...). */
  note?: string;
}

/**
 * Envoie la fiche de renseignements d'UN coproprietaire PAR EMAIL (le gain metier : les owners
 * dont on connait deja l'email n'ont pas besoin d'un courrier postal). Genere/regenere la fiche
 * (token + code neufs) EXACTEMENT comme le courrier (meme persistance, meme securite), puis compose
 * un mail portant le LIEN + le CODE (pas de QR) et le fait partir via le callback `envoyerMail`
 * (qui porte le gate MAIL_SOURCE/MAIL_PILOTES, comme la validation de fiche). Le statut/canal de la
 * fiche indique "email". Une fiche deja SOUMISE/VALIDEE n'est pas renvoyee (on ne detruit pas une
 * reponse). Owner sans email valide -> refus explicite (il reste au courrier).
 */
export async function envoyerFicheParEmail(
  repo: FicheRenseignementsRepository,
  dossier: Dossier,
  ownerId: string,
  opts: { baseUrl: string; nowISO: string },
  envoyerMail: (p: {
    email: string;
    destinataire: string;
    sujet: string;
    corps: string;
  }) => Promise<{ envoye: boolean; note?: string }>,
): Promise<EnvoyerFicheEmailResultat> {
  const owner = (dossier.jeu?.owners ?? []).find((o) => o.id === ownerId);
  if (!owner) return { ok: false, message: "Coproprietaire introuvable dans le jeu.", envoye: false };
  if (!emailValide(owner.email)) {
    return {
      ok: false,
      message: "Ce coproprietaire n'a pas d'email valide dans le jeu : il reste au courrier postal.",
      envoye: false,
    };
  }

  const existante = (await repo.listerParDossier(dossier.ref)).find((f) => f.ownerId === ownerId);
  if (existante && existante.statut !== "courrier_genere") {
    return { ok: false, message: "Ce coproprietaire a deja repondu : rien a renvoyer.", envoye: false };
  }

  const token = genererToken();
  const code = genererCode();
  const connues = connuesDepuisOwner(owner, lotsDeOwner(dossier, ownerId));
  const fiche: FicheRenseignement = {
    coproCode: dossier.ref,
    ownerId,
    tokenHash: hacher(token),
    codeHash: hacher(code),
    statut: "courrier_genere",
    connues,
    courrierGenereAt: opts.nowISO,
    expiresAt: calculerExpiration(opts.nowISO),
    canal: "email",
  };
  await repo.sauver(fiche);

  // GARDE-FOU persistance (comme genererCourriers) : une fiche non enregistree porterait un code
  // que rien ne peut verifier -> on le detecte avant d'envoyer un mail avec un code mort.
  const relue = await repo.obtenirParTokenHash(hacher(token));
  if (!relue) {
    return {
      ok: false,
      message:
        "Persistance indisponible : la fiche n'a pas ete enregistree (table reprise_fiche_renseignements absente ?). Mail non envoye pour eviter un code invalide.",
      envoye: false,
    };
  }

  const lien = `${opts.baseUrl.replace(/\/$/, "")}/fiche/${token}`;
  const destinataire = [connues.civilite, connues.nom].filter(Boolean).join(" ").trim();
  const sujet = objetMailFicheRenseignements({ coproNom: dossier.nomUsuel, coproRef: dossier.ref });
  const corps = corpsMailFicheRenseignements({
    destinataire,
    coproNom: dossier.nomUsuel,
    coproRef: dossier.ref,
    lien,
    code,
  });
  const r = await envoyerMail({ email: owner.email, destinataire, sujet, corps });

  if (r.envoye) {
    await repo.sauver({ ...fiche, envoiEmailAt: opts.nowISO });
    return { ok: true, message: "Fiche envoyee par email.", envoye: true };
  }
  // Mail non parti (module inactif / erreur) : la fiche reste valide (le lien marche), on le signale.
  return {
    ok: true,
    message: "Fiche prete (lien + code) mais mail non envoye.",
    envoye: false,
    ...(r.note ? { note: r.note } : {}),
  };
}

// --- COTE PUBLIC : consultation + soumission (apres verification du code) --------

export type ConsulterResultat =
  | { ok: false; raison: "introuvable" | "code" }
  | {
      ok: true;
      statut: FicheStatut;
      expiree: boolean;
      soumissionPossible: boolean;
      coproCode: string;
      connues: DonneesConnues;
      soumises?: DonneesSoumises;
    };

/**
 * Verifie (tokenHash, codeSaisi) et renvoie l'etat de la fiche. ANTI-ENUMERATION : un token
 * inconnu ET un mauvais code renvoient la MEME raison ("code") -> impossible de distinguer un
 * token valide d'un invalide. Aucune PII n'est renvoyee tant que le code n'est pas bon.
 */
export async function consulterFiche(
  repo: FicheRenseignementsRepository,
  tokenHash: string,
  codeSaisi: string,
  nowISO: string,
): Promise<ConsulterResultat> {
  const fiche = await repo.obtenirParTokenHash(tokenHash);
  // Token inconnu -> on renvoie "code" (jamais "introuvable") pour ne pas fuiter la validite.
  if (!fiche) return { ok: false, raison: "code" };
  if (!hashEgal(hacher(normaliserCode(codeSaisi)), fiche.codeHash)) return { ok: false, raison: "code" };
  return {
    ok: true,
    statut: fiche.statut,
    expiree: estExpiree(fiche, nowISO),
    soumissionPossible: peutSoumettre(fiche, nowISO),
    coproCode: fiche.coproCode,
    connues: fiche.connues,
    ...(fiche.soumises ? { soumises: fiche.soumises } : {}),
  };
}

export type SoumettreResultat =
  | { ok: false; raison: "code" | "deja_soumis" | "expiree" }
  | { ok: true };

/**
 * Enregistre la soumission d'un coproprietaire (une seule fois). Re-verifie code + etat +
 * expiration cote serveur (on ne fait jamais confiance a l'appel precedent). Passe la fiche a
 * "soumis".
 */
export async function soumettreFiche(
  repo: FicheRenseignementsRepository,
  tokenHash: string,
  codeSaisi: string,
  donnees: DonneesSoumises,
  nowISO: string,
): Promise<SoumettreResultat> {
  const fiche = await repo.obtenirParTokenHash(tokenHash);
  if (!fiche || !hashEgal(hacher(normaliserCode(codeSaisi)), fiche.codeHash)) return { ok: false, raison: "code" };
  if (estExpiree(fiche, nowISO)) return { ok: false, raison: "expiree" };
  if (fiche.statut !== "courrier_genere") return { ok: false, raison: "deja_soumis" };

  await repo.sauver({ ...fiche, statut: "soumis", soumises: donnees, soumisAt: nowISO });
  return { ok: true };
}

// --- COTE GESTIONNAIRE : validation (eStale + mail) ------------------------------

export interface ValiderResultat {
  ok: boolean;
  message: string;
  /** Detail de l'ecriture eStale (dry-run vs reel). */
  estale?: MajEmailResultat;
  /** true si le mail "espace client pret" est parti. */
  mailEnvoye: boolean;
  /** Note quand le mail n'a pas ete envoye (module inactif...). */
  mailNote?: string;
}

/**
 * Valide une fiche SOUMISE : (a) ecrit l'email dans eStale via le port (dry-run ou reel selon
 * le routeur), (b) declenche le mail "espace client pret" via le callback `envoyerMail` (fourni
 * par l'action, qui porte le gate MAIL_SOURCE/MAIL_PILOTES ; renvoie true si envoye, false si
 * module inactif), (c) passe la fiche a "valide". L'ecriture eStale est la SEULE mutation ; elle
 * est confirmee owner par owner (jamais en masse). Idempotence douce : une fiche deja "valide"
 * n'est pas rejouee.
 */
export async function validerFiche(
  repo: FicheRenseignementsRepository,
  contact: EstaleFicheContactProvider,
  ownerId: string,
  coproCode: string,
  envoyerMail: (p: { email: string; destinataire: string }) => Promise<{ envoye: boolean; note?: string }>,
  nowISO: string,
): Promise<ValiderResultat> {
  const fiches = await repo.listerParDossier(coproCode);
  const fiche = fiches.find((f) => f.ownerId === ownerId);
  if (!fiche) return { ok: false, message: "Fiche introuvable.", mailEnvoye: false };
  if (fiche.statut === "valide") return { ok: false, message: "Fiche deja validee.", mailEnvoye: false };
  if (fiche.statut !== "soumis" || !fiche.soumises) {
    return { ok: false, message: "Aucune reponse a valider pour ce coproprietaire.", mailEnvoye: false };
  }

  const email = fiche.soumises.email;
  // (a) eStale : la SEULE mutation, derriere le gate du routeur.
  const estale = await contact.mettreAJourEmailOwner({
    coproCode,
    nom: fiche.connues.nom,
    ...(fiche.connues.prenom ? { prenom: fiche.connues.prenom } : {}),
    email,
  });

  // (b) mail "espace client pret" (le gate mail est porte par le callback).
  const destinataire = [fiche.connues.civilite, fiche.connues.nom].filter(Boolean).join(" ");
  const r = await envoyerMail({ email, destinataire });

  // (c) fiche -> valide.
  await repo.sauver({
    ...fiche,
    statut: "valide",
    valideAt: nowISO,
    ...(r.envoye ? { mailEnvoyeAt: nowISO } : {}),
  });

  return {
    ok: true,
    message: estale.applique
      ? "Email ecrit dans eStale."
      : "Validee (eStale en dry-run : aucune ecriture reelle).",
    estale,
    mailEnvoye: r.envoye,
    ...(r.note ? { mailNote: r.note } : {}),
  };
}
