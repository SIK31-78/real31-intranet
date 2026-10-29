"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Mail,
  Search,
  Link2,
  FilePlus2,
  Paperclip,
  Check,
  Building2,
  Users,
  Euro,
  Gavel,
  FileText,
  CalendarCheck,
  ChevronRight,
  Download,
  X,
  Send,
  Inbox,
  CircleCheck,
  Archive,
  Reply,
  ReplyAll,
  Trash2,
  ExternalLink,
  FolderPlus,
} from "lucide-react";
import type {
  ContexteCopro,
  DossierBoite,
  MailEntrant,
  MesEmails,
  ReponseOutlook,
  PieceJointeRef,
  Rattachement,
} from "@/lib/domain/mes-emails";
import {
  dossierOutlookSuggere,
  grouperDossiersBoite,
  libelleCorrespondant,
  nomDossierCopro,
  mailsDeLaBoite,
  sujetDeReponse,
  trierMails,
  typeDossierSuggere,
} from "@/lib/domain/mes-emails";
import type { BoiteMail } from "@/lib/domain/boites-mail";
import { boiteReponseParDefaut, ongletsDe, origineAffichee } from "@/lib/domain/boites-mail";
import { TYPE_DOSSIER_LABEL, TYPE_DOSSIER_ORDRE, type TypeDossier } from "@/lib/domain/dossier";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented";
import { Button, classesBouton } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { formatDateLongue } from "@/lib/format-date";
import { TransmettreFacture } from "./transmettre-facture";
import { ReponseEnvoyee } from "./reponse-envoyee";
import { HistoriqueMail } from "./historique-mail";
import { TexteAvecLiens } from "@/components/mes-emails/texte-avec-liens";
import { PasPourMoi } from "./pas-pour-moi";
import { EnvoyerEnComptabilite } from "./envoyer-comptabilite";
import { ImagesMail } from "./images-mail";
import { useAlerteSortie } from "./alerte-sortie";
import { pastilleGlissable, useDepotDestinataire, useDepotFichiers } from "./glisser-deposer";
import {
  fusionnerModele,
  prefixeObjetCopro,
  resumeDestinataires,
  sansPolitesseEnDouble,
  type DestinataireTrouve,
  type ModeleMail,
} from "@/lib/domain/mes-emails-composition";
import { rechercherDestinatairesAction } from "@/app/mes-emails/composer/actions";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { estMailInterne } from "@/lib/domain/tri-emails";
import { traitesAuChargement, chiffreATraiter } from "@/lib/domain/mes-emails-liste";
import { publierChiffre } from "./chiffre-a-traiter";
import { VisionneusePj, type ApercuPj } from "./visionneuse-pj";
import { deposerFichier } from "./deposer-fichier";
import { NB_MAX_FICHIERS, TAILLE_MAX_FICHIER, TAILLE_MAX_TOTALE, typePieceJointe, urlPieceJointe } from "@/lib/domain/piece-jointe-flux";
import { ResultatsFouille, type Fouille } from "./resultats-fouille";
import { EnvoyesVue } from "./envoyes-vue";
import { TransfererMail } from "./transferer-mail";
import { ecrireDansLaReponse } from "./focus-reponse";
import { EditeurRiche } from "./editeur-riche";
import { BoutonReformuler } from "./bouton-reformuler";
import { htmlVersTexte, texteVersHtml } from "@/lib/domain/mes-emails-html";
import { rechercherEchangesAction } from "@/app/echanges/actions";
import {
  marquerTraiteAction,
  editBrouillonAction,
  marquerLuAction,
  preparerEnvoiAction,
  finaliserEnvoiAction,
  abandonnerEnvoiAction,
  chargerPiecesJointesAction,
  transmettreFactureAction,
  rattacherCoproAction,
  chargerDossiersAction,
  creerDossierOutlookAction,
  classerDansDossierAction,
  chargerDossiersCoproAction,
  chargerContexteCoproAction,
  rattacherADossierAction,
  creerDossierDepuisMailAction,
  envoyerABonneCoproAction,
  mettreALaCorbeilleAction,
} from "@/app/mes-emails/actions";

type Statut = "nouveau" | "repondu" | "classe";

type Destinataires = { to: string[]; cc: string[]; cci: string[] };

// Destinataires par defaut d'une reponse : A = l'expediteur ; Cc = les autres
// participants (To + Cc d'origine, dedupliques, sans l'expediteur) ; Cci vide.
function defautDestinataires(m: MailEntrant): Destinataires {
  const exp = (m.expediteurEmail || "").trim();
  const to = exp.includes("@") ? [exp] : [];
  const moi = (m.boite ?? "").toLowerCase();
  const autres = [...m.destinataires, ...m.copie]
    .map((e) => e.trim())
    .filter((e) => e.includes("@") && e.toLowerCase() !== exp.toLowerCase() && e.toLowerCase() !== moi);
  return { to, cc: [...new Set(autres)], cci: [] };
}

function jourMois(iso: string): string {
  return formatDateLongue(iso).replace(/ \d{4}$/, "");
}

/** La réponse avant reformulation : undefined = rien de saisi (le brouillon d'origine fait foi). */
type InstantaneReponse = { texte: string | undefined; html: string | undefined };
type ReformulationReponse = {
  capturer: () => InstantaneReponse;
  appliquer: (texte: string) => void;
  restaurer: (avant: InstantaneReponse) => void;
};

/** La map avec la valeur posée, ou sans la clé si la valeur est absente. */
function avecOuSans(p: Map<string, string>, id: string, v: string | undefined): Map<string, string> {
  const n = new Map(p);
  if (v === undefined) n.delete(id);
  else n.set(id, v);
  return n;
}

function formatTaille(octets: number): string {
  if (octets >= 1_000_000) return `${(octets / 1_000_000).toFixed(1)} Mo`;
  if (octets >= 1000) return `${Math.round(octets / 1000)} Ko`;
  return `${octets} o`;
}

export function MesEmailsVue({
  data,
  signatureHtml,
  adresseFactures = null,
  maxPerso = 40,
  agence = "",
  modeles,
  pilote = false,
  reformulation = false,
}: {
  /** « Reformuler » proposé dans la réponse et le transfert (ADR-051). */
  reformulation?: boolean;
  data: MesEmails;
  /** Super-admin : voit les nouveautés de l'écran avant tout le monde (cf. page.tsx). */
  pilote?: boolean;
  /** Modèles de réponse proposés (agence et cabinet). */
  modeles: ModeleMail[];
  /** Agence de la personne (27/10/2026) : signe les modèles de réponse. */
  agence?: string;
  /** Plafond de la boîte perso pour cet affichage (« Plus de mails » l'augmente). */
  maxPerso?: number;
  signatureHtml?: string | null;
  /** Où part la facture (texte affiché) ; null = aucune boîte factures ESTALE configurée, bouton masqué. */
  adresseFactures?: string | null;
}) {
  // Boite affichee. Les deux boites ne sont JAMAIS fusionnees (decision Sekou 5) :
  // on en regarde une a la fois, la perso par defaut.
  const boiteParDefaut =
    data.boites.find((b) => b.personnelle)?.id ?? data.boites[0]?.id ?? "";
  const [boiteActive, setBoiteActive] = useState<string>(boiteParDefaut);
  const toast = useToast();
  const confirmer = useConfirm();

  // Tout l'ecran (liste, compteurs, dossiers copro) ne parle que de la boite active.
  const mailsBoite = useMemo(
    () =>
      data.boites.length > 0
        ? mailsDeLaBoite(data.mails, boiteActive, data.boites)
        : data.mails,
    [data.mails, data.boites, boiteActive],
  );
  const mailsTries = useMemo(() => trierMails(mailsBoite), [mailsBoite]);
  const [selId, setSelId] = useState<string>(mailsTries[0]?.id ?? "");
  // `m.lu` = lu dans Outlook OU dans l'intranet (REA-422) : la pastille et le compteur bleu
  // des onglets de boîte disent la même chose qu'Outlook.
  const [lus, setLus] = useState<Set<string>>(
    () => new Set(data.mails.filter((m) => m.lu).map((m) => m.id)),
  );
  const [repondus, setRepondus] = useState<Set<string>>(
    () =>
      new Set(
        data.mails
          .filter((m) => m.statutTraitement === "repondu")
          .map((m) => m.id),
      ),
  );
  // Réponse ou transfert PARTIS depuis l'écran, dans cette session (REA-422) : le badge le dit
  // tout de suite, sans attendre que le marqueur d'Outlook soit relu au rechargement.
  const [reponsesSession, setReponsesSession] = useState<Map<string, ReponseOutlook>>(new Map());
  /** Le badge « Répondu » / « Transféré » : ce qui vient d'être fait ici, sinon le marqueur
   *  d'Outlook (le dernier geste, fait dans l'un ou l'autre outil), sinon le statut en base. */
  const reponseDe = (m: MailEntrant): ReponseOutlook | null =>
    reponsesSession.get(m.id) ?? m.reponseOutlook ?? (repondus.has(m.id) ? "repondu" : null);
  const noterReponse = (id: string, r: ReponseOutlook) => {
    setRepondus((p) => add(p, id));
    setReponsesSession((p) => new Map(p).set(id, r));
  };
  // Mails partis ailleurs (« Pas pour moi », « Comptabilité ») : retirés de la liste sans attendre le rechargement.
  // Copro choisie gérée par un autre binôme : l'envoi lui est proposé (REA-327).
  const [envoisProposes, setEnvoisProposes] = useState<Map<string, { reference: string; dossier: string }>>(new Map());
  const [partis, setPartis] = useState<Set<string>>(new Set());
  // Sortis de « À traiter » : archivés (boîte perso) ou marqués traités (boîte partagée) dans
  // cette session, et au chargement les traités de la boîte partagée. Plus d'onglet « Conclus »
  // (REA-422, 27/10/2026) : un mail archivé a quitté la réception, on le retrouve dans Outlook.
  const [classes, setClasses] = useState<Set<string>>(() => traitesAuChargement(data.mails, data.boites));
  // L'heure du calcul du retard (« plus de 2 jours ouvrés ») : posée au chargement, avancée à
  // chaque actualisation automatique (pas de Date.now() pendant le rendu).
  const [maintenant] = useState(() => new Date());
  // Le chiffre unique « À traiter » (décision 1, 29/10/2026) : la boîte de travail, sans ce qui
  // est sorti (traité, archivé, parti ailleurs), plus les mails non chargés. Publié pour la
  // pastille de la barre latérale, le titre de l'écran et celui de l'onglet du navigateur.
  const sortis = useMemo(() => new Set([...classes, ...partis]), [classes, partis]);
  const horsListe = data.aTraiterHorsListe;
  const chiffre = useMemo(
    () => chiffreATraiter(data.mails, data.boites, sortis, { maintenant, ...(horsListe ? { horsListe } : {}) }),
    [data.mails, data.boites, sortis, maintenant, horsListe],
  );
  useEffect(() => {
    publierChiffre(chiffre);
    document.title = chiffre.principal > 0 ? `(${chiffre.principal}) E-mails - REAL31 Intranet` : "E-mails - REAL31 Intranet";
  }, [chiffre]);
  useEffect(
    () => () => {
      publierChiffre(null);
    },
    [],
  );
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  // Réponse mise en forme (REA-345, pilote) : le HTML de l'éditeur, par mail, tant qu'on y a
  // touché. `edits` en garde le texte (contrôles, brouillon enregistré). Un texte posé
  // d'ailleurs (modèle, brouillon IA) efface ce HTML : l'éditeur repart de ce texte.
  const [editsHtml, setEditsHtml] = useState<Map<string, string>>(new Map());
  const oublierHtml = (id: string) =>
    setEditsHtml((p) => {
      if (!p.has(id)) return p;
      const n = new Map(p);
      n.delete(id);
      return n;
    });
  /** Le HTML à envoyer : seulement en pilote, et si l'éditeur a servi. */
  const corpsHtmlEnvoi = (m: MailEntrant): string | undefined => (pilote ? editsHtml.get(m.id) : undefined);
  const [overrides, setOverrides] = useState<Map<string, Rattachement>>(new Map());
  const [changer, setChanger] = useState(false);
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [recherche, setRecherche] = useState("");
  // Recherche dans TOUS les échanges (ex-écran Échanges) : null = on regarde la boîte.
  const [fouille, setFouille] = useState<Fouille | null>(null);
  function lancerFouille() {
    const saisie = recherche.trim();
    if (saisie.length < 2) return;
    setFouille({ saisie, enCours: true });
    void rechercherEchangesAction({ saisie }).then((r) =>
      setFouille(
        r.ok && r.donnees
          ? { saisie, enCours: false, resultat: r.donnees }
          : { saisie, enCours: false, erreur: r.ok ? "La recherche n'a rien renvoyé." : r.erreur },
      ),
    );
  }
  // Mails cochés pour la corbeille (REA-340, pilote) : boîte perso seulement.
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [corbeilleEnCours, setCorbeilleEnCours] = useState(false);
  // Ma boîte seulement : la boîte d'un titulaire ouverte par délégation se traite, ne se vide pas (27/10/2026).
  const maBoite = (id: string): boolean => {
    const b = data.boites.find((x) => x.id === id);
    return !!b?.personnelle && !b.pour;
  };
  const corbeillePossible = pilote && maBoite(boiteActive);
  // Modèle choisi pour la réponse, par mail (la liste se remet à « Aucun » à la fermeture).
  const [modeleParMail, setModeleParMail] = useState<Map<string, string>>(new Map());
  const [msgBrouillon, setMsgBrouillon] = useState<string | null>(null);
  // Le lien Outlook du brouillon créé, attaché au message qui l'annonce : un autre message
  // (ou aucun) le fait disparaître sans rien avoir à remettre à zéro (REA-408).
  const [lienBrouillon, setLienBrouillon] = useState<{ msg: string; url: string } | null>(null);
  // Verrou anti double-envoi : le bouton "Envoyer la réponse" declenche un envoi REEL
  // (irreversible). Tant qu'un envoi est en cours, on ignore les nouveaux clics et on grise
  // le bouton -> jamais deux mails envoyes pour un double-clic ou un clic pendant l'attente.
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [coprosChoisies, setCoprosChoisies] = useState<Map<string, { code: string; nom: string }>>(
    new Map(),
  );
  // Vrais dossiers Outlook, PAR BOITE (chaque boite a son arborescence). Charges en
  // lazy et memorises : rebasculer sur une boite deja vue n'attend pas. `null` = pas
  // encore charge, ce que l'UI affiche comme "Chargement des dossiers...".
  const [dossiersParBoite, setDossiersParBoite] = useState<Map<string, DossierBoite[]>>(
    new Map(),
  );
  const [dossiersChoisis, setDossiersChoisis] = useState<Map<string, string>>(new Map());
  const [msgClasser, setMsgClasser] = useState<string | null>(null);
  const [lienClasser, setLienClasser] = useState<{ msg: string; url: string } | null>(null);
  // Dossiers REELS (module Dossiers) de la copro, charges en lazy a l'ouverture du picker.
  const [dossiersReels, setDossiersReels] = useState<
    Map<string, { id: string; titre: string; type: TypeDossier }[]>
  >(new Map());
  // Contexte ESTALE par copro, charge a l'ouverture du volet (null = indisponible).
  const [contextes, setContextes] = useState<Map<string, ContexteCopro | null>>(new Map());
  // Pieces jointes REELLES chargees a la demande a l'ouverture (null = en cours).
  const [pjParMail, setPjParMail] = useState<Map<string, PieceJointeRef[] | null>>(new Map());
  // Destinataires editables de la reponse (A / Cc / Cci), par mail.
  // « Envoyés » (REA-341) : vue en pilote, lecture seule du dossier Éléments envoyés.
  const [vue, setVue] = useState<"a_traiter" | "envoyes">("a_traiter");
  const [destParMail, setDestParMail] = useState<Map<string, Destinataires>>(new Map());
  // Fichiers ajoutés depuis l'ordinateur à la réponse (en plus des PJ du mail d'origine).
  const [fichiersParMail, setFichiersParMail] = useState<Map<string, FichierJoint[]>>(new Map());
  // Mails dont l'editeur de reponse est ouvert manuellement (ex. mail sans action).
  const [composeParMail, setComposeParMail] = useState<Set<string>>(new Set());
  // Sujet editable de la reponse, par mail.
  const [sujetParMail, setSujetParMail] = useState<Map<string, string>>(new Map());
  // Boite d'EXPEDITION choisie ("De :"), par mail. Defaut = la boite qui a recu le mail
  // (le fil reste unifie sur la boite partagee, decision Sekou 6).
  const [expediteurParMail, setExpediteurParMail] = useState<Map<string, string>>(new Map());
  // PJ reçues a RE-JOINDRE a la reponse (ids d'attachment selectionnes), par mail.
  const [pjJointesParMail, setPjJointesParMail] = useState<Map<string, Set<string>>>(new Map());
  // Visionneuse de piece jointe (PDF/image) : la pièce ouverte, servie en flux par /mes-emails/pj.
  const [apercu, setApercu] = useState<ApercuPj | null>(null);

  const dossiers = dossiersParBoite.get(boiteActive) ?? null;

  useEffect(() => {
    if (dossiersParBoite.has(boiteActive)) return;
    const memoriser = (d: DossierBoite[]) =>
      setDossiersParBoite((p) => new Map(p).set(boiteActive, d));
    // Boîte partagée : rien ne se range dans un dossier Outlook (le tri l'a fait), inutile
    // d'appeler Graph pour une arborescence que personne ne lira (27/10/2026).
    if (!(data.boites.find((b) => b.id === boiteActive)?.personnelle ?? true)) {
      memoriser([]);
      return;
    }
    void chargerDossiersAction(boiteActive)
      .then(memoriser)
      .catch(() => memoriser([]));
  }, [boiteActive, dossiersParBoite, data.boites]);

  const resumeMail = (m: MailEntrant): string => `${m.objet} - de ${m.de}`;

  const statutDe = (id: string): Statut =>
    classes.has(id) ? "classe" : repondus.has(id) ? "repondu" : "nouveau";
  const rattDe = (m: MailEntrant): Rattachement => overrides.get(m.id) ?? m.rattachement;
  const brouillonDe = (m: MailEntrant): string => edits.get(m.id) ?? m.brouillonReponse ?? "";
  const coproDe = (m: MailEntrant): { code: string; nom: string } =>
    coprosChoisies.get(m.id) ?? { code: m.coproCode, nom: m.coproNom };
  const destinatairesDe = (m: MailEntrant): Destinataires =>
    destParMail.get(m.id) ?? defautDestinataires(m);
  const majDest = (m: MailEntrant, champ: keyof Destinataires, valeurs: string[]) =>
    setDestParMail((p) => new Map(p).set(m.id, { ...destinatairesDe(m), [champ]: valeurs }));
  const sujetDe = (m: MailEntrant): string => {
    const c = coproDe(m);
    return sujetParMail.get(m.id) ?? sujetDeReponse({ objet: m.objet, coproCode: c.code, coproNom: c.nom });
  };
  /** Boite qui DETIENT le mail (repli sur la boite active : les fixtures sans `boite`). */
  const boiteDuMail = (m: MailEntrant): string => m.boite ?? boiteActive;
  const expediteurDe = (m: MailEntrant): string =>
    expediteurParMail.get(m.id) ?? boiteReponseParDefaut(data.boites, boiteDuMail(m));
  const majExpediteur = (m: MailEntrant, v: string) =>
    setExpediteurParMail((p) => new Map(p).set(m.id, v));
  const majSujet = (m: MailEntrant, v: string) => setSujetParMail((p) => new Map(p).set(m.id, v));
  const pjJointesDe = (m: MailEntrant): Set<string> => pjJointesParMail.get(m.id) ?? new Set();
  const togglePjJointe = (m: MailEntrant, id: string) =>
    setPjJointesParMail((p) => {
      const courant = new Set(p.get(m.id) ?? []);
      if (courant.has(id)) courant.delete(id);
      else courant.add(id);
      return new Map(p).set(m.id, courant);
    });

  // Dossier Outlook auto-detecte (nom contenant le code copro, puis le nom) : sert de
  // preselection ; l'utilisateur peut choisir un autre dossier (copro, agence, spam...).
  // Le sous-dossier Outlook de la copro, reconnu par son code (S270 = S0270) ou son nom.
  // La copro CHOISIE dans le sélecteur, pas celle d'origine (27/10/2026) : changer la copro
  // change le dossier proposé et le dossier à créer.
  const autoDossier = (m: MailEntrant): string => {
    const c = coproDe(m);
    return dossiers ? dossierOutlookSuggere({ coproCode: c.code, coproNom: c.nom }, dossiers) : "";
  };
  // La copro n'a pas encore de sous-dossier : on propose de le créer, sous la forme « S270 - Nom ».
  const dossierACreer = (m: MailEntrant): string | null => {
    const c = coproDe(m);
    return dossiers && c.code && !dossierIdDe(m) && maBoite(boiteDuMail(m)) ? nomDossierCopro(c.code, c.nom) : null;
  };
  async function creerDossierOutlook(m: MailEntrant) {
    const nom = dossierACreer(m);
    if (!nom) return;
    setMsgClasser(`Création du dossier « ${nom} » dans Outlook…`);
    const boite = boiteDuMail(m);
    const r = await creerDossierOutlookAction(nom, boite);
    if (!r.ok || !r.dossier) {
      setMsgClasser(r.message ?? "Le dossier n'a pas pu être créé.");
      return;
    }
    const cree = r.dossier;
    setDossiersParBoite((p) => new Map(p).set(boite, [...(p.get(boite) ?? []).filter((d) => d.id !== cree.id), cree]));
    setDossiersChoisis((p) => new Map(p).set(m.id, cree.id));
    setMsgClasser(`Dossier « ${cree.nom} » prêt.`);
  }
  // Priorite : choix de session > dossier persiste (reload) > auto-detection.
  const dossierIdDe = (m: MailEntrant): string =>
    dossiersChoisis.get(m.id) ?? m.dossierClasseId ?? autoDossier(m);

  // code vide = RETIRER la copropriete (elle n'est pas obligatoire). La copro reste
  // optionnelle et reversible : on peut toujours revenir a "sans copropriete".
  const choisirCopro = (m: MailEntrant, code: string) => {
    const nom = code ? ((data.coprosDuGestionnaire ?? []).find((c) => c.code === code)?.nom ?? code) : "";
    setCoprosChoisies((p) => new Map(p).set(m.id, { code, nom }));
    void rattacherCoproAction(m.id, code, nom, boiteDuMail(m)).then((r) => {
      if (!r.ok) setMsgClasser(r.message ?? "La copro n'a pas pu être enregistrée.");
      else if (r.message) setMsgClasser(r.message);
      const propose = r.ok ? r.envoiPropose : undefined;
      setEnvoisProposes((p) => {
        const n = new Map(p);
        if (propose) n.set(m.id, propose);
        else n.delete(m.id);
        return n;
      });
    });
  };

  /**
   * Envoi en trois temps (REA-421, 27/10/2026) : le brouillon complet est préparé dans Outlook,
   * puis chaque fichier de l'ordinateur y est déposé par tranches (barre de progression), et
   * l'appelant envoie ou laisse le brouillon. Un fichier refusé : le brouillon incomplet est
   * supprimé, rien ne part.
   */
  async function preparerEtJoindre(m: MailEntrant, mode: "envoyer" | "brouillon") {
    const fichiers = fichiersDe(m);
    const total = fichiers.reduce((t, f) => t + f.taille, 0) + taillePjJointes(m);
    if (total > TAILLE_MAX_TOTALE) {
      return { ok: false as const, message: `Pièces jointes trop lourdes (${formatTaille(total)}) : 25 Mo au total. Dépose les plus grosses sur SharePoint et envoie le lien.` };
    }
    const dst = destinatairesDe(m);
    const prep = await preparerEnvoiAction({
      mode,
      emailId: m.id,
      coproCode: coproDe(m).code,
      corps: brouillonDe(m),
      ...(corpsHtmlEnvoi(m) ? { corpsHtml: corpsHtmlEnvoi(m) } : {}),
      sujet: sujetDe(m),
      a: dst.to,
      cc: dst.cc,
      cci: dst.cci,
      pjIds: [...pjJointesDe(m)],
      boite: boiteDuMail(m),
      expediteur: expediteurDe(m),
      fichiers: fichiers.map((f) => ({ nom: f.nom, taille: f.taille })),
    });
    if (!prep.ok || !prep.jeton) return { ok: false as const, message: prep.message ?? "La préparation a échoué." };
    for (const [i, f] of fichiers.entries()) {
      if (fichiers.length) setMsgBrouillon(`Pièce jointe ${i + 1} sur ${fichiers.length} : « ${f.nom} »…`);
      const r = await deposerFichier(prep.jeton, f.fichier, (x) => majProgres(m, i, x));
      if (!r.ok) {
        void abandonnerEnvoiAction({ jeton: prep.jeton });
        majProgres(m, null, 0);
        return { ok: false as const, message: `${r.erreur} Rien n'est parti, la réponse est toujours là.` };
      }
    }
    return { ...prep, ok: true as const, jeton: prep.jeton };
  }

  async function creerBrouillon(m: MailEntrant) {
    setMsgBrouillon("Création du brouillon dans Outlook…");
    const r = await preparerEtJoindre(m, "brouillon");
    majProgres(m, null, 0);
    // Graph ne rend pas toujours le lien du brouillon (REA-422) : sans lien, on dit où le
    // trouver plutôt que d'afficher un lien mort.
    const msg = r.ok
      ? `Brouillon créé dans ${boiteDuMail(m)}, avec destinataires, objet et pièces jointes : à relire puis envoyer dans Outlook.` +
        (r.webLink ? "" : ` Il est dans le dossier « Brouillons » de ${boiteDuMail(m)}.`)
      : `Échec : ${r.message}`;
    setMsgBrouillon(msg);
    setLienBrouillon(r.ok && r.webLink ? { msg, url: r.webLink } : null);
  }

  // Ouvre l'editeur de reponse. « Répondre » = l'expediteur seul ; « Répondre à tous » =
  // l'expediteur en À, les autres en Cc (comme Outlook).
  const repondre = (m: MailEntrant, tous: boolean) => {
    const d = defautDestinataires(m);
    setDestParMail((p) => new Map(p).set(m.id, tous ? d : { to: d.to, cc: [], cci: [] }));
    setComposeParMail((p) => new Set(p).add(m.id));
  };
  const fichiersDe = (m: MailEntrant): FichierJoint[] => fichiersParMail.get(m.id) ?? [];
  // Les fichiers restent des File jusqu'à l'envoi (plus de base64 en mémoire, REA-421).
  function ajouterFichiers(m: MailEntrant, liste: FileList | null) {
    if (!liste?.length) return;
    const ajout: FichierJoint[] = [];
    let total = fichiersDe(m).reduce((t, f) => t + f.taille, 0) + taillePjJointes(m);
    for (const f of Array.from(liste)) {
      if (f.size > TAILLE_MAX_FICHIER) {
        setMsgBrouillon(`« ${f.name} » dépasse 25 Mo : à déposer sur SharePoint et à envoyer en lien.`);
        continue;
      }
      if (total + f.size > TAILLE_MAX_TOTALE) {
        setMsgBrouillon(`« ${f.name} » ferait dépasser 25 Mo de pièces jointes : à déposer sur SharePoint et à envoyer en lien.`);
        continue;
      }
      total += f.size;
      ajout.push({ nom: f.name, taille: f.size, fichier: f });
    }
    setFichiersParMail((p) => new Map(p).set(m.id, [...fichiersDe(m), ...ajout].slice(0, NB_MAX_FICHIERS)));
  }
  const retirerFichier = (m: MailEntrant, i: number) =>
    setFichiersParMail((p) => new Map(p).set(m.id, fichiersDe(m).filter((_, k) => k !== i)));
  /** La progression du dépôt d'un fichier (0 à 1) ; index null : on efface toutes les barres. */
  const majProgres = (m: MailEntrant, i: number | null, fraction: number) =>
    setFichiersParMail((p) => {
      const l = p.get(m.id);
      if (!l) return p;
      return new Map(p).set(
        m.id,
        l.map((f, k) => (i === null ? { nom: f.nom, taille: f.taille, fichier: f.fichier } : k === i ? { ...f, progres: fraction } : f)),
      );
    });
  // Les PJ du mail re-jointes comptent dans les 25 Mo (taille annoncée par Graph).
  const taillePjJointes = (m: MailEntrant) =>
    (pjParMail.get(m.id) ?? []).filter((pj) => pjJointesDe(m).has(pj.id)).reduce((t, pj) => t + pj.taille, 0);

  // La pièce est servie en flux par /mes-emails/pj (REA-421) : plus de base64 ni de blob, une
  // pièce de 30 Mo s'ouvre comme une de 30 Ko. Graph étiquette parfois un PDF en octet-stream :
  // le type se corrige d'après l'extension, ici pour la visionneuse et dans la route.
  const urlPj = (m: MailEntrant, pj: PieceJointeRef, inline: boolean) =>
    urlPieceJointe("mes-emails", { boite: boiteDuMail(m), message: m.id, pj: pj.id, inline });
  function telechargerPj(m: MailEntrant, pj: PieceJointeRef) {
    const a = document.createElement("a");
    a.href = urlPj(m, pj, false);
    a.download = pj.nom;
    a.click();
  }
  function voirPj(m: MailEntrant, pj: PieceJointeRef) {
    setApercu({ nom: pj.nom, type: typePieceJointe(pj.nom, pj.type), url: urlPj(m, pj, true), urlTelechargement: urlPj(m, pj, false) });
  }
  // Facture : brouillon de transfert vers la boîte factures ESTALE, objet codifié.
  async function transmettreFactureMail(m: MailEntrant, f: { compte: string; fournisseur: string; libelle: string }) {
    setMsgClasser("Création du brouillon de transfert…");
    const r = await transmettreFactureAction(m.id, coproDe(m).code, f, boiteDuMail(m));
    const msg = r.message ?? (r.ok ? "Brouillon créé." : "La transmission a échoué.");
    setMsgClasser(msg);
    setLienClasser(r.ok && r.webLink ? { msg, url: r.webLink } : null);
  }
  const fermerApercu = () => setApercu(null);


  const q = recherche.trim().toLowerCase();
  // « À traiter » = ce qui n'est ni archivé ni marqué traité (seule vue de la liste, REA-422).
  // Ordre chronologique, collègues mêlés aux autres (le choix « en haut / en bas » est retiré
  // le 29/10/2026 ; un ancien cookie real31_emails_internes n'est plus lu et expirera seul).
  const visibles = mailsTries.filter(
    (m) =>
      !partis.has(m.id) &&
      !classes.has(m.id) &&
      (q === "" || `${m.objet} ${m.de} ${m.coproCode} ${m.coproNom}`.toLowerCase().includes(q)),
  );

  const selection = visibles.find((m) => m.id === selId) ?? visibles[0];

  // Le mail affiché est marqué lu et ses pièces jointes chargées, qu'il ait été cliqué ou
  // affiché d'office (le premier de la liste à l'arrivée, après un changement de boîte, de vue
  // ou de recherche). Jusqu'au 27/10/2026 seul le clic le faisait : le premier mail disait
  // « Pièces jointes indisponibles » et « Transférer » n'en joignait aucune (bug B1). Une
  // seule fois par mail : le reste de l'état de la vue peut changer sans rejouer les appels.
  const selectionId = selection?.id ?? "";
  const dejaAffiches = useRef(new Set<string>());
  useEffect(() => {
    if (!selectionId || dejaAffiches.current.has(selectionId)) return;
    const m = data.mails.find((x) => x.id === selectionId);
    if (!m) return;
    dejaAffiches.current.add(selectionId);
    // Les mises a jour d'etat partent apres le rendu (microtache) : React refuse un setState
    // synchrone dans un effet (rendus en cascade).
    if (!lus.has(selectionId)) {
      queueMicrotask(() => setLus((prev) => new Set(prev).add(selectionId)));
      // Lu aussi dans Outlook (REA-422) : la boîte qui détient le mail.
      void marquerLuAction(selectionId, m.coproCode, m.boite ?? boiteActive);
    }
    if (m.attachments.length > 0) {
      queueMicrotask(() => setPjParMail((p) => new Map(p).set(selectionId, null)));
      const copro = coprosChoisies.get(selectionId)?.code ?? m.coproCode;
      void chargerPiecesJointesAction(selectionId, copro, m.boite ?? boiteActive).then((pjs) =>
        setPjParMail((prev) => new Map(prev).set(selectionId, pjs)),
      );
    }
  }, [selectionId, data.mails, lus, coprosChoisies, boiteActive]);

  // La copro CHOISIE du mail affiché (sélecteur), pas celle d'origine : les dossiers intranet
  // et le contexte ESTALE la suivent. Avant le 27/10/2026 les dossiers étaient chargés sous la
  // copro d'origine mais lus sous la copro choisie : « Chargement des dossiers… » sans fin.
  const coproSel = selection ? coproDe(selection).code : "";
  // Charge les dossiers reels de la copro quand on ouvre le picker de rattachement.
  useEffect(() => {
    if (!changer || !coproSel || dossiersReels.has(coproSel)) return;
    void chargerDossiersCoproAction(coproSel).then((ds) =>
      setDossiersReels((p) => new Map(p).set(coproSel, ds)),
    );
  }, [changer, coproSel, dossiersReels]);

  // Contexte ESTALE de la copro, charge a l'ouverture du volet et plus au chargement de la
  // page (mesure prod du 14/10 : 2,3 s pour un volet replie par defaut).
  const contexteOuvert = ouverts.has("contexte");
  useEffect(() => {
    if (!contexteOuvert || !coproSel || contextes.has(coproSel)) return;
    void chargerContexteCoproAction(coproSel).then((c) => setContextes((p) => new Map(p).set(coproSel, c)));
  }, [contexteOuvert, coproSel, contextes]);

  const rafraichirDossiersCopro = (code: string) =>
    setDossiersReels((p) => {
      const n = new Map(p);
      n.delete(code);
      return n;
    });

  // Changer de boite : la selection et la recherche de l'ancienne boite n'ont plus de
  // sens ici -> on repart d'un ecran propre.
  function choisirBoite(id: string) {
    if (id === boiteActive) return;
    setBoiteActive(id);
    setRecherche("");
    setSelId("");
    setChanger(false);
    setOuverts(new Set());
    setMsgBrouillon(null);
    setMsgClasser(null);
    setCoches(new Set());
  }

  // Corbeille (REA-340) : seulement les mails cochés ENCORE visibles (un filtre a pu en
  // masquer), après confirmation. Réversible dans Outlook, et l'écran le dit.
  const cochesVisibles = visibles.filter((m) => coches.has(m.id));
  function cocher(id: string) {
    setCoches((p) => (p.has(id) ? del(p, id) : add(p, id)));
  }
  async function mettreALaCorbeille() {
    if (corbeilleEnCours || cochesVisibles.length === 0) return;
    const n = cochesVisibles.length;
    const ok = await confirmer({
      titre: n > 1 ? `Mettre ces ${n} mails à la corbeille ?` : "Mettre ce mail à la corbeille ?",
      message:
        "Ils partent dans « Éléments supprimés » de votre boîte Outlook : on peut les y retrouver et les remettre tant que la corbeille n'est pas vidée.",
      confirmer: "Mettre à la corbeille",
      danger: true,
    });
    if (!ok) return;
    setCorbeilleEnCours(true);
    try {
      const r = await mettreALaCorbeilleAction({ ids: cochesVisibles.map((m) => m.id), boite: boiteActive });
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      const { deplaces, echecs } = r.donnees ?? { deplaces: [], echecs: [] };
      setPartis((p) => new Set([...p, ...deplaces]));
      setCoches(new Set());
      if (deplaces.length) {
        toast.ok(deplaces.length > 1 ? `${deplaces.length} mails mis à la corbeille.` : "Mail mis à la corbeille.");
      }
      if (echecs.length) {
        toast.warn(
          echecs.length > 1
            ? `${echecs.length} mails n'ont pas pu être déplacés (déjà déplacés dans Outlook ?).`
            : "Un mail n'a pas pu être déplacé (déjà déplacé dans Outlook ?).",
        );
      }
    } finally {
      setCorbeilleEnCours(false);
    }
  }

  // Supprimer le mail ouvert (REA-408) : la même corbeille, pour un seul mail, en boîte
  // perso seulement. Sur une boîte partagée, le mail disparaîtrait aussi pour le binôme.
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const supprimable = (m: MailEntrant): boolean =>
    pilote && maBoite(boiteDuMail(m));
  async function supprimerMail(m: MailEntrant) {
    if (suppressionEnCours) return;
    const ok = await confirmer({
      titre: "Mettre ce mail à la corbeille ?",
      message:
        "Il part dans « Éléments supprimés » de votre boîte Outlook : on peut l'y retrouver et le remettre tant que la corbeille n'est pas vidée.",
      confirmer: "Mettre à la corbeille",
      danger: true,
    });
    if (!ok) return;
    setSuppressionEnCours(true);
    try {
      const r = await mettreALaCorbeilleAction({ ids: [m.id], boite: boiteDuMail(m) });
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      if (!r.donnees?.deplaces.includes(m.id)) {
        toast.warn("Le mail n'a pas pu être déplacé (déjà déplacé dans Outlook ?).");
        return;
      }
      passerAuSuivant(m);
      setPartis((p) => add(p, m.id));
      setCoches((p) => del(p, m.id));
      toast.ok("Mail mis à la corbeille.");
    } finally {
      setSuppressionEnCours(false);
    }
  }

  // Ouvrir un mail d'un clic : la sélection change ; le marquage « lu » et les pièces jointes
  // suivent la sélection (effet plus haut), que le mail ait été cliqué ou affiché d'office.
  function ouvrir(id: string) {
    setSelId(id);
    setChanger(false);
    setOuverts(new Set());
    setMsgBrouillon(null);
  }
  const add = (set: Set<string>, id: string) => new Set(set).add(id);
  const del = (set: Set<string>, id: string) => {
    const n = new Set(set);
    n.delete(id);
    return n;
  };

  // ENVOYER la reponse, INDEPENDAMMENT du classement (on peut repondre maintenant et
  // classer/agir plus tard). Pas besoin de choisir un dossier. Irreversible -> confirmation.
  async function envoyerSeul(m: MailEntrant) {
    if (envoiEnCours) return; // un envoi est deja en cours -> on ignore le double clic
    const corps = brouillonDe(m).trim();
    if (!corps) {
      setMsgBrouillon("Le message est vide.");
      return;
    }
    const dst = destinatairesDe(m);
    if (dst.to.filter((x) => x.includes("@")).length === 0) {
      setMsgBrouillon("Ajoute au moins un destinataire en « À ».");
      return;
    }
    // Pas de fenêtre de confirmation (retour du 14/10 : un clic de trop). La boîte d'envoi est
    // affichée en couleur au-dessus, et l'envoi hors du fil y est signalé avant de cliquer.
    const expediteur = expediteurDe(m);
    setEnvoiEnCours(true);
    setMsgBrouillon("Envoi en cours…");
    try {
      const r = await preparerEtJoindre(m, "envoyer");
      if (!r.ok) {
        majProgres(m, null, 0);
        setMsgBrouillon(`Échec de l'envoi : ${r.message}`);
        toast.err(`La réponse n'est pas partie : ${r.message}`);
        return;
      }
      setMsgBrouillon("Envoi en cours…");
      const fin = await finaliserEnvoiAction({ jeton: r.jeton });
      if (!fin.ok) {
        majProgres(m, null, 0);
        setMsgBrouillon(`Échec de l'envoi : ${fin.message ?? ""} La réponse est restée dans les brouillons de ${r.boite ?? expediteur}.`);
        toast.err(`La réponse n'est pas partie : ${fin.message ?? "erreur inconnue"}`);
        return;
      }
      noterReponse(m.id, "repondu");
      // La réponse est partie : l'éditeur se referme, comme dans Outlook. Le petit texte gris
      // du haut ne suffisait pas (REA-349, 16/10/2026) : un toast dit à qui et depuis où.
      fermerReponse(m);
      toast.ok(`Réponse envoyée à ${resumeDestinataires(dst.to)} depuis ${expediteur}.`);
      setMsgBrouillon(
        r.filConserve === false
          ? r.historiqueCite
            ? `Envoyé depuis ${expediteur} ✓ (avec le message d'origine cité dessous)`
            : `Envoyé depuis ${expediteur} ✓ (mail neuf, sans l'historique)`
          : `Réponse envoyée depuis ${expediteur} ✓`,
      );
    } finally {
      setEnvoiEnCours(false);
    }
  }

  // Referme l'éditeur de réponse et oublie ce qui y était saisi (envoi réussi ou « Annuler »).
  function fermerReponse(m: MailEntrant) {
    const sans = <T,>(p: Map<string, T>) => {
      const n = new Map(p);
      n.delete(m.id);
      return n;
    };
    setComposeParMail((p) => del(p, m.id));
    setEdits((p) => new Map(p).set(m.id, ""));
    oublierHtml(m.id);
    setDestParMail(sans);
    setSujetParMail(sans);
    setFichiersParMail(sans);
    setPjJointesParMail(sans);
    setModeleParMail(sans);
    setMsgBrouillon(null);
    void editBrouillonAction(m.id, m.coproCode, "");
  }

  // Une réponse en cours d'écriture (REA-408) : texte, objet retouché, pièce jointe, ou un
  // destinataire qui n'était pas dans le mail d'origine. Ne se perd pas sans confirmation.
  function reponseEnCours(m: MailEntrant): boolean {
    if (brouillonDe(m).trim() || fichiersDe(m).length || pjJointesDe(m).size || sujetParMail.has(m.id)) return true;
    const d = destParMail.get(m.id);
    if (!d) return false;
    const deja = new Set(Object.values(defautDestinataires(m)).flat().map((e) => e.toLowerCase()));
    return [...d.to, ...d.cc, ...d.cci].some((e) => !deja.has(e.toLowerCase()));
  }
  async function annulerReponse(m: MailEntrant) {
    if (reponseEnCours(m)) {
      const ok = await confirmer({
        titre: "Abandonner la réponse ?",
        message: "Le texte, les destinataires ajoutés et les pièces jointes de la réponse seront perdus.",
        confirmer: "Abandonner",
        annuler: "Continuer la réponse",
        danger: true,
      });
      if (!ok) return;
    }
    fermerReponse(m);
  }
  // Fermer ou recharger l'onglet avec une réponse ouverte et écrite : le navigateur demande.
  useAlerteSortie(data.mails.some((m) => (composeParMail.has(m.id) || (edits.get(m.id) ?? "").trim() !== "") && reponseEnCours(m)));

  // Un destinataire glissé d'un champ à l'autre (À, Cc, Cci) : retiré de l'un, ajouté à l'autre.
  function deplacerDest(m: MailEntrant, depuis: keyof Destinataires, vers: keyof Destinataires, adresse: string) {
    const d = destinatairesDe(m);
    if (!d[depuis].includes(adresse)) return;
    setDestParMail((p) =>
      new Map(p).set(m.id, {
        ...d,
        [depuis]: d[depuis].filter((x) => x !== adresse),
        [vers]: d[vers].includes(adresse) ? d[vers] : [...d[vers], adresse],
      }),
    );
  }

  // Le texte posé par le dernier modèle, par mail : passer d'un modèle à l'autre sans avoir
  // retouché le texte ne demande rien.
  const texteDuModele = useRef(new Map<string, string>());
  // Modèle appliqué à la réponse : le texte remplace le message, l'objet de la réponse reste.
  // Un texte déjà écrit (à la main ou par l'IA) ne s'écrase pas sans le demander (REA-408).
  async function appliquerModeleReponse(m: MailEntrant, id: string) {
    const modele = modeles.find((x) => x.id === id);
    const actuel = brouillonDe(m).trim();
    if (modele && actuel && actuel !== texteDuModele.current.get(m.id)) {
      const ok = await confirmer({
        titre: "Remplacer la réponse par le modèle ?",
        message: "Le texte déjà écrit sera remplacé par celui du modèle.",
        confirmer: "Remplacer",
      });
      if (!ok) return;
    }
    setModeleParMail((p) => new Map(p).set(m.id, id));
    if (!modele) return;
    const c = coproDe(m);
    oublierHtml(m.id);
    const texte = sansPolitesseEnDouble(fusionnerModele(modele.corps, {
      copro_code: c.code,
      copro_nom: c.nom,
      // La copro choisie à la main prime ; sinon celle attribuée au mail.
      copro_adresse:
        (data.coprosDuGestionnaire ?? []).find((x) => x.code === c.code)?.adresse ??
        (c.code === m.coproCode ? (m.coproAdresse ?? "") : ""),
      destinataire_nom: m.de,
      gestionnaire_nom: data.gestionnaire.nomComplet,
      gestionnaire_initiales: data.gestionnaire.initiales,
      agence,
      date: new Date().toLocaleDateString("fr-FR"),
    }), signatureHtml);
    texteDuModele.current.set(m.id, texte.trim());
    setEdits((p) => new Map(p).set(m.id, texte));
  }

  // Classer = deplacer dans le dossier Outlook choisi (independant de l'envoi).
  function valider(m: MailEntrant) {
    const folderId = dossierIdDe(m);
    if (!folderId) {
      setMsgClasser("Choisis un dossier de destination avant de classer ce mail.");
      return;
    }
    setMsgClasser(null);
    // Optimiste : le mail sort tout de suite. Si Outlook refuse, il revient dans la liste et
    // un toast le dit ; avant le 27/10/2026 le message d'échec s'affichait sous le mail
    // SUIVANT et le mail refusé restait « conclu » à l'écran.
    setClasses((p) => add(p, m.id));
    const folderNom = (dossiers ?? []).find((f) => f.id === folderId)?.nom ?? m.dossierClasseNom ?? "";
    void classerDansDossierAction(
      m.id,
      coproDe(m).code,
      folderId,
      folderNom,
      [],
      brouillonDe(m),
      boiteDuMail(m),
    ).then((r) => {
      if (r.ok) return;
      setClasses((p) => del(p, m.id));
      toast.err(`« ${m.objet} » n'a pas été archivé : ${r.message ?? "le classement a échoué."}`);
    });
    passerAuSuivant(m);
  }
  // « Marquer traité » (boîte partagée) : le mail sort de « À traiter » pour tout le binôme
  // (statut commun), sans bouger dans Outlook : il reste dans le dossier du binôme.
  function marquerTraite(m: MailEntrant) {
    setMsgClasser(null);
    setClasses((p) => add(p, m.id));
    void marquerTraiteAction(m.id, coproDe(m).code, boiteDuMail(m));
    passerAuSuivant(m);
  }
  function passerAuSuivant(m: MailEntrant) {
    // Enchaînement : on passe au mail suivant, le courant sort de la liste.
    if (vue !== "a_traiter") return;
    const idx = visibles.findIndex((x) => x.id === m.id);
    const suivant =
      visibles.slice(idx + 1).find((x) => x.id !== m.id) ??
      [...visibles.slice(0, Math.max(idx, 0))].reverse().find((x) => x.id !== m.id);
    if (suivant) ouvrir(suivant.id);
  }
  const toggleSection = (cle: string) =>
    setOuverts((p) => (p.has(cle) ? del(p, cle) : add(p, cle)));


  return (
    <div className="flex flex-col gap-3">
      {/* Barre unique : la boîte affichée (onglets), la recherche, les vues. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Un onglet par boîte, ou par groupe de boîtes (« Comptabilité » d'un comptable, 28/10/2026). */}
          {ongletsDe(data.boites).length > 1 && (
            <div role="tablist" aria-label="Boîte affichée" className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
              {ongletsDe(data.boites).map((b) => {
                // Le chiffre unique, sur l'onglet de la boîte de travail seulement (la boîte perso ne
                // compte pas, décision 1 du 29/10/2026). Rien d'affiché à 0. Couleur neutre.
                const n = b.personnelle ? 0 : chiffreATraiter(data.mails, data.boites, sortis, { maintenant, onglet: b.id, ...(horsListe ? { horsListe } : {}) }).principal;
                const actif = b.id === boiteActive;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="tab"
                    aria-selected={actif}
                    onClick={() => choisirBoite(b.id)}
                    title={b.adresse}
                    className={
                      "h-7 px-3 rounded text-body inline-flex items-center gap-1.5 transition-colors " +
                      (actif ? "bg-surface text-ink font-medium shadow-1" : "text-ink-2 hover:text-ink")
                    }
                  >
                    {b.personnelle ? <Inbox strokeWidth={1.5} className="w-3.5 h-3.5" /> : <Users strokeWidth={1.5} className="w-3.5 h-3.5" />}
                    {b.libelle}
                    {n > 0 && <span className="text-meta font-semibold text-ink-2 tabular-nums">{n}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="relative flex-1 min-w-[220px]">
            <Search strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") lancerFouille();
              }}
              placeholder="Copro (S247), personne, mot… · Entrée : chercher dans tous les échanges"
              aria-label="Filtrer la boîte ; Entrée pour chercher dans tous les échanges"
              className="pl-8"
            />
          </div>
          <Button onClick={lancerFouille} disabled={recherche.trim().length < 2} title="Chercher dans tous les échanges, reçus et envoyés">
            <Search strokeWidth={1.5} />
            Tous les échanges
          </Button>
        </div>
        {!fouille && (
        <div className="flex flex-wrap items-center gap-1.5">
          <SegmentedControl
            label="Événements affichés"
            size="sm"
            value={vue}
            onChange={(v) => v && setVue(v)}
            options={[
              // Plus de « · N » ici (29/10/2026) : c'était le nombre de mails CHARGÉS (40, 80), pas
              // le travail qui reste. Le chiffre unique est à côté du titre et sur l'onglet.
              { value: "a_traiter", label: "À traiter" },
              ...(pilote ? [{ value: "envoyes" as const, label: "Envoyés", title: "Les 30 derniers mails partis de cette boîte" }] : []),
            ]}
          />
        </div>
        )}
      </div>

      {/* Une boîte que Graph n'a pas pu lire (droits Exchange, panne) : on le dit, au lieu d'une
          liste vide qui laissait croire qu'il n'y avait rien (27/10/2026). */}
      {(data.boitesIllisibles ?? []).map((adresse) => (
        <Callout key={adresse} ton="warn">
          La boîte {adresse} n&apos;a pas pu être lue. Réessaie dans un instant.
        </Callout>
      ))}

      {fouille ? (
        <ResultatsFouille fouille={fouille} onFermer={() => setFouille(null)} />
      ) : pilote && vue === "envoyes" ? (
        <EnvoyesVue key={boiteActive} boite={boiteActive} partagee={!(data.boites.find((b) => b.id === boiteActive)?.personnelle ?? true)} />
      ) : (
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* La liste, en premier : c'est ce qu'on vient chercher. */}
        <aside className="w-full lg:w-[340px] shrink-0">
          <Card className="overflow-hidden">
            {corbeillePossible && visibles.length > 0 ? (
              <div className="flex items-center gap-2 px-3.5 py-2 border-b border-line">
                <input
                  type="checkbox"
                  aria-label="Tout cocher"
                  title="Tout cocher"
                  checked={cochesVisibles.length > 0 && cochesVisibles.length === visibles.length}
                  ref={(el) => {
                    if (el) el.indeterminate = cochesVisibles.length > 0 && cochesVisibles.length < visibles.length;
                  }}
                  onChange={() =>
                    setCoches(cochesVisibles.length === visibles.length ? new Set() : new Set(visibles.map((m) => m.id)))
                  }
                  className="accent-green-700 w-3.5 h-3.5"
                />
                <span className="text-meta text-ink-3 mr-auto">
                  {cochesVisibles.length ? `${cochesVisibles.length} coché${cochesVisibles.length > 1 ? "s" : ""}` : "Cocher pour supprimer"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={cochesVisibles.length === 0}
                  loading={corbeilleEnCours}
                  onClick={() => void mettreALaCorbeille()}
                  title="Déplace les mails cochés dans « Éléments supprimés » d'Outlook"
                >
                  <Trash2 strokeWidth={1.5} />
                  Mettre à la corbeille
                </Button>
              </div>
            ) : null}
            <ul className="divide-y divide-line max-h-[calc(100vh-220px)] overflow-auto">
              {visibles.map((m) => (
                <LigneMail
                  key={m.id}
                  {...(corbeillePossible ? { coche: coches.has(m.id), onCocher: () => cocher(m.id) } : {})}
                  m={m}
                  origine={origineAffichee(data.boites, m.boite)}
                  actif={m.id === selection?.id}
                  lu={lus.has(m.id)}
                  reponse={reponseDe(m)}
                  onClick={() => ouvrir(m.id)}
                />
              ))}
              {visibles.length === 0 && (
                <li className="px-4 py-6 text-center text-body text-ink-3">Aucun mail.</li>
              )}
            </ul>
            {/* Plafond de la page : 200 (plafondPerso), au-delà le lien ne ferait que recharger. */}
            {data.plusDeMails && maxPerso < 200 && data.boites.find((b) => b.id === boiteActive)?.personnelle ? (
              <div className="px-4 py-3 border-t border-line text-center">
                <Link href={`/mes-emails?plus=${maxPerso + 40}`} className={classesBouton({ variant: "ghost", size: "sm" })}>
                  Plus de mails
                </Link>
              </div>
            ) : null}
          </Card>
        </aside>

        {/* Volet droit : recommandation + detail */}
        <section className="flex-1 min-w-0">
          {selection ? (
            <AnalysePane
              m={selection}
              contexte={coproSel ? contextes.get(coproSel) : null}
              ratt={rattDe(selection)}
              dossiersReels={dossiersReels.get(coproDe(selection).code) ?? null}
              typeSuggere={typeDossierSuggere(selection.type)}
              statut={statutDe(selection.id)}
              brouillon={brouillonDe(selection)}
              coproCode={coproDe(selection).code}
              coproNom={coproDe(selection).nom}
              coprosDispo={data.coprosDuGestionnaire ?? []}
              onRattacherCopro={(code) => choisirCopro(selection, code)}
              dossiers={dossiers}
              dossierIdChoisi={dossierIdDe(selection)}
              onChoisirDossier={(id) =>
                setDossiersChoisis((p) => new Map(p).set(selection.id, id))
              }
              dossierACreer={dossierACreer(selection)}
              onCreerDossierOutlook={() => void creerDossierOutlook(selection)}
              msgClasser={msgClasser}
              lienClasser={lienClasser?.msg === msgClasser ? lienClasser.url : null}
              envoiPropose={envoisProposes.get(selection.id) ?? null}
              onEnvoyerPropose={(p) => {
                const m = selection;
                void envoyerABonneCoproAction(m.id, p.reference, boiteDuMail(m)).then((r) => {
                  if (!r.ok) return setMsgClasser(r.erreur);
                  setMsgClasser(`Mail envoyé dans le dossier ${r.donnees?.dossierNom ?? p.dossier}.`);
                  setEnvoisProposes((x) => {
                    const n = new Map(x);
                    n.delete(m.id);
                    return n;
                  });
                  setPartis((x) => new Set(x).add(m.id));
                  passerAuSuivant(m);
                });
              }}
              signatureHtml={signatureHtml}
              onCreerBrouillon={() => void creerBrouillon(selection)}
              compose={composeParMail.has(selection.id)}
              onRepondre={(tous) => repondre(selection, tous)}
              fichiers={fichiersDe(selection)}
              onAjouterFichiers={(l) => void ajouterFichiers(selection, l)}
              onRetirerFichier={(i) => retirerFichier(selection, i)}
              modeles={modeles}
              // Pas encore demandées (premier rendu) ou en cours : null = « Chargement… ».
              piecesJointes={pjParMail.get(selection.id) ?? null}
              onTelecharger={(pj) => void telechargerPj(selection, pj)}
              onApercu={(pj) => void voirPj(selection, pj)}
              {...(adresseFactures
                ? { adresseFactures, onTransmettreFacture: (f: { compte: string; fournisseur: string; libelle: string }) => transmettreFactureMail(selection, f) }
                : {})}
              pjJointes={pjJointesDe(selection)}
              onTogglePjJointe={(id) => togglePjJointe(selection, id)}
              destinataires={destinatairesDe(selection)}
              onMajDestinataires={(champ, v) => majDest(selection, champ, v)}
              onDeplacerDestinataire={(depuis, vers, adresse) => deplacerDest(selection, depuis, vers, adresse)}
              modele={modeleParMail.get(selection.id) ?? ""}
              onModele={(id) => void appliquerModeleReponse(selection, id)}
              onAnnuler={() => void annulerReponse(selection)}
              boites={data.boites}
              boiteDuMail={boiteDuMail(selection)}
              expediteur={expediteurDe(selection)}
              onMajExpediteur={(v) => majExpediteur(selection, v)}
              sujet={sujetDe(selection)}
              onMajSujet={(v) => majSujet(selection, v)}
              onEnvoyer={() => void envoyerSeul(selection)}
              envoiEnCours={envoiEnCours}
              msgBrouillon={msgBrouillon}
              lienBrouillon={lienBrouillon?.msg === msgBrouillon ? lienBrouillon.url : null}
              changer={changer}
              ouverts={ouverts}
              onEditBrouillon={(t) => setEdits((p) => new Map(p).set(selection.id, t))}
              brouillonHtml={editsHtml.get(selection.id) ?? texteVersHtml(brouillonDe(selection))}
              onEditBrouillonHtml={(h) => {
                setEditsHtml((p) => new Map(p).set(selection.id, h));
                setEdits((p) => new Map(p).set(selection.id, htmlVersTexte(h)));
              }}
              reformulation={
                reformulation
                  ? {
                      // L'état exact de la réponse (texte et HTML), pour « Annuler la reformulation ».
                      capturer: () => ({ texte: edits.get(selection.id), html: editsHtml.get(selection.id) }),
                      // Le texte reformulé se pose comme un modèle : l'éditeur repart de ce texte.
                      appliquer: (t: string) => {
                        const id = selection.id;
                        oublierHtml(id);
                        setEdits((p) => new Map(p).set(id, t));
                      },
                      restaurer: (avant: InstantaneReponse) => {
                        const id = selection.id;
                        setEdits((p) => avecOuSans(p, id, avant.texte));
                        setEditsHtml((p) => avecOuSans(p, id, avant.html));
                      },
                    }
                  : null
              }
              onBlurBrouillon={() =>
                void editBrouillonAction(selection.id, selection.coproCode, brouillonDe(selection))
              }
              onToggleChanger={() => setChanger((v) => !v)}
              onRattacherDossier={(dossierId, titre) => {
                setOverrides((prev) =>
                  new Map(prev).set(selection.id, {
                    statut: "existant",
                    dossierId,
                    dossierLabel: titre,
                    intranet: true,
                  }),
                );
                setChanger(false);
                void rattacherADossierAction(
                  selection.id,
                  coproDe(selection).code,
                  dossierId,
                  titre,
                  resumeMail(selection),
                );
              }}
              onCreerDossier={(type, titre) => {
                void creerDossierDepuisMailAction(
                  selection.id,
                  coproDe(selection).code,
                  type,
                  titre,
                  resumeMail(selection),
                ).then((res) => {
                  if (res.ok && res.dossierId) {
                    const id = res.dossierId;
                    setOverrides((prev) =>
                      new Map(prev).set(selection.id, {
                        statut: "existant",
                        dossierId: id,
                        dossierLabel: titre,
                        intranet: true,
                      }),
                    );
                    setChanger(false);
                    rafraichirDossiersCopro(coproDe(selection).code);
                  }
                });
              }}
              onValider={() => void valider(selection)}
              classementOutlook={data.boites.find((b) => b.id === boiteDuMail(selection))?.personnelle ?? true}
              pilote={pilote}
              onParti={() => {
                setPartis((p) => new Set(p).add(selection.id));
                passerAuSuivant(selection);
              }}
              onConclure={() => marquerTraite(selection)}
              onTransfere={() => noterReponse(selection.id, "transfere")}
              {...(supprimable(selection)
                ? { onSupprimer: () => void supprimerMail(selection), suppressionEnCours }
                : {})}
              onToggleSection={toggleSection}
            />
          ) : (
            <Card className="px-6 py-16 text-center">
              <Mail strokeWidth={1.25} className="w-8 h-8 text-ink-3 mx-auto" />
              <p className="text-body font-medium text-ink mt-3">Rien à traiter</p>
              <p className="text-body text-ink-3 mt-1">Les mails archivés se retrouvent dans leur dossier Outlook.</p>
            </Card>
          )}
        </section>
      </div>
      )}

      <VisionneusePj apercu={apercu} onFermer={fermerApercu} />
    </div>
  );
}

function StatutBadge({ statut }: { statut: Statut }) {
  if (statut === "repondu") return <Badge ton="info">Répondu</Badge>;
  return null;
}

/** Une boite dans le rail : libelle + adresse + compteur de non-lus. */
function LigneMail({
  m,
  origine = null,
  actif,
  lu,
  reponse,
  onClick,
  coche,
  onCocher,
}: {
  m: MailEntrant;
  /** La boîte d'origine (« syndic4 ») quand l'onglet en regroupe plusieurs (28/10/2026). */
  origine?: string | null;
  /** Case de sélection (corbeille, REA-340) : absente hors pilote et hors boîte perso. */
  coche?: boolean;
  onCocher?: () => void;
  actif: boolean;
  lu: boolean;
  reponse: ReponseOutlook | null;
  onClick: () => void;
}) {
  const qui = m.de.replace(/ \(.*\)$/, "");
  return (
    <li className={(actif ? "bg-green-50" : "hover:bg-surface-2") + (onCocher ? " flex items-start" : "")}>
      {onCocher ? (
        <input
          type="checkbox"
          checked={coche ?? false}
          onChange={onCocher}
          aria-label={`Cocher « ${m.objet} »`}
          className="accent-green-700 w-3.5 h-3.5 mt-3 ml-3.5 shrink-0"
        />
      ) : null}
      <button
        type="button"
        onClick={onClick}
        className={"text-left py-2.5 transition-colors " + (onCocher ? "flex-1 min-w-0 pl-2 pr-3.5" : "w-full px-3.5")}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${!lu ? "bg-info-500" : "bg-transparent"}`} />
          <span
            className={
              "text-body text-ink truncate flex-1 " + (!lu ? "font-semibold" : "font-medium")
            }
          >
            {m.objet}
          </span>
          {m.attachments.length > 0 ? (
            <Paperclip strokeWidth={1.75} className="w-3.5 h-3.5 shrink-0 text-ink-3" aria-label="Pièce jointe" />
          ) : null}
          <span className="shrink-0 text-meta text-ink-3">{jourMois(m.date)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 pl-4 text-meta text-ink-3">
          <span className={"shrink-0 font-mono " + (m.coproCode ? "text-ink-2" : "text-ink-3")}>{m.coproCode || "-"}</span>
          <span className="truncate">· {qui}</span>
          {origine ? <span className="shrink-0">· {origine}</span> : null}
          {/* Arrivé par une délégation de portefeuille : pour qui l'on répond (27/10/2026). */}
          {m.pour ? (
            <span className="shrink-0">
              <Badge ton="brand">Pour {m.pour}</Badge>
            </span>
          ) : null}
          {/* Un collègue du cabinet, pas un client : simple repère, ton neutre (pas une alerte, REA-408). */}
          {estMailInterne(m.expediteurEmail, m.boite ?? "") ? (
            <span className={"shrink-0" + (reponse ? "" : " ml-auto")}>
              <Badge ton="neutral">Interne</Badge>
            </span>
          ) : null}
          {reponse ? (
            <span className="ml-auto shrink-0">
              <Badge ton="info">{reponse === "transfere" ? "Transféré" : "Répondu"}</Badge>
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}

/** « Ouvrir le brouillon dans Outlook », après le message qui annonce le brouillon créé. */
function LienBrouillonOutlook({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-info-700 hover:underline">
      Ouvrir le brouillon dans Outlook
      <ExternalLink strokeWidth={1.5} className="w-3 h-3" />
    </a>
  );
}

/**
 * Choix de la boite d'EXPEDITION ("De :"). Par defaut celle qui a recu le mail, pour que
 * le fil reste unifie sur la boite partagee (decision Sekou 6). Choisir une autre boite
 * est possible mais Graph ne sait alors plus repondre DANS le fil : on l'ecrit sous le
 * champ, avant l'envoi, plutot que de laisser la surprise arriver apres.
 * Masque s'il n'y a qu'une boite : il n'y a rien a choisir.
 */
function ChampDe({
  boites,
  boiteDuMail,
  valeur,
  onChange,
}: {
  boites: BoiteMail[];
  boiteDuMail: string;
  valeur: string;
  onChange: (v: string) => void;
}) {
  const horsFil = valeur !== boiteDuMail;
  // La boîte d'envoi saute aux yeux (retour du 14/10) : bleu pour une boîte partagée, qui
  // engage le cabinet ; vert pour sa boîte perso.
  const partagee = !(boites.find((b) => b.id === valeur)?.personnelle ?? false);
  const teinte = partagee
    ? "bg-info-50 text-info-700 border-info-500/40 font-semibold"
    : "bg-green-50 text-green-700 border-green-500/40 font-semibold";
  return (
    <div className="mb-2 rounded-md border border-line px-2.5 py-2">
      <div className="flex items-center gap-2">
        <label htmlFor="champ-de" className="w-7 shrink-0 text-meta font-medium text-ink-3">
          De
        </label>
        {boites.length < 2 ? (
          <span className={`inline-flex items-center h-7 px-2 rounded border text-meta ${teinte}`}>{valeur}</span>
        ) : (
        <select
          id="champ-de"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 min-w-0 h-7 rounded border px-1.5 text-meta ${teinte}`}
        >
          {boites.map((b) => (
            <option key={b.id} value={b.id}>
              {b.adresse}
              {b.id === boiteDuMail ? " (boîte du mail)" : ""}
            </option>
          ))}
        </select>
        )}
      </div>
      {horsFil && (
        // Le message d'origine est cité sous la signature depuis REA-302 ; ce sont les pièces
        // jointes cochées qui ne suivent pas (envoyerNeuf n'en reprend aucune).
        <p className="mt-1.5 pl-9 text-meta text-warn-700">
          Envoi hors du fil : le mail partira comme un message neuf, avec le message d’origine
          cité dessous, mais sans les pièces jointes cochées.
        </p>
      )}
    </div>
  );
}

// Editeur de destinataires de la reponse : A / Cc / Cci, chips + ajout/retrait.
function ChampsDestinataires({
  valeur,
  onChange,
  onDeplacer,
}: {
  valeur: Destinataires;
  onChange: (champ: keyof Destinataires, v: string[]) => void;
  onDeplacer: (depuis: keyof Destinataires, vers: keyof Destinataires, adresse: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 mb-2 rounded-md border border-line px-2.5 py-2">
      <LigneDest label="À" champ="to" valeurs={valeur.to} onChange={onChange} onDeplacer={onDeplacer} />
      <LigneDest label="Cc" champ="cc" valeurs={valeur.cc} onChange={onChange} onDeplacer={onDeplacer} />
      <LigneDest label="Cci" champ="cci" valeurs={valeur.cci} onChange={onChange} onDeplacer={onDeplacer} />
    </div>
  );
}

/** Une boîte partagée du cabinet (syndic1, syndic2…) : en rouge dans une réponse, sans bloquer. */
const BOITE_PARTAGEE = /^syndic\d+@real31\.fr$/i;

function LigneDest({
  label,
  champ,
  valeurs,
  onChange,
  onDeplacer,
}: {
  label: string;
  champ: keyof Destinataires;
  valeurs: string[];
  onChange: (champ: keyof Destinataires, v: string[]) => void;
  onDeplacer: (depuis: keyof Destinataires, vers: keyof Destinataires, adresse: string) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const depot = useDepotDestinataire(champ, (depuis, adresse) => onDeplacer(depuis as keyof Destinataires, champ, adresse));
  const ajouter = () => {
    const e = saisie.trim().replace(/[,;]$/, "").trim();
    if (e && !valeurs.includes(e)) onChange(champ, [...valeurs, e]);
    setSaisie("");
  };
  // Recherche dans l'annuaire, comme « Envoyer un e-mail » et « Transférer » (REA-408) : un
  // nom tapé propose les personnes ; une adresse tapée passe toujours telle quelle.
  const [trouves, setTrouves] = useState<{ q: string; liste: DestinataireTrouve[] } | null>(null);
  const q = saisie.trim();
  const chercher = q.length >= 3 && !q.includes("@");
  const resultats = chercher && trouves?.q === q ? trouves.liste : null;
  useEffect(() => {
    if (!chercher) return;
    const t = setTimeout(() => {
      void rechercherDestinatairesAction({ texte: q }).then((r) => setTrouves({ q, liste: r.ok ? (r.donnees ?? []) : [] }));
    }, 300);
    return () => clearTimeout(t);
  }, [q, chercher]);
  // Une personne choisie : toutes ses adresses rejoignent le champ.
  const ajouterPersonne = (d: DestinataireTrouve) => {
    const nouvelles = d.emails.filter((e) => !valeurs.some((v) => v.toLowerCase() === e.toLowerCase()));
    if (nouvelles.length) onChange(champ, [...valeurs, ...nouvelles]);
    setSaisie("");
    setTrouves(null);
  };
  return (
    <div
      {...depot.zone}
      className={"relative flex items-start gap-2 min-h-[24px] rounded " + (depot.survol ? "bg-green-50/60 ring-1 ring-green-600" : "")}
    >
      <span className="w-7 shrink-0 pt-1 text-meta font-medium text-ink-3">{label}</span>
      <div className="flex-1 flex flex-wrap items-center gap-1">
        {valeurs.map((e) => (
          <span
            key={e}
            {...pastilleGlissable(champ, e)}
            title={BOITE_PARTAGEE.test(e) ? "Boîte partagée (glisser vers un autre champ)" : "Glisser vers un autre champ"}
            className={
              "inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full text-meta cursor-grab active:cursor-grabbing " +
              (BOITE_PARTAGEE.test(e) ? "bg-err-50 text-err-700 border border-err-500/40" : "bg-surface-3 text-ink-2")
            }
          >
            <span className="truncate max-w-[200px]">{e}</span>
            <button
              type="button"
              onClick={() => onChange(champ, valeurs.filter((x) => x !== e))}
              aria-label={`Retirer ${e}`}
              className="text-ink-3 hover:text-err-700"
            >
              <X strokeWidth={2} className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={saisie}
          onChange={(ev) => setSaisie(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape" && resultats) {
              ev.preventDefault();
              setTrouves(null);
              return;
            }
            if (ev.key === "Enter" || ev.key === "," || ev.key === ";") {
              ev.preventDefault();
              if (resultats?.length === 1) ajouterPersonne(resultats[0]!);
              else ajouter();
            }
          }}
          onBlur={ajouter}
          placeholder="nom ou adresse…"
          aria-label={`Destinataires ${label}`}
          className="flex-1 min-w-[120px] h-6 bg-transparent text-meta text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      {resultats && (
        <ul className="absolute left-9 right-0 top-full mt-1 z-20 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface shadow-2 py-1">
          {resultats.length === 0 && <li className="px-3 py-2 text-meta text-ink-3">Personne de ce nom dans l&apos;annuaire Crypto.</li>}
          {resultats.map((d) => (
            <li key={d.cle}>
              <button
                type="button"
                // Le clic ne doit pas d'abord vider le champ par le blur (qui ajouterait le nom tapé).
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ajouterPersonne(d)}
                className="w-full text-left px-3 py-1.5 hover:bg-surface-2"
              >
                <span className="text-body text-ink">{d.nom || d.emails[0]}</span>
                {d.casquette ? <span className="text-meta text-ink-3"> · {d.casquette}</span> : null}
                <span className="block text-meta text-ink-3 truncate">{d.emails.join(" ; ")}</span>
                {d.copros.length > 0 && (
                  <span className="block text-meta text-ink-2 truncate">{d.copros.map((c) => prefixeObjetCopro(c)).join("  |  ")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mots utiles d'un texte, pour rapprocher l'objet d'un mail du titre d'un dossier. */
function motsUtiles(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !["pour", "dans", "avec", "votre", "notre", "suite", "objet"].includes(w)),
  );
}

// Rattacher le mail à un dossier en un geste (retour du 14/10 : « trop brouillon »). Une
// recherche, les dossiers les plus proches de l'objet en tête, et la création d'un dossier
// au nom de l'objet en un clic ; le formulaire complet ne s'ouvre que si on veut changer.
function ChoixDossier({
  dossiers,
  objet,
  typeSuggere,
  onRattacher,
  onCreer,
}: {
  dossiers: { id: string; titre: string; type: TypeDossier }[] | null;
  objet: string;
  typeSuggere: TypeDossier;
  onRattacher: (dossierId: string, titre: string) => void;
  onCreer: (type: TypeDossier, titre: string) => void;
}) {
  const [q, setQ] = useState("");
  const [formulaire, setFormulaire] = useState(false);
  const motsObjet = useMemo(() => motsUtiles(objet), [objet]);
  const classes = useMemo(() => {
    const liste = (dossiers ?? []).map((d) => {
      const communs = [...motsUtiles(d.titre)].filter((w) => motsObjet.has(w)).length;
      return { d, score: communs * 2 + (d.type === typeSuggere ? 1 : 0) };
    });
    return liste.sort((x, y) => y.score - x.score || x.d.titre.localeCompare(y.d.titre, "fr"));
  }, [dossiers, motsObjet, typeSuggere]);
  const filtre = q.trim().toLowerCase();
  const visibles = filtre
    ? classes.filter(({ d }) => `${d.titre} ${TYPE_DOSSIER_LABEL[d.type]}`.toLowerCase().includes(filtre))
    : classes.slice(0, 6);

  return (
    <div className="rounded-md border border-line overflow-hidden">
      <div className="px-3 py-2 border-b border-line bg-surface-2/40">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher un dossier de la copropriété…"
          aria-label="Chercher un dossier"
        />
      </div>
      {dossiers === null ? (
        <p className="px-3 py-2 text-meta text-ink-3">Chargement des dossiers…</p>
      ) : (
        <ul className="divide-y divide-line max-h-64 overflow-y-auto">
          {visibles.map(({ d, score }, i) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onRattacher(d.id, d.titre)}
                className="w-full text-left px-3 py-2 text-body text-ink hover:bg-surface-2 flex items-center gap-2"
              >
                <Link2 strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                <span className="flex-1 min-w-0 truncate">{d.titre}</span>
                {!filtre && i === 0 && score >= 2 ? <Badge ton="ok">Suggéré</Badge> : null}
                <Badge ton="outline">{TYPE_DOSSIER_LABEL[d.type]}</Badge>
              </button>
            </li>
          ))}
          {visibles.length === 0 && (
            <li className="px-3 py-2 text-meta text-ink-3">
              {filtre ? "Aucun dossier ne correspond." : "Aucun dossier ouvert sur cette copropriété."}
            </li>
          )}
          {!filtre && classes.length > visibles.length ? (
            <li className="px-3 py-1.5 text-meta text-ink-3">
              {classes.length - visibles.length} autre(s) : tapez pour chercher.
            </li>
          ) : null}
        </ul>
      )}
      {formulaire ? (
        <FormCreerDossier typeSuggere={typeSuggere} titreSuggere={objet} onCreer={onCreer} />
      ) : (
        <div className="border-t border-line px-3 py-2 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => onCreer(typeSuggere, objet.trim() || "Nouveau dossier")}>
            <FilePlus2 strokeWidth={1.5} />
            Nouveau dossier « {TYPE_DOSSIER_LABEL[typeSuggere]} »
          </Button>
          <button type="button" onClick={() => setFormulaire(true)} className="text-meta text-ink-3 underline hover:text-ink">
            changer le type ou le titre
          </button>
        </div>
      )}
    </div>
  );
}

// Mini-formulaire de creation d'un dossier reel depuis un mail (type pre-suggere +
// titre = objet du mail, editables).
function FormCreerDossier({
  typeSuggere,
  titreSuggere,
  onCreer,
}: {
  typeSuggere: TypeDossier;
  titreSuggere: string;
  onCreer: (type: TypeDossier, titre: string) => void;
}) {
  const [type, setType] = useState<TypeDossier>(typeSuggere);
  const [titre, setTitre] = useState(titreSuggere);
  return (
    <div className="border-t border-line bg-surface-2/40 px-3 py-2 flex flex-col gap-2">
      <p className="text-meta font-medium text-ink-3 flex items-center gap-1">
        <FilePlus2 strokeWidth={1.5} className="w-3.5 h-3.5 text-green-700" /> Créer un dossier
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TypeDossier)}
          aria-label="Type de dossier"
          className="h-7 rounded border border-line bg-surface px-1.5 text-meta"
        >
          {TYPE_DOSSIER_ORDRE.map((t) => (
            <option key={t} value={t}>
              {TYPE_DOSSIER_LABEL[t]}
            </option>
          ))}
        </select>
        <input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Titre du dossier"
          aria-label="Titre du dossier"
          className="flex-1 min-w-[140px] h-7 rounded border border-line bg-surface px-2 text-meta"
        />
        <Button size="sm" disabled={!titre.trim()} onClick={() => onCreer(type, titre.trim())}>
          Créer
        </Button>
      </div>
    </div>
  );
}


function AnalysePane({
  m,
  contexte,
  ratt,
  dossiersReels,
  typeSuggere,
  statut,
  brouillon,
  coproCode,
  coproNom,
  coprosDispo,
  onRattacherCopro,
  dossiers,
  dossierIdChoisi,
  onChoisirDossier,
  dossierACreer,
  onCreerDossierOutlook,
  msgClasser,
  lienClasser = null,
  envoiPropose,
  onEnvoyerPropose,
  changer,
  ouverts,
  onEditBrouillon,
  onBlurBrouillon,
  signatureHtml,
  onCreerBrouillon,
  compose,
  onRepondre,
  fichiers,
  onAjouterFichiers,
  onRetirerFichier,
  piecesJointes,
  modeles,
  onTelecharger,
  onApercu,
  adresseFactures,
  onTransmettreFacture,
  pjJointes,
  onTogglePjJointe,
  destinataires,
  onMajDestinataires,
  onDeplacerDestinataire,
  modele,
  onModele,
  onAnnuler,
  boites,
  boiteDuMail,
  expediteur,
  onMajExpediteur,
  sujet,
  onMajSujet,
  onEnvoyer,
  envoiEnCours,
  msgBrouillon,
  lienBrouillon = null,
  onToggleChanger,
  onRattacherDossier,
  onCreerDossier,
  onValider,
  onToggleSection,
  classementOutlook,
  onParti,
  onConclure,
  onTransfere,
  onSupprimer,
  suppressionEnCours = false,
  pilote = false,
  brouillonHtml,
  onEditBrouillonHtml,
  reformulation,
}: {
  /** « Reformuler » (ADR-051) : null quand il n'est pas proposé. */
  reformulation: ReformulationReponse | null;
  /** Nouveautés en pilote (super-admin) : « Transférer » (REA-350), mise en forme (REA-345). */
  pilote?: boolean;
  /** La réponse en HTML pour l'éditeur mis en forme (pilote). */
  brouillonHtml: string;
  onEditBrouillonHtml: (html: string) => void;
  m: MailEntrant;
  /** Contexte ESTALE de la copro choisie : undefined = en cours de chargement, null = indisponible. */
  contexte: ContexteCopro | null | undefined;
  ratt: Rattachement;
  dossiersReels: { id: string; titre: string; type: TypeDossier }[] | null;
  typeSuggere: TypeDossier;
  statut: Statut;
  brouillon: string;
  coproCode: string;
  coproNom: string;
  coprosDispo: { code: string; nom: string; adresse?: string }[];
  onRattacherCopro: (code: string) => void;
  dossiers: DossierBoite[] | null;
  dossierIdChoisi: string;
  onChoisirDossier: (id: string) => void;
  /** Nom du sous-dossier de la copro à créer quand elle n'en a pas ; null sinon. */
  dossierACreer: string | null;
  onCreerDossierOutlook: () => void;
  msgClasser: string | null;
  /** Lien Outlook du brouillon annoncé par msgClasser (transmission de facture). */
  lienClasser?: string | null;
  /** Copro choisie gérée par un autre binôme : proposer de lui envoyer le mail (REA-327). */
  envoiPropose: { reference: string; dossier: string } | null;
  onEnvoyerPropose: (p: { reference: string; dossier: string }) => void;
  changer: boolean;
  ouverts: Set<string>;
  onEditBrouillon: (t: string) => void;
  onBlurBrouillon: () => void;
  signatureHtml?: string | null;
  onCreerBrouillon: () => void;
  compose: boolean;
  onRepondre: (tous: boolean) => void;
  fichiers: FichierJoint[];
  onAjouterFichiers: (l: FileList | null) => void;
  onRetirerFichier: (i: number) => void;
  piecesJointes: PieceJointeRef[] | null;
  modeles: ModeleMail[];
  onTelecharger: (pj: PieceJointeRef) => void;
  onApercu: (pj: PieceJointeRef) => void;
  adresseFactures?: string;
  onTransmettreFacture?: (f: { compte: string; fournisseur: string; libelle: string }) => Promise<void>;
  pjJointes: Set<string>;
  onTogglePjJointe: (id: string) => void;
  destinataires: Destinataires;
  onMajDestinataires: (champ: keyof Destinataires, v: string[]) => void;
  onDeplacerDestinataire: (depuis: keyof Destinataires, vers: keyof Destinataires, adresse: string) => void;
  /** Modèle choisi pour la réponse ("" = aucun). */
  modele: string;
  onModele: (id: string) => void;
  /** Referme l'éditeur sans envoyer. */
  onAnnuler: () => void;
  boites: BoiteMail[];
  /** Boite qui detient le mail : sert de reference au "De :" par defaut. */
  boiteDuMail: string;
  expediteur: string;
  onMajExpediteur: (v: string) => void;
  sujet: string;
  onMajSujet: (v: string) => void;
  onEnvoyer: () => void;
  envoiEnCours: boolean;
  msgBrouillon: string | null;
  /** Lien Outlook du brouillon de réponse annoncé par msgBrouillon. */
  lienBrouillon?: string | null;
  onToggleChanger: () => void;
  onRattacherDossier: (dossierId: string, titre: string) => void;
  onCreerDossier: (type: TypeDossier, titre: string) => void;
  onValider: () => void;
  onToggleSection: (cle: string) => void;
  /** Boîte perso : on range dans un dossier Outlook. Boîte partagée : non (le tri l'a fait). */
  classementOutlook: boolean;
  /** Le mail a quitté la personne (envoyé à un autre binôme, en Comptabilité). */
  onParti?: () => void;
  /** « Marquer traité » (boîte partagée) : le mail sort de « À traiter » pour le binôme, sans bouger dans Outlook. */
  onConclure: () => void;
  /** Le transfert est parti (pas un brouillon) : badge « Transféré » (REA-422). */
  onTransfere: () => void;
  /** Mettre le mail à la corbeille : boîte perso seulement (absent sinon). */
  onSupprimer?: () => void;
  suppressionEnCours?: boolean;
}) {
  // Fichiers glissés sur l'éditeur de réponse : joints comme avec « Ajouter une pièce jointe ».
  const depotPj = useDepotFichiers((l) => onAjouterFichiers(l));

  // Un clic sur « Répondre » = on écrit (comme Outlook) : la réponse s'ouvre en haut du
  // volet, remonte à l'écran et le curseur se pose au début du texte, pas dans l'objet.
  // Seulement après ce clic : un brouillon déjà enregistré, rouvert en changeant de mail,
  // ne vole pas le focus.
  const reponseRef = useRef<HTMLDivElement>(null);
  const corpsReponseRef = useRef<HTMLDivElement>(null);
  const focusReponseDemande = useRef(false);
  const repondreEtEcrire = (tous: boolean) => {
    focusReponseDemande.current = true;
    onRepondre(tous);
  };
  useEffect(() => {
    if (!compose || !focusReponseDemande.current) return;
    focusReponseDemande.current = false;
    if (reponseRef.current && corpsReponseRef.current) ecrireDansLaReponse(reponseRef.current, corpsReponseRef.current);
  }, [compose]);

  return (
    <Card className="overflow-hidden">
      {/* En-tête : objet, qui, quand -- puis UNE barre d'actions. */}
      <div className="px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-title font-semibold text-ink leading-snug">{m.objet}</h2>
          {statut !== "nouveau" ? <StatutBadge statut={statut} /> : null}
          {!(brouillon || compose) && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="doux" onClick={() => repondreEtEcrire(false)}>
                <Reply strokeWidth={1.75} />
                Répondre
              </Button>
              <Button onClick={() => repondreEtEcrire(true)}>
                <ReplyAll strokeWidth={1.75} />
                Répondre à tous
              </Button>
              {pilote ? (
                <TransfererMail
                  key={m.id}
                  emailId={m.id}
                  boite={boiteDuMail}
                  boitePerso={boites.find((b) => b.id === boiteDuMail)?.personnelle ?? false}
                  objet={m.objet}
                  piecesJointes={m.attachments.length === 0 ? [] : piecesJointes}
                  onTransfere={onTransfere}
                  reformulation={reformulation !== null}
                />
              ) : null}
              {onSupprimer ? (
                <Button onClick={onSupprimer} loading={suppressionEnCours} title="Mettre ce mail dans « Éléments supprimés » d'Outlook">
                  <Trash2 strokeWidth={1.5} />
                  Supprimer
                </Button>
              ) : null}
            </div>
          )}
        </div>
        <EnTeteMail m={m} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-meta">
            <Building2 strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
            <Select
              largeur="auto"
              value={coproCode}
              onChange={(e) => onRattacherCopro(e.target.value)}
              aria-label="Copropriété du mail"
              title={coproCode ? [coproCode, coproNom, coprosDispo.find((c) => c.code === coproCode)?.adresse].filter(Boolean).join(" · ") : "Rattacher à une copropriété"}
              className="max-w-[360px]"
            >
              {/* Copro FACULTATIVE et reversible : l'option vide retire le rattachement. */}
              <option value="">{coproCode ? "Retirer la copropriété" : "Copropriété…"}</option>
              {coproCode && !coprosDispo.some((c) => c.code === coproCode) ? (
                <option value={coproCode}>
                  {coproCode} · {coproNom}
                </option>
              ) : null}
              {coprosDispo.map((c) => (
                <option key={c.code} value={c.code}>
                  {[c.code, c.nom, c.adresse].filter(Boolean).join(" · ")}
                </option>
              ))}
            </Select>
          </span>
          {ratt.intranet ? (
            <Link href={`/dossiers/${ratt.dossierId}`} className="inline-flex items-center gap-1 text-meta text-info-700 hover:underline">
              <Link2 strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
              {ratt.dossierLabel}
            </Link>
          ) : null}
          <Button onClick={onToggleChanger} aria-expanded={changer}>
            {changer ? <X strokeWidth={1.5} /> : <FolderPlus strokeWidth={1.5} />}
            {changer ? "Fermer" : ratt.intranet ? "Changer de dossier" : "Rattacher à un dossier"}
          </Button>
        </div>
        {msgClasser ? (
          <p className="mt-1.5 text-meta text-ink-3">
            {msgClasser}
            {lienClasser ? <LienBrouillonOutlook href={lienClasser} /> : null}
          </p>
        ) : null}
        {envoiPropose ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2">
            <span className="text-meta text-ink-2">
              {envoiPropose.reference} est gérée par le binôme {envoiPropose.dossier}. Lui envoyer ce mail ?
            </span>
            <Button size="sm" variant="primary" onClick={() => onEnvoyerPropose(envoiPropose)}>
              Envoyer au binôme {envoiPropose.dossier}
            </Button>
          </div>
        ) : null}
        {msgBrouillon && !(brouillon || compose) ? (
          <p className="mt-1.5 text-meta text-ink-3">
            {msgBrouillon}
            {lienBrouillon ? <LienBrouillonOutlook href={lienBrouillon} /> : null}
          </p>
        ) : null}
      </div>

      {/* Réponse : EN HAUT, au-dessus du mail d'origine, comme dans Outlook (retour des
          collègues du 29/10/2026 : ouverte en bas, sous un long mail, on ne la voyait pas). */}
      {(brouillon || compose) && (
        <div ref={reponseRef} className="px-5 pt-4 scroll-mt-4">
          <div
            {...depotPj.zone}
            className={"rounded-lg border p-4 transition-colors " + (depotPj.survol ? "border-green-600 bg-green-50/30" : "border-line")}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-meta text-ink-3">Réponse</span>
              <div className="flex items-center gap-2">
                <Select
                  largeur="auto"
                  value={modele}
                  onChange={(e) => onModele(e.target.value)}
                  aria-label="Modèle de réponse"
                  className="max-w-[240px]"
                >
                  <option value="">Modèle…</option>
                  {modeles.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.titre}
                    </option>
                  ))}
                </Select>
                <Button size="sm" onClick={onCreerBrouillon}>
                  <FilePlus2 strokeWidth={1.5} />
                  Brouillon Outlook
                </Button>
              </div>
            </div>
            <ChampDe
              boites={boites}
              boiteDuMail={boiteDuMail}
              valeur={expediteur}
              onChange={onMajExpediteur}
            />
            <ChampsDestinataires valeur={destinataires} onChange={onMajDestinataires} onDeplacer={onDeplacerDestinataire} />
            <Input value={sujet} onChange={(e) => onMajSujet(e.target.value)} placeholder="Sujet" aria-label="Sujet de la réponse" className="mb-2" />
            {piecesJointes && piecesJointes.length > 0 ? (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-meta text-ink-3">Joindre&nbsp;:</span>
                {piecesJointes.map((pj) => {
                  const jointe = pjJointes.has(pj.id);
                  return (
                    <button
                      key={pj.id}
                      type="button"
                      onClick={() => onTogglePjJointe(pj.id)}
                      title={jointe ? "Jointe à la réponse" : "Joindre à la réponse"}
                      className={`inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-full border text-meta transition-colors ${jointe ? "border-green-500/40 bg-green-50 text-green-700" : "border-line bg-surface text-ink-3 hover:bg-surface-2"}`}
                    >
                      {jointe ? (
                        <Check strokeWidth={2} className="w-3 h-3 shrink-0" />
                      ) : (
                        <Paperclip strokeWidth={1.5} className="w-3 h-3 shrink-0" />
                      )}
                      <span className="truncate max-w-[160px]">{pj.nom}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <label className={classesBouton({ size: "sm" })}>
                <Paperclip strokeWidth={1.5} />
                Ajouter une pièce jointe
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    onAjouterFichiers(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {fichiers.length === 0 ? <span className="text-meta text-ink-3">ou glissez les fichiers ici</span> : null}
              {fichiers.map((f, i) => (
                <span key={`${f.nom}-${i}`} className="relative inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full border border-line text-meta text-ink-2 overflow-hidden">
                  {f.progres !== undefined ? (
                    // Dépôt en cours sur le brouillon (REA-421) : la pastille se remplit, tranche par tranche.
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 bg-green-50 transition-[width]"
                      style={{ width: `${Math.round(f.progres * 100)}%` }}
                    />
                  ) : null}
                  <span className="relative truncate max-w-[180px]">{f.nom}</span>
                  <span className="relative text-ink-3">
                    {f.progres !== undefined ? `${Math.round(f.progres * 100)} %` : formatTaille(f.taille)}
                  </span>
                  <button type="button" onClick={() => onRetirerFichier(i)} aria-label={`Retirer ${f.nom}`} className="text-ink-3 hover:text-err-700">
                    <X strokeWidth={1.5} className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div ref={corpsReponseRef}>
              {pilote ? (
                <EditeurRiche html={brouillonHtml} onChange={onEditBrouillonHtml} onBlur={onBlurBrouillon} label="Texte de la réponse" />
              ) : (
                <Textarea value={brouillon} onChange={(e) => onEditBrouillon(e.target.value)} onBlur={onBlurBrouillon} rows={7} className="resize-y" aria-label="Texte de la réponse" />
              )}
            </div>
            {reformulation ? (
              <div className="mt-1.5 flex justify-end">
                <BoutonReformuler key={m.id} texte={brouillon} nature="reponse" objet={sujet} desactive={envoiEnCours} {...reformulation} />
              </div>
            ) : null}
            {signatureHtml ? (
              <div className="mt-2">
                <span className="text-meta text-ink-3">Signature (ajoutée à l’envoi)</span>
                <iframe
                  title="Signature"
                  sandbox=""
                  srcDoc={signatureHtml}
                  className="mt-1 w-full h-[110px] rounded-md border border-line bg-white"
                />
              </div>
            ) : null}
            <div className="mt-2.5 flex items-center gap-3">
              <Button variant="primary" size="lg" onClick={onEnvoyer} loading={envoiEnCours}>
                <Send strokeWidth={2} />
                {envoiEnCours ? "Envoi…" : "Envoyer la réponse"}
              </Button>
              <Button variant="ghost" size="lg" onClick={onAnnuler} disabled={envoiEnCours}>
                Annuler
              </Button>
              {msgBrouillon ? (
                <span className="text-meta text-ink-3">
                  {msgBrouillon}
                  {lienBrouillon ? <LienBrouillonOutlook href={lienBrouillon} /> : null}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Le mail */}
      <div className="px-5 py-4">
        {brouillon || compose ? <p className="text-meta text-ink-3 mb-1.5">Message d&apos;origine</p> : null}
        <div className="text-body text-ink-2 whitespace-pre-wrap leading-relaxed max-h-[340px] overflow-auto">
          <TexteAvecLiens texte={m.corps} />
        </div>
        <ImagesMail key={`img-${m.id}`} emailId={m.id} coproCode={coproCode} boite={boiteDuMail} onApercu={onApercu} />
        <HistoriqueMail key={`historique-${m.id}`} emailId={m.id} boite={boiteDuMail} />
          {m.attachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {piecesJointes === null ? (
                <span className="inline-flex items-center gap-1 h-6 px-2 rounded border border-line bg-surface text-meta text-ink-3">
                  <Paperclip strokeWidth={1.5} className="w-3 h-3" />
                  Chargement des pièces jointes…
                </span>
              ) : piecesJointes.length === 0 ? (
                <span className="text-meta text-ink-3 italic">Pièces jointes indisponibles</span>
              ) : (
                piecesJointes.map((pj) => (
                  <span
                    key={pj.id}
                    title={formatTaille(pj.taille)}
                    className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded border border-line bg-surface text-meta text-ink-2"
                  >
                    <Paperclip strokeWidth={1.5} className="w-3 h-3 text-ink-3 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onApercu(pj)}
                      title="Aperçu"
                      className="truncate max-w-[200px] hover:underline"
                    >
                      {pj.nom}
                    </button>
                    <button
                      type="button"
                      onClick={() => onTelecharger(pj)}
                      title="Télécharger"
                      className="text-ink-3 hover:text-ink"
                    >
                      <Download strokeWidth={1.5} className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          )}
          {m.attachments.length > 0 && adresseFactures && onTransmettreFacture && (
            <TransmettreFacture destinataire={adresseFactures} coproChoisie={Boolean(coproCode)} onTransmettre={onTransmettreFacture} />
          )}
          {(statut === "repondu" || m.reponseOutlook === "repondu") && <ReponseEnvoyee key={`reponse-${m.id}`} emailId={m.id} boite={boiteDuMail} />}
      </div>

      <div className="px-5 pb-4 flex flex-col gap-3">
        {changer && !coproCode && (
          <div className="rounded-md border border-dashed border-line px-3 py-2 text-meta text-ink-3">
            Lier un <strong>dossier de suivi intranet</strong> nécessite une copropriété : choisis-la dans le
            sélecteur ci-dessus.
            {classementOutlook ? (
              <>
                {" "}
                Pour simplement <strong>ranger</strong> ce mail dans Outlook, le sélecteur «&nbsp;Archiver dans…&nbsp;» est
                en bas - aucune copropriété requise.
              </>
            ) : null}
          </div>
        )}

        {changer && coproCode && (
          <ChoixDossier
            dossiers={dossiersReels}
            objet={m.objet}
            typeSuggere={typeSuggere}
            onRattacher={onRattacherDossier}
            onCreer={onCreerDossier}
          />
        )}

        {/* La copropriété choisie, vue d'ESTALE : repliée, chargée à l'ouverture. Rien sans
            copro. Le volet « Contexte » d'avant le 27/10/2026 affichait aussi un type « Autre »
            (cache d'analyse plus jamais écrit), une « suggestion » à trois règles et un « Fil »
            d'objets illisible : retirés à la demande de Sekou. */}
        {coproCode ? (
          <SectionRepliable
            cle="contexte"
            titre="Copropriété (ESTALE)"
            compte={[coproCode, coproNom].filter(Boolean).join(" · ")}
            icone={<Building2 strokeWidth={1.5} className="w-3.5 h-3.5" />}
            open={ouverts.has("contexte")}
            onToggle={onToggleSection}
          >
            <ContexteCoproContenu ctx={contexte} />
          </SectionRepliable>
        ) : null}
      </div>
      {/* Fin d'action, en bas à droite comme dans Crypto. */}
      <div className="px-5 py-3 border-t border-line flex flex-wrap items-center justify-end gap-3">
        {classementOutlook ? (
          // Boîte perso : archiver = déplacer dans un dossier Outlook, qu'il faut choisir ; le
          // mail quitte la réception, donc la liste.
          <>
                  <Select
                    largeur="auto"
                    value={dossierIdChoisi}
                    onChange={(e) => onChoisirDossier(e.target.value)}
                    aria-label="Dossier Outlook où archiver le mail traité"
                    className="max-w-[200px]"
                  >
                    <option value="">
                      {dossiers === null ? "Chargement des dossiers…" : "Archiver dans…"}
                    </option>
                    {dossiers &&
                      (() => {
                        const { reception, autres } = grouperDossiersBoite(dossiers);
                        return (
                          <>
                            {reception.length > 0 && (
                              <optgroup label="Sous-dossiers de la réception">
                                {reception.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.nom}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {autres.length > 0 && (
                              <optgroup label="Autres dossiers">
                                {autres.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.nom}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </>
                        );
                      })()}
                  </Select>
            {dossierACreer ? (
              <Button onClick={onCreerDossierOutlook} title="Crée le sous-dossier dans votre boîte de réception">
                <FolderPlus strokeWidth={1.5} />
                Créer «&nbsp;{dossierACreer}&nbsp;»
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="lg"
              onClick={onValider}
              disabled={!dossierIdChoisi}
              title={!dossierIdChoisi ? "Choisis d'abord le dossier Outlook" : undefined}
            >
              <Archive strokeWidth={1.75} />
              Archiver
            </Button>
          </>
        ) : (
          <>
            {/* Boîte partagée : « ce n'est pas pour moi » (REA-327), ou « Marquer traité ». */}
            {onParti ? <PasPourMoi key={m.id} emailId={m.id} boite={boiteDuMail} onParti={onParti} /> : null}
            {/* « Comptabilité » (28/10/2026) : pour le binôme. Une boîte regroupée sous un onglet
                commun est le dossier Comptabilité vu par un comptable : le mail y est déjà. */}
            {onParti && !boites.find((b) => b.id === boiteDuMail)?.onglet ? (
              <EnvoyerEnComptabilite key={`compta-${m.id}`} emailId={m.id} boite={boiteDuMail} onParti={onParti} />
            ) : null}
            <Button variant="primary" size="lg" onClick={onConclure}>
              <CircleCheck strokeWidth={1.75} />
              Marquer traité
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function SectionRepliable({
  cle,
  titre,
  compte,
  icone,
  open,
  onToggle,
  children,
}: {
  cle: string;
  titre: string;
  compte?: string;
  icone: React.ReactNode;
  open: boolean;
  onToggle: (cle: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => onToggle(cle)}
        className="w-full flex items-center gap-1.5 py-2.5 text-left text-body font-medium text-ink-2 hover:text-ink"
      >
        <ChevronRight
          strokeWidth={1.5}
          className={`w-3.5 h-3.5 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {icone}
        {titre}
        {compte && <span className="text-ink-3 font-normal">· {compte}</span>}
      </button>
      {open && <div className="pb-3 pl-5">{children}</div>}
    </div>
  );
}

function formatEuro(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

function Fait({
  icone,
  label,
  children,
}: {
  icone: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-body">
      <span className="text-ink-3 mt-0.5 shrink-0">{icone}</span>
      <p className="text-ink-2">
        <span className="text-ink-3">{label} : </span>
        {children}
      </p>
    </div>
  );
}

function ContexteCoproContenu({ ctx }: { ctx: ContexteCopro | null | undefined }) {
  if (ctx === undefined) return <p className="text-body text-ink-3 italic">Chargement…</p>;
  if (!ctx || !ctx.disponible) {
    return (
      <p className="text-body text-ink-3 italic">
        Indisponible (copro absente d’ESTALE, ou ESTALE non configuré).
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {ctx.conseilSyndical.length > 0 && (
        <Fait icone={<Users strokeWidth={1.5} className="w-3.5 h-3.5" />} label="Conseil syndical">
          {ctx.conseilSyndical
            .map((membre) => `${membre.nomComplet}${membre.role === "president" ? " (président)" : ""}`)
            .join(", ")}
        </Fait>
      )}
      {ctx.derniereAg && (
        <Fait icone={<CalendarCheck strokeWidth={1.5} className="w-3.5 h-3.5" />} label="Dernière AG">
          {formatDateLongue(ctx.derniereAg.date)} ({ctx.derniereAg.type})
          {ctx.derniereAg.pvDispo ? " · PV disponible" : ""}
        </Fait>
      )}
      {(ctx.budgetPrevisionnel !== undefined || ctx.depensesCourantes !== undefined) && (
        <Fait icone={<Euro strokeWidth={1.5} className="w-3.5 h-3.5" />} label="Comptes">
          {ctx.budgetPrevisionnel !== undefined && <>budget {formatEuro(ctx.budgetPrevisionnel)}</>}
          {ctx.depensesCourantes !== undefined && <> · dépenses {formatEuro(ctx.depensesCourantes)}</>}
          {ctx.fondsTravaux !== undefined && <> · fonds travaux {formatEuro(ctx.fondsTravaux)}</>}
          {ctx.nbDebiteurs ? (
            <>
              {" "}
              · {ctx.nbDebiteurs} débiteur{ctx.nbDebiteurs > 1 ? "s" : ""}
            </>
          ) : null}
        </Fait>
      )}
      {ctx.contrats && ctx.contrats.length > 0 && (
        <Fait icone={<FileText strokeWidth={1.5} className="w-3.5 h-3.5" />} label="Contrats">
          {ctx.contrats.map((c) => c.libelle).join(", ")}
        </Fait>
      )}
      {ctx.nbProcedures ? (
        <Fait icone={<Gavel strokeWidth={1.5} className="w-3.5 h-3.5" />} label="Procédures">
          {ctx.nbProcedures} en cours
        </Fait>
      ) : null}
    </div>
  );
}

/** L'en-tête comme dans Outlook : De, À, Cc, Répondre à, date et heure. Rien n'est tronqué. */
function EnTeteMail({ m }: { m: MailEntrant }) {
  const a = m.destinatairesDetail ?? m.destinataires.map((adresse) => ({ adresse }));
  const cc = m.copieDetail ?? m.copie.map((adresse) => ({ adresse }));
  const heure = m.recuLe
    ? new Date(m.recuLe).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
    : null;
  const lignes: [string, string][] = [
    ["De", libelleCorrespondant({ adresse: m.expediteurEmail, nom: m.de })],
    ["À", a.map(libelleCorrespondant).join(" ; ") || "-"],
    ...(cc.length ? ([["Cc", cc.map(libelleCorrespondant).join(" ; ")]] as [string, string][]) : []),
    ...(m.repondreA?.length ? ([["Répondre à", m.repondreA.map(libelleCorrespondant).join(" ; ")]] as [string, string][]) : []),
    ["Date", `${formatDateLongue(m.date)}${heure ? ` à ${heure}` : ""}`],
  ];
  return (
    <>
      {/* Délégation de portefeuille : on répond pour le titulaire (27/10/2026). */}
      {m.pour ? (
        <div className="mt-2">
          <Badge ton="brand">Pour {m.pour}</Badge>
        </div>
      ) : null}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-meta">
        {lignes.map(([label, valeur]) => (
          <Fragment key={label}>
            <dt className="text-ink-3">{label}</dt>
            <dd className={(label === "De" ? "text-ink font-medium" : "text-ink-2") + " break-words select-text"}>{valeur}</dd>
          </Fragment>
        ))}
      </dl>
    </>
  );
}

/** Un fichier ajouté depuis l'ordinateur à une réponse : gardé tel quel jusqu'à l'envoi, puis
 *  déposé par tranches sur le brouillon (REA-421). `progres` : 0 à 1 pendant le dépôt. */
type FichierJoint = { nom: string; taille: number; fichier: File; progres?: number };
