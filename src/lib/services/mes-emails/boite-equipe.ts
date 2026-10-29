// Boîte d'équipe de l'écran E-mails (ADR-053, 29/10/2026) : attribution, notes internes, en
// attente / de côté / relance. Les règles sont dans domain/boite-equipe ; ici on lit le
// contexte du mail (rangement actif du journal du tri, binômes, comptables) et on écrit.
//
// Aucun contrôle d'accès ici (un service n'importe jamais l'auth) : l'appelant a déjà vérifié
// que la personne voit le mail (gardes de src/app/mes-emails/gardes-boites.ts) et passe
// l'acteur tiré de la session. Les notes ne partent jamais hors de l'intranet : rien ici
// n'écrit dans Outlook, et leur texte n'est jamais journalisé.

import { cache } from "react";
import {
  attributairesPossibles,
  etatAttente,
  membresDuDossier,
  cleMail,
  echeanceDuChoix,
  etatDeFileEnVigueur,
  etatEquipe,
  peutModifierNote,
  refusAttribution,
  trierNotes,
  validerTexteNote,
  type Attribution,
  type ChoixAttente,
  type ChoixEcheance,
  type Attente,
  type ContexteMail,
  type EtatAttente,
  type EtatEquipeMail,
  type LigneHistoriqueAttribution,
  type MembreEquipe,
  type NoteInterne,
  type RecuDansFil,
} from "@/lib/domain/boite-equipe";
import { roleComptable } from "@/lib/domain/gestionnaire";
import { boiteTri } from "@/lib/domain/mail-gate";
import { clesDossiersLus } from "@/lib/domain/tri-emails";
import { getBoiteEquipeRepository, getGestionnaireRepository, getTriRepository } from "@/lib/adapters/router";

/** La personne qui agit, tirée de la session par l'action (jamais du client). */
export interface Acteur {
  id: string;
  email?: string;
  nomComplet: string;
  initiales: string;
}

/** Fenêtre du journal relue pour situer un mail : celle de « E-mails » (boites-visibles). */
const FENETRE_JOURS = 90;
const depuisFenetre = () => new Date(Date.now() - FENETRE_JOURS * 86_400_000).toISOString();
const minuscules = (e: string) => e.trim().toLowerCase();

function emailDe(a: Acteur): string {
  const e = minuscules(a.email ?? "");
  if (!e) throw new Error("Aucune adresse associée à ce compte.");
  return e;
}

// --- Contexte ----------------------------------------------------------------------------------

/**
 * Où est le mail maintenant : le rangement actif du journal du tri de cette boîte (dossier et
 * conversation). Pas de rangement connu (mail ancien, journal illisible) : dossier null.
 */
export async function contexteDuMail(boite: string, internetMessageId: string): Promise<ContexteMail & { conversationId: string | null }> {
  const cle = cleMail(internetMessageId, boite);
  try {
    const e = await getTriRepository().rangementActif(cle.boite, cle.internetMessageId, depuisFenetre());
    return { ...cle, dossierCle: e?.dossierCle ?? null, conversationId: e?.conversationId ?? null };
  } catch (err) {
    console.warn("[boite-equipe] rangement du mail illisible :", err instanceof Error ? err.message : String(err));
    return { ...cle, dossierCle: null, conversationId: null };
  }
}

/** Les collaborateurs avec une adresse, par adresse (une lecture par requête serveur). */
const collaborateurs = cache(async (): Promise<Map<string, MembreEquipe & { comptable: boolean }>> => {
  const out = new Map<string, MembreEquipe & { comptable: boolean }>();
  for (const g of await getGestionnaireRepository().listTous()) {
    if (!g.email) continue;
    const email = minuscules(g.email);
    out.set(email, { email, nomComplet: g.nomComplet, initiales: g.initiales, comptable: roleComptable(g.role) });
  }
  return out;
});

const membre = (email: string, connus: Map<string, MembreEquipe>): MembreEquipe => {
  const m = connus.get(minuscules(email));
  return m ? { email: m.email, nomComplet: m.nomComplet, initiales: m.initiales } : { email: minuscules(email), nomComplet: email, initiales: email.slice(0, 2).toUpperCase() };
};

/** Les adresses de l'équipe du mail dans ce contexte (binôme du dossier, ou comptables). */
async function possiblesPour(dossierCle: string | null | undefined): Promise<string[]> {
  const [binomes, connus] = await Promise.all([getTriRepository().binomes(), collaborateurs()]);
  const comptables = [...connus.values()].filter((c) => c.comptable).map((c) => c.email);
  return attributairesPossibles(dossierCle, binomes, comptables);
}

// --- Attribution -------------------------------------------------------------------------------

/** Les personnes proposées dans « Attribuer à… » pour ce mail. */
export async function attributairesDuMail(boite: string, internetMessageId: string): Promise<MembreEquipe[]> {
  const ctx = await contexteDuMail(boite, internetMessageId);
  const [possibles, connus] = await Promise.all([possiblesPour(ctx.dossierCle), collaborateurs()]);
  return possibles.map((e) => membre(e, connus));
}

async function poser(acteur: Acteur, boite: string, internetMessageId: string, cibleEmail: string, geste: Attribution["geste"]): Promise<MembreEquipe> {
  const moi = emailDe(acteur);
  const ctx = await contexteDuMail(boite, internetMessageId);
  const cible = minuscules(cibleEmail);
  if (cible !== moi) {
    const refus = refusAttribution({ acteurEmail: moi, cibleEmail: cible, possibles: await possiblesPour(ctx.dossierCle) });
    if (refus) throw new Error(refus);
  }
  const attributaire = cible === moi ? { email: moi, nomComplet: acteur.nomComplet, initiales: acteur.initiales } : membre(cible, await collaborateurs());
  await getBoiteEquipeRepository().attribuer({
    internetMessageId: ctx.internetMessageId,
    boite: ctx.boite,
    dossierCle: ctx.dossierCle ?? null,
    attributaire,
    parEmail: moi,
    parInitiales: acteur.initiales,
    le: new Date().toISOString(),
    geste,
  });
  return attributaire;
}

/** « Je prends » : le mail m'est attribué (même s'il l'était à quelqu'un d'autre). */
export function prendreMail(acteur: Acteur, boite: string, internetMessageId: string): Promise<MembreEquipe> {
  return poser(acteur, boite, internetMessageId, acteur.email ?? "", "prendre");
}

/** « Attribuer à… » : à un membre de l'équipe du mail (binôme, ou comptables en Comptabilité). */
export function attribuerMail(acteur: Acteur, boite: string, internetMessageId: string, cibleEmail: string): Promise<MembreEquipe> {
  return poser(acteur, boite, internetMessageId, cibleEmail, minuscules(cibleEmail) === minuscules(acteur.email ?? "") ? "prendre" : "attribuer");
}

/** Retire l'attribution : le mail redevient « non attribué » (trace dans l'historique). */
export async function retirerAttributionMail(acteur: Acteur, boite: string, internetMessageId: string): Promise<void> {
  const moi = emailDe(acteur);
  const ctx = await contexteDuMail(boite, internetMessageId);
  await getBoiteEquipeRepository().retirerAttribution(cleMail(ctx.internetMessageId, ctx.boite), { dossierCle: ctx.dossierCle ?? null, parEmail: moi, le: new Date().toISOString() });
}

/**
 * Attribution automatique à la réponse (décision 5) : la personne qui répond à un mail d'une
 * boîte triée le prend, s'il n'est attribué à personne dans son dossier actuel. À appeler par
 * le flux de réponse APRÈS un envoi réussi (finaliserEnvoiAction), avec l'acteur de la session.
 * Best-effort : ne lève jamais (une réponse partie ne doit pas sembler échouer), rend true si
 * le mail lui a été attribué. Boîte perso ou boîte non triée : rien.
 */
export async function attribuerAuRepondant(acteur: Acteur, boite: string, internetMessageId: string): Promise<boolean> {
  try {
    if (!boiteTri(boite) || !acteur.email) return false;
    const repo = getBoiteEquipeRepository();
    const ctx = await contexteDuMail(boite, internetMessageId);
    const existantes = await repo.attributions([ctx.internetMessageId]);
    if (existantes === null) return false;
    const actuelle = existantes.find((a) => a.boite === ctx.boite);
    const attribution: Attribution = {
      internetMessageId: ctx.internetMessageId,
      boite: ctx.boite,
      dossierCle: ctx.dossierCle ?? null,
      attributaire: { email: minuscules(acteur.email), nomComplet: acteur.nomComplet, initiales: acteur.initiales },
      parEmail: minuscules(acteur.email),
      parInitiales: acteur.initiales,
      le: new Date().toISOString(),
      geste: "reponse",
    };
    if (!actuelle) return await repo.attribuerSiLibre(attribution);
    // Une attribution d'un autre dossier (mail réaffecté depuis) ne compte plus : on la remplace.
    if (etatDeFileEnVigueur(actuelle, ctx)) return false;
    await repo.attribuer(attribution);
    return true;
  } catch (err) {
    console.warn("[boite-equipe] attribution à la réponse impossible :", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** L'historique des attributions d'un mail dans cette boîte (20 dernières), [] sans table. */
export async function historiqueAttributionMail(boite: string, internetMessageId: string): Promise<LigneHistoriqueAttribution[]> {
  return (await getBoiteEquipeRepository().historiqueAttribution(cleMail(internetMessageId, boite), 20)) ?? [];
}

// --- Notes internes ----------------------------------------------------------------------------

/** Les notes d'un mail, dans l'ordre d'écriture ; [] sans table. */
export async function notesDuMail(internetMessageId: string): Promise<NoteInterne[]> {
  return trierNotes((await getBoiteEquipeRepository().notes(internetMessageId.trim())) ?? []);
}

export async function ajouterNoteMail(acteur: Acteur, boite: string, internetMessageId: string, texte: string): Promise<NoteInterne> {
  const moi = emailDe(acteur);
  const v = validerTexteNote(texte);
  if (!v.ok) throw new Error(v.erreur);
  const cle = cleMail(internetMessageId, boite);
  return getBoiteEquipeRepository().ajouterNote({
    internetMessageId: cle.internetMessageId,
    boite: cle.boite,
    auteurId: acteur.id,
    auteurEmail: moi,
    auteurNom: acteur.nomComplet,
    auteurInitiales: acteur.initiales,
    texte: v.texte,
  });
}

/** La note de CE mail (l'appelant a vérifié l'accès au mail, pas à la note) écrite par l'acteur. */
async function maNote(acteur: Acteur, noteId: string, internetMessageId: string): Promise<NoteInterne> {
  const note = await getBoiteEquipeRepository().note(noteId);
  if (!note || note.internetMessageId !== internetMessageId.trim()) throw new Error("Note introuvable.");
  if (!peutModifierNote(note, acteur.id)) throw new Error("Seul l'auteur d'une note peut la modifier ou la supprimer.");
  return note;
}

export async function modifierNoteMail(acteur: Acteur, noteId: string, internetMessageId: string, texte: string): Promise<void> {
  const v = validerTexteNote(texte);
  if (!v.ok) throw new Error(v.erreur);
  await maNote(acteur, noteId, internetMessageId);
  await getBoiteEquipeRepository().modifierNote(noteId, v.texte, new Date().toISOString());
}

export async function supprimerNoteMail(acteur: Acteur, noteId: string, internetMessageId: string): Promise<void> {
  await maNote(acteur, noteId, internetMessageId);
  await getBoiteEquipeRepository().supprimerNote(noteId);
}

// --- En attente / de côté / relance -------------------------------------------------------------

/**
 * Met un mail REÇU en attente jusqu'à une date, ou de côté (sans date). Il sort du chiffre ;
 * une attente datée revient à la date ou dès qu'une réponse arrive dans le fil. Rend la date de
 * retour (null : de côté).
 */
export async function mettreEnAttente(
  acteur: Acteur,
  boite: string,
  internetMessageId: string,
  choix: ChoixAttente,
  /** Le fil du mail quand le journal du tri ne le connaît pas (boîte perso : la liste l'a). */
  conversationId?: string | null,
): Promise<string | null> {
  const moi = emailDe(acteur);
  const maintenant = new Date();
  const e = echeanceDuChoix(choix, "attente", maintenant);
  if (!e.ok) throw new Error(e.erreur);
  const ctx = await contexteDuMail(boite, internetMessageId);
  await getBoiteEquipeRepository().poserAttente({
    internetMessageId: ctx.internetMessageId,
    boite: ctx.boite,
    nature: "attente",
    jusquAu: e.jusquAu,
    conversationId: ctx.conversationId ?? (conversationId?.trim() || null),
    dossierCle: ctx.dossierCle ?? null,
    depuis: maintenant.toISOString(),
    parEmail: moi,
    parInitiales: acteur.initiales,
    poseLe: maintenant.toISOString(),
  });
  return e.jusquAu;
}

/**
 * « Relancer si pas de réponse dans… » sur un mail ENVOYÉ : il revient dans « À traiter » à la
 * date si personne n'a répondu dans le fil depuis l'envoi. `conversationId` et `envoyeLe` sont
 * ceux du mail envoyé (liste des Envoyés : EchangeTrouve). Rend la date de relance.
 */
export async function relancerSiPasDeReponse(
  acteur: Acteur,
  p: { boite: string; internetMessageId: string; conversationId: string | null; envoyeLe: string; choix: ChoixEcheance | { jour: string } },
): Promise<string> {
  const moi = emailDe(acteur);
  const maintenant = new Date();
  const e = echeanceDuChoix(p.choix, "relance", maintenant);
  if (!e.ok) throw new Error(e.erreur);
  if (!e.jusquAu) throw new Error("Une relance a besoin d'une date.");
  const envoye = Date.parse(p.envoyeLe);
  const cle = cleMail(p.internetMessageId, p.boite);
  await getBoiteEquipeRepository().poserAttente({
    ...cle,
    nature: "relance",
    jusquAu: e.jusquAu,
    conversationId: p.conversationId?.trim() || null,
    dossierCle: null,
    depuis: Number.isFinite(envoye) && envoye <= maintenant.getTime() ? new Date(envoye).toISOString() : maintenant.toISOString(),
    parEmail: moi,
    parInitiales: acteur.initiales,
    poseLe: maintenant.toISOString(),
  });
  return e.jusquAu;
}

/** « Reprendre » : lève l'attente, la mise de côté ou la relance. */
export async function reprendreMail(boite: string, internetMessageId: string): Promise<void> {
  await getBoiteEquipeRepository().leverAttente(cleMail(internetMessageId, boite));
}

// --- État agrégé pour la liste et le compteur ---------------------------------------------------

/** Qui regarde la liste : ses dossiers de binôme situent les mails (Comptabilité pour un comptable). */
export interface Lecteur {
  email?: string;
  role?: string;
}

export interface EtatEquipeListe {
  /** false : tables pas encore créées, l'écran se comporte comme avant (rien à afficher). */
  actif: boolean;
  /** Par internetMessageId (un mail affiché une fois). Absent = rien (non attribué, sans note, sans attente). */
  parMail: Map<string, EtatEquipeMail>;
}

/**
 * Les rangements récents de mes dossiers dans cette boîte : le dossier actuel de chaque mail et
 * les messages reçus par conversation (une réponse arrivée dans le fil). Une lecture par boîte
 * et par requête serveur.
 */
const journalDeLaBoite = cache(async (email: string, comptable: boolean, boite: string) => {
  const dossierDe = new Map<string, string | null>();
  const recus: RecuDansFil[] = [];
  if (!email) return { dossierDe, recus };
  try {
    const repo = getTriRepository();
    const cles = clesDossiersLus({ email, comptable }, await repo.binomes());
    for (const e of await repo.journalPourCles(boite, depuisFenetre(), [...cles])) {
      if (!dossierDe.has(e.internetMessageId)) dossierDe.set(e.internetMessageId, e.dossierCle);
      // L'heure du rangement tient lieu d'heure d'arrivée : le tri automatique range en minutes.
      if (e.conversationId) recus.push({ internetMessageId: e.internetMessageId, conversationId: e.conversationId, recuLe: e.faitLe });
    }
  } catch (err) {
    console.warn("[boite-equipe] journal du tri illisible :", err instanceof Error ? err.message : String(err));
  }
  return { dossierDe, recus };
});

/**
 * L'état d'équipe de ces mails (attributaire, nombre de notes, attente ou relance en vigueur et
 * son statut maintenant), pour la liste, les filtres « À moi / Non attribués / De côté » et le
 * chiffre (domain/boite-equipe : placeDansMesChiffres, horsATraiter, relanceDue).
 *
 * Le dossier actuel de chaque mail vient du journal du tri (dossiers du lecteur) ; `dossierCle`
 * passé par l'appelant l'emporte. Les réponses arrivées dans le fil viennent du même journal,
 * plus `recus` si l'appelant en a (mails affichés avec leur conversation, boîte perso).
 */
export async function etatEquipeDesMails(
  mails: { internetMessageId: string; boite?: string; dossierCle?: string | null }[],
  opts: { lecteur: Lecteur; maintenant?: Date; recus?: readonly RecuDansFil[] },
): Promise<EtatEquipeListe> {
  const parMail = new Map<string, EtatEquipeMail>();
  const liste = mails.filter((m) => m.internetMessageId?.trim()).map((m) => ({ ...m, internetMessageId: m.internetMessageId.trim(), boite: minuscules(m.boite ?? "") }));
  if (!liste.length) return { actif: true, parMail };
  const ids = liste.map((m) => m.internetMessageId);
  const repo = getBoiteEquipeRepository();
  const [attributions, notes, attentes] = await Promise.all([repo.attributions(ids), repo.compterNotes(ids), repo.attentes(ids)]);
  if (attributions === null || notes === null || attentes === null) return { actif: false, parMail };

  const email = minuscules(opts.lecteur.email ?? "");
  const comptable = roleComptable(opts.lecteur.role);
  const boitesTriees = [...new Set(liste.map((m) => m.boite).filter((b) => b && boiteTri(b)))];
  const journaux = new Map(await Promise.all(boitesTriees.map(async (b) => [b, await journalDeLaBoite(email, comptable, b)] as const)));
  const recusEnPlus = opts.recus ?? [];
  const maintenant = opts.maintenant ?? new Date();

  for (const m of liste) {
    const j = journaux.get(m.boite);
    const contexte: ContexteMail = {
      internetMessageId: m.internetMessageId,
      boite: m.boite,
      dossierCle: m.dossierCle !== undefined ? m.dossierCle : (j?.dossierDe.get(m.internetMessageId) ?? null),
    };
    const etat = etatEquipe({
      contexte,
      attribution: attributions.find((a) => a.internetMessageId === m.internetMessageId && a.boite === m.boite),
      notes: notes.get(m.internetMessageId) ?? 0,
      attente: attentes.find((a) => a.internetMessageId === m.internetMessageId && a.boite === m.boite),
      maintenant,
      recus: j ? [...j.recus, ...recusEnPlus] : recusEnPlus,
    });
    if (etat.attributaire || etat.notes || etat.attente) parMail.set(m.internetMessageId, etat);
  }
  return { actif: true, parMail };
}

/**
 * Les relances de mes mails ENVOYÉS dans ces boîtes, avec leur statut maintenant : celles
 * « a-traiter » entrent dans « À traiter » (décision 9), « en-attente » restent dehors, « close »
 * (réponse arrivée) peuvent être levées. Boîte partagée : les relances posées par moi ou par un
 * membre de l'un de mes binômes ; boîte perso : toutes celles de la boîte.
 */
export async function relancesDesBoites(
  boites: { id: string; personnelle: boolean }[],
  opts: { lecteur: Lecteur; maintenant?: Date; recus?: readonly RecuDansFil[] },
): Promise<(Attente & EtatAttente)[] | null> {
  const ids = [...new Set(boites.map((b) => minuscules(b.id)).filter(Boolean))];
  const relances = await getBoiteEquipeRepository().relances(ids);
  if (relances === null) return null;
  const email = minuscules(opts.lecteur.email ?? "");
  const comptable = roleComptable(opts.lecteur.role);
  const perso = new Set(boites.filter((b) => b.personnelle).map((b) => minuscules(b.id)));
  const binomes = relances.some((r) => !perso.has(r.boite)) ? await getTriRepository().binomes() : null;
  const equipe = new Set<string>([email]);
  if (binomes) for (const cle of clesDossiersLus({ email, comptable }, binomes)) for (const m of membresDuDossier(cle, binomes)) equipe.add(m);
  const maintenant = opts.maintenant ?? new Date();
  const out: (Attente & EtatAttente)[] = [];
  for (const r of relances) {
    if (!perso.has(r.boite) && !equipe.has(minuscules(r.parEmail))) continue;
    const j = boiteTri(r.boite) ? await journalDeLaBoite(email, comptable, r.boite) : null;
    out.push({ ...r, ...etatAttente(r, maintenant, [...(j?.recus ?? []), ...(opts.recus ?? [])]) });
  }
  return out;
}
