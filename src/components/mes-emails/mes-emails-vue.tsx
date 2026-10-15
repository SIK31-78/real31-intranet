"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Mail,
  Sparkles,
  Search,
  Link2,
  FilePlus2,
  MessageSquare,
  Wrench,
  Paperclip,
  Flag,
  Check,
  Building2,
  Users,
  Euro,
  Gavel,
  FileText,
  CalendarCheck,
  ChevronRight,
  FolderUp,
  Download,
  X,
  Send,
  Inbox,
  CircleCheck,
  Archive,
  Reply,
  ReplyAll,
  FolderPlus,
} from "lucide-react";
import type {
  ContexteCopro,
  Dossier,
  DossierBoite,
  EvenementKind,
  MailEntrant,
  MesEmails,
  ReponseOutlook,
  PieceJointeRef,
  Rattachement,
} from "@/lib/domain/mes-emails";
import {
  LIBELLE_TYPE,
  dossierOutlookSuggere,
  grouperDossiersBoite,
  libelleCorrespondant,
  nomDossierCopro,
  mailsDeLaBoite,
  sujetDeReponse,
  trierMails,
  trouverDossier,
  typeDossierSuggere,
} from "@/lib/domain/mes-emails";
import type { BoiteMail } from "@/lib/domain/boites-mail";
import { boiteReponseParDefaut } from "@/lib/domain/boites-mail";
import { TYPE_DOSSIER_LABEL, TYPE_DOSSIER_ORDRE, type TypeDossier } from "@/lib/domain/dossier";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented";
import { Button, classesBouton } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue } from "@/lib/format-date";
import { TransmettreFacture } from "./transmettre-facture";
import { ReponseEnvoyee } from "./reponse-envoyee";
import { HistoriqueMail } from "./historique-mail";
import { pastilleGlissable, useDepotDestinataire, useDepotFichiers } from "./glisser-deposer";
import { fusionnerModele, sansPolitesseEnDouble, type ModeleMail } from "@/lib/domain/mes-emails-composition";
import { estMailInterne } from "@/lib/domain/tri-emails";
import { VisionneusePj } from "./visionneuse-pj";
import { ResultatsFouille, type Fouille } from "./resultats-fouille";
import { rechercherEchangesAction } from "@/app/echanges/actions";
import {
  devaliderMailAction,
  marquerTraiteAction,
  editBrouillonAction,
  marquerLuAction,
  creerBrouillonAction,
  genererBrouillonAction,
  envoyerReponseAction,
  chargerPiecesJointesAction,
  telechargerPieceJointeAction,
  deposerPieceJointeAction,
  transmettreFactureAction,
  rattacherCoproAction,
  chargerDossiersAction,
  creerDossierOutlookAction,
  classerDansDossierAction,
  chargerDossiersCoproAction,
  chargerContexteCoproAction,
  rattacherADossierAction,
  creerDossierDepuisMailAction,
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

function formatTaille(octets: number): string {
  if (octets >= 1_000_000) return `${(octets / 1_000_000).toFixed(1)} Mo`;
  if (octets >= 1000) return `${Math.round(octets / 1000)} Ko`;
  return `${octets} o`;
}

export function MesEmailsVue({
  data,
  signatureHtml,
  depotDriveActif = false,
  adresseFactures = null,
  maxPerso = 40,
  agence = "",
  modeles,
}: {
  data: MesEmails;
  /** Modèles de réponse proposés (agence et cabinet). */
  modeles: ModeleMail[];
  /** Agence de la boîte (MAIL_TRI_AGENCE) : signe les modèles de réponse. */
  agence?: string;
  /** Plafond de la boîte perso pour cet affichage (« Plus de mails » l'augmente). */
  maxPerso?: number;
  signatureHtml?: string | null;
  /** Dépôt SharePoint branché (SHAREPOINT_DEPOT_ACTIF) : affiche « Déposer » sur les PJ. */
  depotDriveActif?: boolean;
  /** Boîte factures ESTALE de l'agence (MAIL_ROBOT_FACTURE_ESTALE) ; null = bouton masqué. */
  adresseFactures?: string | null;
}) {
  // Boite affichee. Les deux boites ne sont JAMAIS fusionnees (decision Sekou 5) :
  // on en regarde une a la fois, la perso par defaut.
  const boiteParDefaut =
    data.boites.find((b) => b.personnelle)?.id ?? data.boites[0]?.id ?? "";
  const [boiteActive, setBoiteActive] = useState<string>(boiteParDefaut);

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
  const [classes, setClasses] = useState<Set<string>>(
    () => new Set(data.mails.filter((m) => m.statutTraitement === "classe").map((m) => m.id)),
  );
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, Rattachement>>(new Map());
  const [changer, setChanger] = useState(false);
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [filtreCopro, setFiltreCopro] = useState<string>("toutes");
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
  // Modèle choisi pour la réponse, par mail (la liste se remet à « Aucun » à la fermeture).
  const [modeleParMail, setModeleParMail] = useState<Map<string, string>>(new Map());
  const [msgBrouillon, setMsgBrouillon] = useState<string | null>(null);
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
  // Dossiers REELS (module Dossiers) de la copro, charges en lazy a l'ouverture du picker.
  const [dossiersReels, setDossiersReels] = useState<
    Map<string, { id: string; titre: string; type: TypeDossier }[]>
  >(new Map());
  // Contexte ESTALE par copro, charge a l'ouverture du volet (null = indisponible).
  const [contextes, setContextes] = useState<Map<string, ContexteCopro | null>>(new Map());
  // Pieces jointes REELLES chargees a la demande a l'ouverture (null = en cours).
  const [pjParMail, setPjParMail] = useState<Map<string, PieceJointeRef[] | null>>(new Map());
  // Destinataires editables de la reponse (A / Cc / Cci), par mail.
  const [vue, setVue] = useState<"a_traiter" | "conclus">("a_traiter");
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
  // Visionneuse de piece jointe (PDF/image) : blob courant ouvert dans la modale.
  const [apercu, setApercu] = useState<{ nom: string; type: string; url: string } | null>(null);

  const dossiers = dossiersParBoite.get(boiteActive) ?? null;

  useEffect(() => {
    if (dossiersParBoite.has(boiteActive)) return;
    const memoriser = (d: DossierBoite[]) =>
      setDossiersParBoite((p) => new Map(p).set(boiteActive, d));
    void chargerDossiersAction(boiteActive)
      .then(memoriser)
      .catch(() => memoriser([]));
  }, [boiteActive, dossiersParBoite]);

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
  const autoDossier = (m: MailEntrant): string => (dossiers ? dossierOutlookSuggere(m, dossiers) : "");
  // La copro n'a pas encore de sous-dossier : on propose de le créer, sous la forme « S270 - Nom ».
  const dossierACreer = (m: MailEntrant): string | null =>
    dossiers && m.coproCode && !dossierIdDe(m) ? nomDossierCopro(m.coproCode, m.coproNom) : null;
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
    });
  };

  async function creerBrouillon(m: MailEntrant) {
    setMsgBrouillon("Création du brouillon dans Outlook…");
    const dst = destinatairesDe(m);
    const r = await creerBrouillonAction({
      emailId: m.id,
      coproCode: coproDe(m).code,
      corps: brouillonDe(m),
      sujet: sujetDe(m),
      a: dst.to,
      cc: dst.cc,
      cci: dst.cci,
      pjIds: [...pjJointesDe(m)],
      fichiers: fichiersEnvoi(m),
      boite: boiteDuMail(m),
    });
    setMsgBrouillon(
      r.ok
        ? `Brouillon créé dans ${boiteDuMail(m)}, avec destinataires, objet et pièces jointes : à relire puis envoyer dans Outlook.`
        : `Échec : ${r.message ?? ""}`,
    );
  }

  // Ouvre l'editeur de reponse. « Répondre » = l'expediteur seul ; « Répondre à tous » =
  // l'expediteur en À, les autres en Cc (comme Outlook).
  const repondre = (m: MailEntrant, tous: boolean) => {
    const d = defautDestinataires(m);
    setDestParMail((p) => new Map(p).set(m.id, tous ? d : { to: d.to, cc: [], cci: [] }));
    setComposeParMail((p) => new Set(p).add(m.id));
  };
  const fichiersDe = (m: MailEntrant): FichierJoint[] => fichiersParMail.get(m.id) ?? [];
  async function ajouterFichiers(m: MailEntrant, liste: FileList | null) {
    if (!liste?.length) return;
    const ajout: FichierJoint[] = [];
    for (const f of Array.from(liste)) {
      if (f.size > TAILLE_MAX_FICHIER) {
        setMsgBrouillon(`« ${f.name} » dépasse 3 Mo : à envoyer depuis Outlook ou à déposer sur SharePoint.`);
        continue;
      }
      ajout.push({ nom: f.name, contentType: f.type, taille: f.size, base64: await enBase64(f) });
    }
    setFichiersParMail((p) => new Map(p).set(m.id, [...fichiersDe(m), ...ajout].slice(0, 10)));
  }
  const retirerFichier = (m: MailEntrant, i: number) =>
    setFichiersParMail((p) => new Map(p).set(m.id, fichiersDe(m).filter((_, k) => k !== i)));
  const fichiersEnvoi = (m: MailEntrant) => fichiersDe(m).map(({ nom, contentType, base64 }) => ({ nom, contentType, base64 }));

  // Recupere une PJ (base64 cote serveur) -> Blob -> URL objet (pour download OU apercu).
  async function chargerBlobPj(
    m: MailEntrant,
    pj: PieceJointeRef,
  ): Promise<{ nom: string; type: string; url: string } | null> {
    const r = await telechargerPieceJointeAction(m.id, coproDe(m).code, pj.id, boiteDuMail(m));
    if (!r.ok || !r.base64) return null;
    const bin = atob(r.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // Graph étiquette parfois un PDF en octet-stream : le navigateur le télécharge au lieu de
    // l'afficher. On corrige le type d'après l'extension avant de créer l'URL objet.
    const nom = r.nom || pj.nom;
    const type = typeDepuisNom(nom, r.type);
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    return { nom, type, url };
  }
  async function telechargerPj(m: MailEntrant, pj: PieceJointeRef) {
    const b = await chargerBlobPj(m, pj);
    if (!b) return;
    const a = document.createElement("a");
    a.href = b.url;
    a.download = b.nom;
    a.click();
    URL.revokeObjectURL(b.url);
  }
  async function voirPj(m: MailEntrant, pj: PieceJointeRef) {
    const b = await chargerBlobPj(m, pj);
    if (b) setApercu(b);
  }
  // Bon d'intervention, facture : rangé dans le dossier SharePoint de la copro du mail.
  async function deposerPj(m: MailEntrant, pj: PieceJointeRef) {
    setMsgClasser(`Dépôt de « ${pj.nom} » sur SharePoint…`);
    const r = await deposerPieceJointeAction(m.id, coproDe(m).code, pj.id, m.recuLe ?? new Date().toISOString(), boiteDuMail(m));
    setMsgClasser(r.ok ? `« ${pj.nom} » ${r.message ?? "déposé."}` : (r.message ?? "Le dépôt a échoué."));
  }
  // Facture : brouillon de transfert vers la boîte factures ESTALE, objet codifié.
  async function transmettreFactureMail(m: MailEntrant, f: { compte: string; fournisseur: string; libelle: string }) {
    setMsgClasser("Création du brouillon de transfert…");
    const r = await transmettreFactureAction(m.id, coproDe(m).code, f, boiteDuMail(m));
    setMsgClasser(r.message ?? (r.ok ? "Brouillon créé." : "La transmission a échoué."));
  }
  const fermerApercu = () =>
    setApercu((a) => {
      if (a) URL.revokeObjectURL(a.url);
      return null;
    });

  // Brouillon IA A LA DEMANDE : genere le texte sur clic, le met dans l'editeur (edits).
  async function genererBrouillon(m: MailEntrant) {
    setMsgBrouillon("Génération du brouillon…");
    const r = await genererBrouillonAction(m.id, coproDe(m).code);
    if (r.ok) {
      setEdits((p) => new Map(p).set(m.id, r.brouillon ?? ""));
      setMsgBrouillon(r.brouillon ? null : "Aucune réponse externe pertinente pour ce mail.");
    } else {
      setMsgBrouillon(`Échec : ${r.message ?? ""}`);
    }
  }

  const q = recherche.trim().toLowerCase();
  // « À traiter » = ce qui reste à conclure ; « Conclus » = les événements fermés, avec leur réponse.
  const matchVue = (m: MailEntrant): boolean => (vue === "conclus" ? classes.has(m.id) : !classes.has(m.id));
  const visibles = mailsTries.filter(
    (m) =>
      matchVue(m) &&
      (filtreCopro === "toutes" || m.coproCode === filtreCopro) &&
      (q === "" || `${m.objet} ${m.de} ${m.coproCode} ${m.coproNom}`.toLowerCase().includes(q)),
  );

  const selection = visibles.find((m) => m.id === selId) ?? visibles[0];

  // Charge les dossiers reels de la copro quand on ouvre le picker de rattachement.
  const coproSel = selection?.coproCode ?? "";
  useEffect(() => {
    if (!changer || !coproSel || dossiersReels.has(coproSel)) return;
    void chargerDossiersCoproAction(coproSel).then((ds) =>
      setDossiersReels((p) => new Map(p).set(coproSel, ds)),
    );
  }, [changer, coproSel, dossiersReels]);

  // Contexte ESTALE de la copro, charge a l'ouverture du volet Contexte et plus au chargement
  // de la page (mesure prod du 14/10 : 2,3 s pour un volet replie par defaut).
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

  // Changer de boite : la selection, le filtre copro et la recherche de l'ancienne
  // boite n'ont plus de sens ici -> on repart d'un ecran propre.
  function choisirBoite(id: string) {
    if (id === boiteActive) return;
    setBoiteActive(id);
    setFiltreCopro("toutes");
    setRecherche("");
    setSelId("");
    setChanger(false);
    setOuverts(new Set());
    setMsgBrouillon(null);
    setMsgClasser(null);
  }

  function ouvrir(id: string) {
    setSelId(id);
    setChanger(false);
    setOuverts(new Set());
    setMsgBrouillon(null);
    setLus((prev) => new Set(prev).add(id));
    const m = data.mails.find((x) => x.id === id);
    if (m) {
      void marquerLuAction(id, m.coproCode);
      // Charge les vraies pieces jointes a la demande (une seule fois par mail).
      if (m.attachments.length > 0 && !pjParMail.has(id)) {
        setPjParMail((p) => new Map(p).set(id, null));
        void chargerPiecesJointesAction(id, coproDe(m).code, boiteDuMail(m)).then((pjs) =>
          setPjParMail((prev) => new Map(prev).set(id, pjs)),
        );
      }
    }
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
      const r = await envoyerReponseAction(
        m.id,
        coproDe(m).code,
        brouillonDe(m),
        sujetDe(m),
        dst.to,
        dst.cc,
        dst.cci,
        [...pjJointesDe(m)],
        boiteDuMail(m),
        expediteur,
        fichiersEnvoi(m),
      );
      if (!r.ok) {
        setMsgBrouillon(`Échec de l'envoi : ${r.message ?? ""}`);
        return;
      }
      setRepondus((p) => add(p, m.id));
      // La réponse est partie : l'éditeur se referme, comme dans Outlook.
      fermerReponse(m);
      setMsgBrouillon(
        r.filConserve === false
          ? `Envoyé depuis ${expediteur} ✓ (mail neuf, hors du fil d'origine)`
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
    setDestParMail(sans);
    setSujetParMail(sans);
    setFichiersParMail(sans);
    setPjJointesParMail(sans);
    setModeleParMail(sans);
    setMsgBrouillon(null);
    void editBrouillonAction(m.id, m.coproCode, "");
  }

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

  // Modèle appliqué à la réponse : le texte remplace le message, l'objet de la réponse reste.
  function appliquerModeleReponse(m: MailEntrant, id: string) {
    setModeleParMail((p) => new Map(p).set(m.id, id));
    const modele = modeles.find((x) => x.id === id);
    if (!modele) return;
    const c = coproDe(m);
    setEdits((p) =>
      new Map(p).set(
        m.id,
        sansPolitesseEnDouble(fusionnerModele(modele.corps, {
          copro_code: c.code,
          copro_nom: c.nom,
          destinataire_nom: m.de,
          gestionnaire_nom: data.gestionnaire.nomComplet,
          gestionnaire_initiales: data.gestionnaire.initiales,
          agence,
          date: new Date().toLocaleDateString("fr-FR"),
        }), signatureHtml),
      ),
    );
  }

  // Classer = deplacer dans le dossier Outlook choisi (independant de l'envoi).
  function valider(m: MailEntrant) {
    const folderId = dossierIdDe(m);
    if (!folderId) {
      setMsgClasser("Choisis un dossier de destination avant de classer ce mail.");
      return;
    }
    setMsgClasser(null);
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
      if (!r.ok) setMsgClasser(r.message ?? "Le classement a échoué.");
    });
    passerAuSuivant(m);
  }
  // Conclure l'événement : le mail sort de la liste, sans bouger dans Outlook (les deux boîtes).
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
  function devalider(m: MailEntrant) {
    setClasses((p) => del(p, m.id));
    setRepondus((p) => del(p, m.id));
    void devaliderMailAction(m.id, m.coproCode, boiteDuMail(m));
  }
  const toggleSection = (cle: string) =>
    setOuverts((p) => (p.has(cle) ? del(p, cle) : add(p, cle)));


  return (
    <div className="flex flex-col gap-3">
      {/* Barre unique : la boîte affichée (onglets), la recherche, les vues. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {data.boites.length > 1 && (
            <div role="tablist" aria-label="Boîte affichée" className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
              {data.boites.map((b) => {
                const nonLus = data.mails.filter((m) => (m.boite ?? boiteParDefaut) === b.id && !lus.has(m.id)).length;
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
                    {nonLus > 0 && <span className="text-meta font-semibold text-info-700">{nonLus}</span>}
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
              { value: "a_traiter", label: `À traiter · ${mailsBoite.filter((m) => !classes.has(m.id)).length}` },
              { value: "conclus", label: `Conclus · ${mailsBoite.filter((m) => classes.has(m.id)).length}` },
            ]}
          />
          {filtreCopro !== "toutes" && (
            <button
              type="button"
              onClick={() => setFiltreCopro("toutes")}
              title="Retirer le filtre copropriété"
              className="h-7 px-2.5 rounded-full text-meta border border-info-500/30 bg-info-50 text-info-700 inline-flex items-center gap-1"
            >
              <Building2 strokeWidth={1.5} className="w-3 h-3" />
              {filtreCopro || "Non rattaché"}
              <X strokeWidth={1.5} className="w-3 h-3" />
            </button>
          )}
        </div>
        )}
      </div>

      {fouille ? (
        <ResultatsFouille fouille={fouille} onFermer={() => setFouille(null)} />
      ) : (
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* La liste, en premier : c'est ce qu'on vient chercher. */}
        <aside className="w-full lg:w-[340px] shrink-0">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line max-h-[calc(100vh-220px)] overflow-auto">
              {visibles.map((m) => (
                <LigneMail
                  key={m.id}
                  m={m}
                  actif={m.id === selection?.id}
                  lu={lus.has(m.id)}
                  statut={statutDe(m.id)}
                  reponse={repondus.has(m.id) ? "repondu" : (m.reponseOutlook ?? null)}
                  conclus={vue === "conclus"}
                  onClick={() => ouvrir(m.id)}
                />
              ))}
              {visibles.length === 0 && (
                <li className="px-4 py-6 text-center text-body text-ink-3">Aucun mail.</li>
              )}
            </ul>
            {data.plusDeMails && data.boites.find((b) => b.id === boiteActive)?.personnelle ? (
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
              contexte={selection.coproCode ? contextes.get(selection.coproCode) : null}
              ratt={rattDe(selection)}
              dossier={trouverDossier(data.dossiers, rattDe(selection).dossierId)}
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
              signatureHtml={signatureHtml}
              onCreerBrouillon={() => void creerBrouillon(selection)}
              onGenererBrouillon={() => void genererBrouillon(selection)}
              compose={composeParMail.has(selection.id)}
              onRepondre={(tous) => repondre(selection, tous)}
              fichiers={fichiersDe(selection)}
              onAjouterFichiers={(l) => void ajouterFichiers(selection, l)}
              onRetirerFichier={(i) => retirerFichier(selection, i)}
              modeles={modeles}
              piecesJointes={
                pjParMail.has(selection.id) ? (pjParMail.get(selection.id) ?? null) : []
              }
              onTelecharger={(pj) => void telechargerPj(selection, pj)}
              onApercu={(pj) => void voirPj(selection, pj)}
              {...(depotDriveActif && coproDe(selection).code
                ? { onDeposer: (pj: PieceJointeRef) => void deposerPj(selection, pj) }
                : {})}
              {...(adresseFactures
                ? { adresseFactures, onTransmettreFacture: (f: { compte: string; fournisseur: string; libelle: string }) => transmettreFactureMail(selection, f) }
                : {})}
              pjJointes={pjJointesDe(selection)}
              onTogglePjJointe={(id) => togglePjJointe(selection, id)}
              destinataires={destinatairesDe(selection)}
              onMajDestinataires={(champ, v) => majDest(selection, champ, v)}
              onDeplacerDestinataire={(depuis, vers, adresse) => deplacerDest(selection, depuis, vers, adresse)}
              modele={modeleParMail.get(selection.id) ?? ""}
              onModele={(id) => appliquerModeleReponse(selection, id)}
              onAnnuler={() => fermerReponse(selection)}
              boites={data.boites}
              boiteDuMail={boiteDuMail(selection)}
              expediteur={expediteurDe(selection)}
              onMajExpediteur={(v) => majExpediteur(selection, v)}
              sujet={sujetDe(selection)}
              onMajSujet={(v) => majSujet(selection, v)}
              onEnvoyer={() => void envoyerSeul(selection)}
              envoiEnCours={envoiEnCours}
              msgBrouillon={msgBrouillon}
              changer={changer}
              ouverts={ouverts}
              onEditBrouillon={(t) => setEdits((p) => new Map(p).set(selection.id, t))}
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
              onConclure={() => marquerTraite(selection)}
              onDevalider={() => devalider(selection)}
              onToggleSection={toggleSection}
            />
          ) : (
            <Card className="px-6 py-16 text-center">
              <Mail strokeWidth={1.25} className="w-8 h-8 text-ink-3 mx-auto" />
              <p className="text-body font-medium text-ink mt-3">
                {vue === "conclus" ? "Aucun événement conclu" : "Rien à traiter"}
              </p>
              <p className="text-body text-ink-3 mt-1">
                {vue === "conclus" ? "Les événements conclus apparaissent ici, avec leur réponse." : "Tous les événements sont conclus."}
              </p>
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
  if (statut === "classe") return <Badge ton="ok">Conclu</Badge>;
  if (statut === "repondu") return <Badge ton="info">Répondu</Badge>;
  return null;
}

/** Une boite dans le rail : libelle + adresse + compteur de non-lus. */
function LigneMail({
  m,
  actif,
  lu,
  statut,
  reponse,
  conclus,
  onClick,
}: {
  m: MailEntrant;
  actif: boolean;
  lu: boolean;
  statut: Statut;
  reponse: ReponseOutlook | null;
  /** Vue des conclus : on montre aussi « Sans réponse ». */
  conclus: boolean;
  onClick: () => void;
}) {
  const qui = m.de.replace(/ \(.*\)$/, "");
  return (
    <li className={actif ? "bg-green-50" : "hover:bg-surface-2"}>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left px-3.5 py-2.5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${!lu ? "bg-info-500" : "bg-transparent"}`} />
          <span
            className={
              "text-body text-ink truncate flex-1 " + (!lu && statut !== "classe" ? "font-semibold" : "font-medium")
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
          {/* Même repère que l'écran de tri : un collègue du cabinet, pas un client. */}
          {estMailInterne(m.expediteurEmail, m.boite ?? "") ? (
            <span className={"shrink-0" + (reponse || conclus ? "" : " ml-auto")}>
              <Badge ton="err">Interne</Badge>
            </span>
          ) : null}
          {reponse ? (
            <span className="ml-auto shrink-0">
              <Badge ton="info">{reponse === "transfere" ? "Transféré" : "Répondu"}</Badge>
            </span>
          ) : conclus ? (
            <span className="ml-auto shrink-0">
              <Badge ton="warn">Sans réponse</Badge>
            </span>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function recommandation(m: MailEntrant, ratt: Rattachement): string {
  if (!m.ticketable) return "Aucune action requise - à classer pour information.";
  const cible = m.de.replace(/ \(.*\)$/, "");
  const dossier =
    ratt.statut === "existant"
      ? `le dossier « ${ratt.dossierLabel} »`
      : `un nouveau dossier « ${ratt.dossierLabel} »`;
  return m.brouillonReponse
    ? `Répondre à ${cible} et classer dans ${dossier}.`
    : `Traiter et classer dans ${dossier}.`;
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
        <p className="mt-1.5 pl-9 text-meta text-warn-700">
          Envoi hors du fil : le mail partira comme un message neuf, sans la citation ni
          les pièces jointes d’origine.
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
  return (
    <div
      {...depot.zone}
      className={"flex items-start gap-2 min-h-[24px] rounded " + (depot.survol ? "bg-green-50/60 ring-1 ring-green-600" : "")}
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
            if (ev.key === "Enter" || ev.key === "," || ev.key === ";") {
              ev.preventDefault();
              ajouter();
            }
          }}
          onBlur={ajouter}
          placeholder="ajouter une adresse…"
          className="flex-1 min-w-[120px] h-6 bg-transparent text-meta text-ink outline-none placeholder:text-ink-3"
        />
      </div>
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
  dossier,
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
  changer,
  ouverts,
  onEditBrouillon,
  onBlurBrouillon,
  signatureHtml,
  onCreerBrouillon,
  onGenererBrouillon,
  compose,
  onRepondre,
  fichiers,
  onAjouterFichiers,
  onRetirerFichier,
  piecesJointes,
  modeles,
  onTelecharger,
  onApercu,
  onDeposer,
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
  onToggleChanger,
  onRattacherDossier,
  onCreerDossier,
  onValider,
  onDevalider,
  onToggleSection,
  classementOutlook,
  onConclure,
}: {
  m: MailEntrant;
  /** undefined = en cours de chargement, null = indisponible. */
  contexte: ContexteCopro | null | undefined;
  ratt: Rattachement;
  dossier: Dossier | undefined;
  dossiersReels: { id: string; titre: string; type: TypeDossier }[] | null;
  typeSuggere: TypeDossier;
  statut: Statut;
  brouillon: string;
  coproCode: string;
  coproNom: string;
  coprosDispo: { code: string; nom: string }[];
  onRattacherCopro: (code: string) => void;
  dossiers: DossierBoite[] | null;
  dossierIdChoisi: string;
  onChoisirDossier: (id: string) => void;
  /** Nom du sous-dossier de la copro à créer quand elle n'en a pas ; null sinon. */
  dossierACreer: string | null;
  onCreerDossierOutlook: () => void;
  msgClasser: string | null;
  changer: boolean;
  ouverts: Set<string>;
  onEditBrouillon: (t: string) => void;
  onBlurBrouillon: () => void;
  signatureHtml?: string | null;
  onCreerBrouillon: () => void;
  onGenererBrouillon: () => void;
  compose: boolean;
  onRepondre: (tous: boolean) => void;
  fichiers: FichierJoint[];
  onAjouterFichiers: (l: FileList | null) => void;
  onRetirerFichier: (i: number) => void;
  piecesJointes: PieceJointeRef[] | null;
  modeles: ModeleMail[];
  onTelecharger: (pj: PieceJointeRef) => void;
  onApercu: (pj: PieceJointeRef) => void;
  /** Déposer la PJ dans le dossier SharePoint de la copro. Absent = dépôt coupé ou mail sans copro. */
  onDeposer?: (pj: PieceJointeRef) => void;
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
  onToggleChanger: () => void;
  onRattacherDossier: (dossierId: string, titre: string) => void;
  onCreerDossier: (type: TypeDossier, titre: string) => void;
  onValider: () => void;
  onDevalider: () => void;
  onToggleSection: (cle: string) => void;
  /** Boîte perso : on range dans un dossier Outlook. Boîte partagée : non (le tri l'a fait). */
  classementOutlook: boolean;
  /** Conclure l'événement (vocabulaire Crypto) : le mail sort de la liste, sans bouger dans Outlook. */
  onConclure: () => void;
}) {
  const classe = statut === "classe";
  const genEnCours = (msgBrouillon ?? "").startsWith("Génération");
  // Fichiers glissés sur l'éditeur de réponse : joints comme avec « Ajouter une pièce jointe ».
  const depotPj = useDepotFichiers((l) => onAjouterFichiers(l));

  return (
    <Card className="overflow-hidden">
      {/* En-tête : objet, qui, quand -- puis UNE barre d'actions. */}
      <div className="px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-title font-semibold text-ink leading-snug">{m.objet}</h2>
          {statut !== "nouveau" ? <StatutBadge statut={statut} /> : null}
          {!(brouillon || compose) && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="doux" onClick={() => onRepondre(false)}>
                <Reply strokeWidth={1.75} />
                Répondre
              </Button>
              <Button onClick={() => onRepondre(true)}>
                <ReplyAll strokeWidth={1.75} />
                Répondre à tous
              </Button>
            </div>
          )}
        </div>
        <EnTeteMail m={m} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!(brouillon || compose) && m.ticketable ? (
            <Button onClick={onGenererBrouillon} loading={genEnCours}>
              <Sparkles strokeWidth={1.5} />
              {genEnCours ? "Génération…" : "Brouillon IA"}
            </Button>
          ) : null}
          <span className="inline-flex items-center gap-1 text-meta">
            <Building2 strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
            <Select
              largeur="auto"
              value={coproCode}
              onChange={(e) => onRattacherCopro(e.target.value)}
              aria-label="Copropriété du mail"
              title={coproCode ? `${coproCode} · ${coproNom}` : "Rattacher à une copropriété"}
              className="max-w-[200px]"
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
                  {c.code} · {c.nom}
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
        {msgClasser ? <p className="mt-1.5 text-meta text-ink-3">{msgClasser}</p> : null}
        {msgBrouillon && !(brouillon || compose) ? <p className="mt-1.5 text-meta text-ink-3">{msgBrouillon}</p> : null}
      </div>

      {/* Le mail */}
      <div className="px-5 py-4">
        <div className="text-body text-ink-2 whitespace-pre-wrap leading-relaxed max-h-[340px] overflow-auto">
          {m.corps}
        </div>
        <HistoriqueMail key={m.id} emailId={m.id} boite={boiteDuMail} />
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
                    {onDeposer && (
                      <button
                        type="button"
                        onClick={() => onDeposer(pj)}
                        title="Déposer dans le dossier SharePoint de la copropriété"
                        aria-label={`Déposer ${pj.nom} sur SharePoint`}
                        className="text-ink-3 hover:text-ink"
                      >
                        <FolderUp strokeWidth={1.5} className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))
              )}
            </div>
          )}
          {m.attachments.length > 0 && adresseFactures && onTransmettreFacture && (
            <TransmettreFacture destinataire={adresseFactures} onTransmettre={onTransmettreFacture} />
          )}
          {(statut === "repondu" || m.reponseOutlook === "repondu") && <ReponseEnvoyee key={m.id} emailId={m.id} boite={boiteDuMail} />}
      </div>

      <div className="px-5 pb-4 flex flex-col gap-3">
        {changer && !coproCode && (
          <div className="rounded-md border border-dashed border-line px-3 py-2 text-meta text-ink-3">
            Lier un <strong>dossier de suivi intranet</strong> nécessite une copropriété. Pour simplement
            <strong> ranger</strong> ce mail, utilise «&nbsp;Classer dans…&nbsp;» en haut - aucune copropriété requise.
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

        {/* Réponse : seulement quand on l'a ouverte. */}
        {(brouillon || compose) && (
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
                <span key={`${f.nom}-${i}`} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full border border-line text-meta text-ink-2">
                  <span className="truncate max-w-[180px]">{f.nom}</span>
                  <span className="text-ink-3">{formatTaille(f.taille)}</span>
                  <button type="button" onClick={() => onRetirerFichier(i)} aria-label={`Retirer ${f.nom}`} className="text-ink-3 hover:text-err-700">
                    <X strokeWidth={1.5} className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <Textarea value={brouillon} onChange={(e) => onEditBrouillon(e.target.value)} onBlur={onBlurBrouillon} rows={7} className="resize-y" />
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
              {msgBrouillon ? <span className="text-meta text-ink-3">{msgBrouillon}</span> : null}
            </div>
          </div>
        )}

        {/* Tout le contexte replié dans UN seul volet. */}
        <SectionRepliable
          cle="contexte"
          titre="Contexte"
          compte={[LIBELLE_TYPE[m.type], contexte?.disponible ? "ESTALE" : null].filter(Boolean).join(" · ")}
          icone={<Sparkles strokeWidth={1.5} className="w-3.5 h-3.5" />}
          open={ouverts.has("contexte")}
          onToggle={onToggleSection}
        >
          <div className="flex flex-col gap-3 text-body">
            <p className="text-ink">
              <span className="text-ink-3">Suggestion de l&apos;assistant : </span>
              {recommandation(m, ratt)}
            </p>
            {dossier && dossier.historique.length > 0 ? (
              <div>
                <p className="text-meta uppercase tracking-[0.06em] text-ink-3 mb-1">Fil ({dossier.historique.length})</p>
                <Timeline dossier={dossier} />
              </div>
            ) : null}
            <div>
              <p className="text-meta uppercase tracking-[0.06em] text-ink-3 mb-1">Copropriété (ESTALE)</p>
              <ContexteCoproContenu ctx={contexte} />
            </div>
          </div>
        </SectionRepliable>
      </div>
      {/* Fin d'action, en bas à droite comme dans Crypto. */}
      <div className="px-5 py-3 border-t border-line flex flex-wrap items-center justify-end gap-3">
        {classe ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-body text-ink-2 mr-auto">
              <CircleCheck strokeWidth={1.5} className="w-4 h-4 text-green-700" />
              Événement conclu
              {m.dossierClasseNom ? <span className="text-ink-3">, archivé dans «&nbsp;{m.dossierClasseNom}&nbsp;»</span> : null}
            </span>
            <Button onClick={onDevalider}>Rouvrir</Button>
          </>
        ) : classementOutlook ? (
          // Boîte perso : conclure = archiver dans un dossier Outlook, qu'il faut choisir.
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
              Conclure et archiver
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" onClick={onConclure}>
            <CircleCheck strokeWidth={1.75} />
            Conclure l&apos;événement
          </Button>
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

const KIND_ICON: Record<EvenementKind, React.ReactNode> = {
  mail: <MessageSquare strokeWidth={1.5} className="w-3.5 h-3.5 text-info-700" />,
  action: <Wrench strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-2" />,
  pj: <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" />,
  jalon: <Flag strokeWidth={1.5} className="w-3.5 h-3.5 text-green-700" />,
};

function Timeline({ dossier }: { dossier: Dossier }) {
  return (
    <ul className="flex flex-col gap-2.5 border-l border-line pl-3.5 ml-1">
      {dossier.historique.map((e, i) => (
        <li key={`${e.date}-${i}`} className="relative">
          <span className="absolute -left-[22px] top-0.5 w-5 h-5 rounded-full bg-surface border border-line flex items-center justify-center">
            {KIND_ICON[e.kind]}
          </span>
          <p className="text-body text-ink leading-snug">{e.resume}</p>
          <p className="text-meta text-ink-3 mt-0.5">
            {jourMois(e.date)} · {e.acteur}
          </p>
        </li>
      ))}
    </ul>
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

/** Type MIME fiable d'une PJ : celui de Graph, sauf s'il est générique et que l'extension parle. */
function typeDepuisNom(nom: string, type: string | undefined): string {
  if (type && type !== "application/octet-stream") return type;
  const ext = /\.([a-z0-9]+)$/i.exec(nom)?.[1]?.toLowerCase();
  const parExt: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  return (ext && parExt[ext]) || type || "application/octet-stream";
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
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-meta">
      {lignes.map(([label, valeur]) => (
        <Fragment key={label}>
          <dt className="text-ink-3">{label}</dt>
          <dd className={(label === "De" ? "text-ink font-medium" : "text-ink-2") + " break-words select-text"}>{valeur}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Un fichier ajouté depuis l'ordinateur à une réponse. */
type FichierJoint = { nom: string; contentType: string; taille: number; base64: string };

/** 3 Mo : au-delà, Graph exige un envoi par morceaux (non branché). */
const TAILLE_MAX_FICHIER = 3 * 1024 * 1024;

function enBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}
