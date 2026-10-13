"use client";

import { useEffect, useMemo, useState } from "react";
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
  Copy,
  Check,
  Building2,
  Users,
  Euro,
  Gavel,
  FileText,
  CalendarCheck,
  ChevronRight,
  FolderInput,
  FolderUp,
  Download,
  X,
  Send,
  Inbox,
} from "lucide-react";
import type {
  ContexteCopro,
  Dossier,
  DossierBoite,
  EvenementKind,
  MailEntrant,
  MesEmails,
  PieceJointeRef,
  Rattachement,
} from "@/lib/domain/mes-emails";
import {
  LIBELLE_TYPE,
  grouperDossiersBoite,
  mailsDeLaBoite,
  sujetDeReponse,
  trierMails,
  trouverContexte,
  trouverDossier,
  typeDossierSuggere,
} from "@/lib/domain/mes-emails";
import type { BoiteMail } from "@/lib/domain/boites-mail";
import { boiteReponseParDefaut } from "@/lib/domain/boites-mail";
import { TYPE_DOSSIER_LABEL, TYPE_DOSSIER_ORDRE, type TypeDossier } from "@/lib/domain/dossier";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue } from "@/lib/format-date";
import { TransmettreFacture } from "./transmettre-facture";
import {
  devaliderMailAction,
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
  classerDansDossierAction,
  chargerDossiersCoproAction,
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
  const autres = [...m.destinataires, ...m.copie]
    .map((e) => e.trim())
    .filter((e) => e.includes("@") && e.toLowerCase() !== exp.toLowerCase());
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

const BTN =
  "inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-line bg-surface text-[12px] text-ink hover:bg-surface-2 transition-colors";

export function MesEmailsVue({
  data,
  signatureHtml,
  depotDriveActif = false,
  adresseFactures = null,
}: {
  data: MesEmails;
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
          .filter((m) => m.statutTraitement === "classe" || m.statutTraitement === "repondu")
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
  const [vue, setVue] = useState<"recus" | "traites" | "tous">("recus");
  const [filtreCopro, setFiltreCopro] = useState<string>("toutes");
  const [recherche, setRecherche] = useState("");
  const [copie, setCopie] = useState<string | null>(null);
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
  // Pieces jointes REELLES chargees a la demande a l'ouverture (null = en cours).
  const [pjParMail, setPjParMail] = useState<Map<string, PieceJointeRef[] | null>>(new Map());
  // Destinataires editables de la reponse (A / Cc / Cci), par mail.
  const [destParMail, setDestParMail] = useState<Map<string, Destinataires>>(new Map());
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
  const autoDossier = (m: MailEntrant): string => {
    if (!dossiers) return "";
    const code = m.coproCode.toLowerCase();
    const nom = m.coproNom.toLowerCase();
    const f =
      (code ? dossiers.find((d) => d.nom.toLowerCase().includes(code)) : undefined) ??
      (nom.length >= 4 ? dossiers.find((d) => d.nom.toLowerCase().includes(nom)) : undefined);
    return f?.id ?? "";
  };
  // Priorite : choix de session > dossier persiste (reload) > auto-detection.
  const dossierIdDe = (m: MailEntrant): string =>
    dossiersChoisis.get(m.id) ?? m.dossierClasseId ?? autoDossier(m);

  // code vide = RETIRER la copropriete (elle n'est pas obligatoire). La copro reste
  // optionnelle et reversible : on peut toujours revenir a "sans copropriete".
  const choisirCopro = (m: MailEntrant, code: string) => {
    const nom = code ? ((data.coprosDuGestionnaire ?? []).find((c) => c.code === code)?.nom ?? code) : "";
    setCoprosChoisies((p) => new Map(p).set(m.id, { code, nom }));
    void rattacherCoproAction(m.id, code, nom);
  };

  async function creerBrouillon(m: MailEntrant) {
    setMsgBrouillon("Création du brouillon dans Outlook...");
    const r = await creerBrouillonAction(m.id, m.coproCode, brouillonDe(m), boiteDuMail(m));
    setMsgBrouillon(r.ok ? "Brouillon créé dans Outlook." : `Échec : ${r.message ?? ""}`);
  }

  // Ouvre l'editeur de reponse sur un mail (meme sans action) : reponse manuelle.
  const repondre = (m: MailEntrant) => setComposeParMail((p) => new Set(p).add(m.id));

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
    const url = URL.createObjectURL(new Blob([bytes], { type: r.type || "application/octet-stream" }));
    return { nom: r.nom || pj.nom, type: r.type || "", url };
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
  const matchVue = (m: MailEntrant): boolean =>
    vue === "tous" || (vue === "traites" ? classes.has(m.id) : !classes.has(m.id));
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
    const expediteur = expediteurDe(m);
    const memeBoite = expediteur === boiteDuMail(m);
    // Depuis une AUTRE boite que celle du mail, Graph ne peut pas repondre dans le fil
    // (createReply s'execute dans la boite du message) : c'est un mail NEUF. On le dit
    // AVANT l'envoi, pas apres.
    const recap = [
      `Envoyer depuis ${expediteur}`,
      `À : ${dst.to.join(", ")}`,
      ...(dst.cc.length ? [`Cc : ${dst.cc.join(", ")}`] : []),
      ...(dst.cci.length ? [`Cci : ${dst.cci.join(", ")}`] : []),
      ...(memeBoite
        ? []
        : [
            "",
            "Attention : boîte différente de celle du mail — le fil d'origine et les pièces jointes ne suivront pas.",
          ]),
      "",
      "Envoyer ?",
    ];
    if (!window.confirm(recap.join("\n"))) return;
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
      );
      if (!r.ok) {
        setMsgBrouillon(`Échec de l'envoi : ${r.message ?? ""}`);
        return;
      }
      setRepondus((p) => add(p, m.id));
      setMsgBrouillon(
        r.filConserve === false
          ? `Envoyé depuis ${expediteur} ✓ (mail neuf, hors du fil d'origine)`
          : "Réponse envoyée ✓",
      );
    } finally {
      setEnvoiEnCours(false);
    }
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
    // Enchaînement : dans « Reçus », passer au mail suivant (le courant part en « Traités »).
    if (vue === "recus") {
      const idx = visibles.findIndex((x) => x.id === m.id);
      const suivant =
        visibles.slice(idx + 1).find((x) => x.id !== m.id) ??
        [...visibles.slice(0, Math.max(idx, 0))].reverse().find((x) => x.id !== m.id);
      if (suivant) ouvrir(suivant.id);
    }
  }
  function devalider(m: MailEntrant) {
    setClasses((p) => del(p, m.id));
    setRepondus((p) => del(p, m.id));
    void devaliderMailAction(m.id, m.coproCode);
  }
  const toggleSection = (cle: string) =>
    setOuverts((p) => (p.has(cle) ? del(p, cle) : add(p, cle)));

  const nbClasses = mailsBoite.filter((m) => classes.has(m.id)).length;
  const nbRecus = mailsBoite.length - nbClasses;
  const DOSSIERS = [
    { cle: "recus", label: "À traiter", n: nbRecus },
    { cle: "traites", label: "Traités", n: nbClasses },
    { cle: "tous", label: "Tous", n: mailsBoite.length },
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      {/* Barre unique : la boîte affichée (onglets), la recherche, les vues. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {data.boites.length > 1 && (
            <div role="tablist" aria-label="Boîte affichée" className="inline-flex rounded-md border border-line bg-surface p-0.5">
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
                      "h-7 px-3 rounded text-[12.5px] inline-flex items-center gap-1.5 transition-colors " +
                      (actif ? "bg-green-50 text-green-700 font-medium" : "text-ink-2 hover:bg-surface-2")
                    }
                  >
                    {b.personnelle ? <Inbox strokeWidth={1.5} className="w-3.5 h-3.5" /> : <Users strokeWidth={1.5} className="w-3.5 h-3.5" />}
                    {b.libelle}
                    {nonLus > 0 && <span className="text-[11px] font-semibold text-info-700">{nonLus}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="relative flex-1 min-w-[220px]">
            <Search strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Filtrer : copro (S247), personne, mot…"
              aria-label="Filtrer les mails de la boîte"
              className="w-full h-8 pl-8 pr-3 rounded-md border border-line bg-surface text-[12.5px] text-ink placeholder:text-ink-4"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {DOSSIERS.map((d) => (
            <button
              key={d.cle}
              type="button"
              aria-pressed={vue === d.cle}
              onClick={() => setVue(d.cle)}
              className={
                "h-7 px-2.5 rounded-full text-[12px] border transition-colors inline-flex items-center gap-1.5 " +
                (vue === d.cle ? "bg-green-50 text-green-700 border-green-500/30 font-medium" : "bg-surface text-ink-2 border-line hover:bg-surface-2")
              }
            >
              {d.label}
              <span className={vue === d.cle ? "text-green-700/70" : "text-ink-4"}>{d.n}</span>
            </button>
          ))}
          {filtreCopro !== "toutes" && (
            <button
              type="button"
              onClick={() => setFiltreCopro("toutes")}
              title="Retirer le filtre copropriété"
              className="h-7 px-2.5 rounded-full text-[12px] border border-info-500/30 bg-info-50 text-info-700 inline-flex items-center gap-1"
            >
              <Building2 strokeWidth={1.5} className="w-3 h-3" />
              {filtreCopro || "Non rattaché"}
              <X strokeWidth={1.5} className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

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
                  onClick={() => ouvrir(m.id)}
                />
              ))}
              {visibles.length === 0 && (
                <li className="px-4 py-6 text-center text-[12.5px] text-ink-3">Aucun mail.</li>
              )}
            </ul>
          </Card>
        </aside>

        {/* Volet droit : recommandation + detail */}
        <section className="flex-1 min-w-0">
          {selection ? (
            <AnalysePane
              m={selection}
              contexte={trouverContexte(data.contextes, selection.coproCode)}
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
              msgClasser={msgClasser}
              signatureHtml={signatureHtml}
              onCreerBrouillon={() => void creerBrouillon(selection)}
              onGenererBrouillon={() => void genererBrouillon(selection)}
              compose={composeParMail.has(selection.id)}
              onRepondre={() => repondre(selection)}
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
              copie={copie === selection.id}
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
              onCopier={() => {
                void navigator.clipboard?.writeText(brouillonDe(selection));
                setCopie(selection.id);
              }}
              onValider={() => void valider(selection)}
              onDevalider={() => devalider(selection)}
              onToggleSection={toggleSection}
            />
          ) : (
            <Card className="px-6 py-16 text-center">
              <Mail strokeWidth={1.25} className="w-8 h-8 text-ink-4 mx-auto" />
              <p className="text-[14px] font-medium text-ink mt-3">
                {vue === "traites" ? "Aucun mail traité" : vue === "tous" ? "Aucun mail" : "Boîte vide"}
              </p>
              <p className="text-[12.5px] text-ink-3 mt-1">
                {vue === "recus"
                  ? "Tous les mails de ce dossier sont traités."
                  : "Rien à afficher ici."}
              </p>
            </Card>
          )}
        </section>
      </div>

      {apercu ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`Aperçu ${apercu.nom}`}
        >
          <div className="absolute inset-0 bg-black/50" onClick={fermerApercu} />
          <div className="relative flex flex-col w-full max-w-[920px] h-[85vh] rounded-lg border border-line bg-surface shadow-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 h-11 border-b border-line shrink-0">
              <span className="text-[13px] font-medium text-ink truncate">{apercu.nom}</span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={apercu.url}
                  download={apercu.nom}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-line text-[12px] text-ink-2 hover:bg-surface-2"
                >
                  <Download strokeWidth={1.5} className="w-3.5 h-3.5" /> Télécharger
                </a>
                <button
                  type="button"
                  onClick={fermerApercu}
                  aria-label="Fermer"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-ink-2 hover:bg-surface-2"
                >
                  <X strokeWidth={1.5} className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 bg-surface-2">
              {apercu.type === "application/pdf" ? (
                <iframe src={apercu.url} title={apercu.nom} className="w-full h-full" />
              ) : apercu.type.startsWith("image/") ? (
                <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={apercu.url} alt={apercu.nom} className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-[13px] text-ink-3 px-4 text-center">
                  <p>Aperçu non disponible pour ce type de fichier.</p>
                  <a href={apercu.url} download={apercu.nom} className="text-green-700 hover:underline">
                    Télécharger «&nbsp;{apercu.nom}&nbsp;»
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatutBadge({ statut }: { statut: Statut }) {
  if (statut === "classe") return <Badge ton="ok">Classé</Badge>;
  if (statut === "repondu") return <Badge ton="info">Répondu</Badge>;
  return null;
}

/** Une boite dans le rail : libelle + adresse + compteur de non-lus. */
function LigneMail({
  m,
  actif,
  lu,
  statut,
  onClick,
}: {
  m: MailEntrant;
  actif: boolean;
  lu: boolean;
  statut: Statut;
  onClick: () => void;
}) {
  const qui = m.de.replace(/ \(.*\)$/, "");
  return (
    <li className={actif ? "bg-green-50" : "hover:bg-surface-2"}>
      <button
        type="button"
        onClick={onClick}
        className={"w-full text-left px-3.5 py-2.5 transition-colors" + (statut === "classe" ? " opacity-55" : "")}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${!lu ? "bg-info-500" : "bg-transparent"}`} />
          <span
            className={
              "text-[12.5px] text-ink truncate flex-1 " +
              (statut === "classe" ? "line-through " : "") +
              (!lu ? "font-semibold" : "font-medium")
            }
          >
            {m.objet}
          </span>
          <span className="shrink-0 text-[11px] text-ink-4">{jourMois(m.date)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 pl-4 text-[11px] text-ink-3">
          <span className={"shrink-0 font-mono " + (m.coproCode ? "text-ink-2" : "text-ink-4")}>{m.coproCode || "—"}</span>
          <span className="truncate">· {qui}</span>
          {statut !== "nouveau" ? <span className="ml-auto shrink-0"><StatutBadge statut={statut} /></span> : null}
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
  if (boites.length < 2) return null;
  const horsFil = valeur !== boiteDuMail;
  return (
    <div className="mb-2 rounded-md border border-line bg-surface px-2.5 py-2">
      <div className="flex items-center gap-2">
        <label htmlFor="champ-de" className="w-7 shrink-0 text-[11px] font-medium text-ink-3">
          De
        </label>
        <select
          id="champ-de"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 h-7 rounded border border-line bg-surface px-1.5 text-[12px] text-ink"
        >
          {boites.map((b) => (
            <option key={b.id} value={b.id}>
              {b.adresse}
              {b.id === boiteDuMail ? " — boîte du mail" : ""}
            </option>
          ))}
        </select>
      </div>
      {horsFil && (
        <p className="mt-1.5 pl-9 text-[11px] text-warn-700">
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
}: {
  valeur: Destinataires;
  onChange: (champ: keyof Destinataires, v: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1 mb-2 rounded-md border border-line bg-surface px-2.5 py-2">
      <LigneDest label="À" champ="to" valeurs={valeur.to} onChange={onChange} />
      <LigneDest label="Cc" champ="cc" valeurs={valeur.cc} onChange={onChange} />
      <LigneDest label="Cci" champ="cci" valeurs={valeur.cci} onChange={onChange} />
    </div>
  );
}

function LigneDest({
  label,
  champ,
  valeurs,
  onChange,
}: {
  label: string;
  champ: keyof Destinataires;
  valeurs: string[];
  onChange: (champ: keyof Destinataires, v: string[]) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const ajouter = () => {
    const e = saisie.trim().replace(/[,;]$/, "").trim();
    if (e && !valeurs.includes(e)) onChange(champ, [...valeurs, e]);
    setSaisie("");
  };
  return (
    <div className="flex items-start gap-2 min-h-[24px]">
      <span className="w-7 shrink-0 pt-1 text-[11px] font-medium text-ink-3">{label}</span>
      <div className="flex-1 flex flex-wrap items-center gap-1">
        {valeurs.map((e) => (
          <span
            key={e}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-surface-3 text-[11.5px] text-ink-2"
          >
            <span className="truncate max-w-[200px]">{e}</span>
            <button
              type="button"
              onClick={() => onChange(champ, valeurs.filter((x) => x !== e))}
              aria-label={`Retirer ${e}`}
              className="text-ink-4 hover:text-err-700"
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
          className="flex-1 min-w-[120px] h-6 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-4"
        />
      </div>
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
      <p className="text-[11px] font-medium text-ink-3 flex items-center gap-1">
        <FilePlus2 strokeWidth={1.5} className="w-3.5 h-3.5 text-green-700" /> Créer un dossier
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TypeDossier)}
          aria-label="Type de dossier"
          className="h-7 rounded border border-line bg-surface px-1.5 text-[12px]"
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
          className="flex-1 min-w-[140px] h-7 rounded border border-line bg-surface px-2 text-[12px]"
        />
        <button
          type="button"
          disabled={!titre.trim()}
          onClick={() => onCreer(type, titre.trim())}
          className="h-7 px-2.5 rounded bg-green-700 text-white text-[12px] font-medium hover:bg-green-600 disabled:opacity-50"
        >
          Créer
        </button>
      </div>
    </div>
  );
}

const BTN_ACTION =
  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-line bg-surface text-[12px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed";
const SELECT_ACTION = "h-7 text-[12px] rounded-md border border-line bg-surface px-1.5 text-ink-2 max-w-[200px]";

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
  msgClasser,
  changer,
  ouverts,
  copie,
  onEditBrouillon,
  onBlurBrouillon,
  signatureHtml,
  onCreerBrouillon,
  onGenererBrouillon,
  compose,
  onRepondre,
  piecesJointes,
  onTelecharger,
  onApercu,
  onDeposer,
  adresseFactures,
  onTransmettreFacture,
  pjJointes,
  onTogglePjJointe,
  destinataires,
  onMajDestinataires,
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
  onCopier,
  onValider,
  onDevalider,
  onToggleSection,
}: {
  m: MailEntrant;
  contexte: ContexteCopro | undefined;
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
  msgClasser: string | null;
  changer: boolean;
  ouverts: Set<string>;
  copie: boolean;
  onEditBrouillon: (t: string) => void;
  onBlurBrouillon: () => void;
  signatureHtml?: string | null;
  onCreerBrouillon: () => void;
  onGenererBrouillon: () => void;
  compose: boolean;
  onRepondre: () => void;
  piecesJointes: PieceJointeRef[] | null;
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
  onCopier: () => void;
  onValider: () => void;
  onDevalider: () => void;
  onToggleSection: (cle: string) => void;
}) {
  const classe = statut === "classe";
  const labelValider = "Classer";
  const genEnCours = (msgBrouillon ?? "").startsWith("Génération");

  return (
    <Card className="overflow-hidden">
      {/* En-tête : objet, qui, quand -- puis UNE barre d'actions. */}
      <div className="px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-[16px] font-semibold text-ink leading-snug">{m.objet}</h2>
          {statut !== "nouveau" ? <StatutBadge statut={statut} /> : null}
        </div>
        <p className="mt-1 text-[12px] text-ink-3 leading-relaxed">
          <span className="font-medium text-ink">{m.de}</span> &lt;{m.expediteurEmail}&gt; → {m.destinataires.join(", ")}
          {m.copie.length > 0 && <> · Cc : {m.copie.join(", ")}</>} · {formatDateLongue(m.date)}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!(brouillon || compose) && (
            <button type="button" onClick={onRepondre} className={BTN_ACTION}>
              <Mail strokeWidth={1.5} className="w-3.5 h-3.5" />
              Répondre
            </button>
          )}
          {!(brouillon || compose) && m.ticketable ? (
            <button type="button" onClick={onGenererBrouillon} disabled={genEnCours} className={BTN_ACTION + " text-green-700"}>
              <Sparkles strokeWidth={1.5} className="w-3.5 h-3.5" />
              {genEnCours ? "Génération…" : "Brouillon IA"}
            </button>
          ) : null}
          <span className="inline-flex items-center gap-1 text-[12px]">
            <Building2 strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
            <select
              value={coproCode}
              onChange={(e) => onRattacherCopro(e.target.value)}
              aria-label="Copropriété du mail"
              title={coproCode ? `${coproCode} · ${coproNom}` : "Rattacher à une copropriété"}
              className={SELECT_ACTION}
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
            </select>
          </span>
          {classe ? (
            <span className="inline-flex items-center gap-2 text-[12px] text-ink-3">
              <Check strokeWidth={2} className="w-3.5 h-3.5 text-green-700" />
              {m.dossierClasseNom ? <>Classé dans «&nbsp;{m.dossierClasseNom}&nbsp;»</> : "Classé"}
              <button type="button" onClick={onDevalider} className="underline hover:text-ink">
                annuler
              </button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[12px]">
              <FolderInput strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                  <select
                    value={dossierIdChoisi}
                    onChange={(e) => onChoisirDossier(e.target.value)}
                    aria-label="Dossier Outlook de classement"
                    className={SELECT_ACTION}
                  >
                    <option value="">
                      {dossiers === null ? "Chargement des dossiers…" : "Classer dans…"}
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
                  </select>
              <button
                type="button"
                onClick={onValider}
                disabled={!dossierIdChoisi}
                title={!dossierIdChoisi ? "Choisis un dossier de destination" : "Classer dans ce dossier"}
                aria-label={labelValider}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-green-700 text-white hover:bg-green-700/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check strokeWidth={2} className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
          {ratt.intranet ? (
            <Link href={`/dossiers/${ratt.dossierId}`} className="inline-flex items-center gap-1 text-[12px] text-info-700 hover:underline">
              <Link2 strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
              {ratt.dossierLabel}
            </Link>
          ) : null}
          <button type="button" onClick={onToggleChanger} className="text-[12px] text-ink-3 underline hover:text-ink">
            {changer ? "fermer" : ratt.intranet ? "changer de dossier" : "dossier…"}
          </button>
        </div>
        {msgClasser ? <p className="mt-1.5 text-[11.5px] text-ink-3">{msgClasser}</p> : null}
        {msgBrouillon && !(brouillon || compose) ? <p className="mt-1.5 text-[11.5px] text-ink-3">{msgBrouillon}</p> : null}
      </div>

      {/* Le mail */}
      <div className="px-5 py-4">
        <div className="text-[13px] text-ink-2 whitespace-pre-wrap leading-relaxed max-h-[340px] overflow-auto">
          {m.corps}
        </div>
          {m.attachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {piecesJointes === null ? (
                <span className="inline-flex items-center gap-1 h-6 px-2 rounded border border-line bg-surface text-[11.5px] text-ink-3">
                  <Paperclip strokeWidth={1.5} className="w-3 h-3" />
                  Chargement des pièces jointes…
                </span>
              ) : piecesJointes.length === 0 ? (
                <span className="text-[11.5px] text-ink-4 italic">Pièces jointes indisponibles</span>
              ) : (
                piecesJointes.map((pj) => (
                  <span
                    key={pj.id}
                    title={formatTaille(pj.taille)}
                    className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded border border-line bg-surface text-[11.5px] text-ink-2"
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
                      className="text-ink-4 hover:text-ink"
                    >
                      <Download strokeWidth={1.5} className="w-3 h-3" />
                    </button>
                    {onDeposer && (
                      <button
                        type="button"
                        onClick={() => onDeposer(pj)}
                        title="Déposer dans le dossier SharePoint de la copropriété"
                        aria-label={`Déposer ${pj.nom} sur SharePoint`}
                        className="text-ink-4 hover:text-ink"
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
      </div>

      <div className="px-5 pb-4 flex flex-col gap-3">
        {changer && !coproCode && (
          <div className="rounded-md border border-dashed border-line px-3 py-2 text-[12px] text-ink-3">
            Lier un <strong>dossier de suivi intranet</strong> nécessite une copropriété. Pour simplement
            <strong> ranger</strong> ce mail, utilise «&nbsp;Classer dans…&nbsp;» en haut - aucune copropriété requise.
          </div>
        )}

        {changer && coproCode && (
          <div className="rounded-md border border-line overflow-hidden">
            {dossiersReels === null ? (
              <p className="px-3 py-2 text-[12px] text-ink-3">Chargement des dossiers…</p>
            ) : (
              <ul className="divide-y divide-line">
                {dossiersReels.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => onRattacherDossier(d.id, d.titre)}
                      className="w-full text-left px-3 py-2 text-[12.5px] text-ink hover:bg-surface-2 flex items-center gap-2"
                    >
                      <Link2 strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{d.titre}</span>
                      <Badge ton="outline">{TYPE_DOSSIER_LABEL[d.type]}</Badge>
                    </button>
                  </li>
                ))}
                {dossiersReels.length === 0 && (
                  <li className="px-3 py-2 text-[12px] text-ink-4">Aucun dossier sur cette copropriété.</li>
                )}
              </ul>
            )}
            <FormCreerDossier typeSuggere={typeSuggere} titreSuggere={m.objet} onCreer={onCreerDossier} />
          </div>
        )}

        {/* Réponse : seulement quand on l'a ouverte. */}
        {(brouillon || compose) && (
          <div className="rounded-lg border border-line p-4">
              <div className="flex items-center justify-between mt-3 mb-1">
              <span className="text-[11.5px] text-ink-3">Réponse (modifiable)</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onCopier} className={BTN}>
                  <Copy strokeWidth={1.5} className="w-3.5 h-3.5" />
                  {copie ? "Copié" : "Copier"}
                </button>
                <button type="button" onClick={onCreerBrouillon} className={BTN}>
                  <FilePlus2 strokeWidth={1.5} className="w-3.5 h-3.5" />
                  Brouillon Outlook
                </button>
              </div>
            </div>
            <ChampDe
              boites={boites}
              boiteDuMail={boiteDuMail}
              valeur={expediteur}
              onChange={onMajExpediteur}
            />
            <ChampsDestinataires valeur={destinataires} onChange={onMajDestinataires} />
            <input
              value={sujet}
              onChange={(e) => onMajSujet(e.target.value)}
              placeholder="Sujet"
              aria-label="Sujet de la réponse"
              className="w-full mb-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink outline-none focus:ring-1 focus:ring-green-500/40"
            />
            {piecesJointes && piecesJointes.length > 0 ? (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-ink-3">Joindre&nbsp;:</span>
                {piecesJointes.map((pj) => {
                  const jointe = pjJointes.has(pj.id);
                  return (
                    <button
                      key={pj.id}
                      type="button"
                      onClick={() => onTogglePjJointe(pj.id)}
                      title={jointe ? "Jointe à la réponse" : "Joindre à la réponse"}
                      className={`inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-full border text-[11.5px] transition-colors ${jointe ? "border-green-500/40 bg-green-50 text-green-700" : "border-line bg-surface text-ink-3 hover:bg-surface-2"}`}
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
            <textarea
              value={brouillon}
              onChange={(e) => onEditBrouillon(e.target.value)}
              onBlur={onBlurBrouillon}
              rows={7}
              className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-[12.5px] text-ink-2 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-green-500/40"
            />
            {signatureHtml ? (
              <div className="mt-2">
                <span className="text-[11px] text-ink-3">Signature (ajoutée à l’envoi)</span>
                <iframe
                  title="Signature"
                  sandbox=""
                  srcDoc={signatureHtml}
                  className="mt-1 w-full h-[110px] rounded-md border border-line bg-white"
                />
              </div>
            ) : null}
            <div className="mt-2.5 flex items-center gap-3">
              <button
                type="button"
                onClick={onEnvoyer}
                disabled={envoiEnCours}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-md text-[13px] font-medium bg-green-700 text-white hover:bg-green-700/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Send strokeWidth={2} className="w-4 h-4" />
                {envoiEnCours ? "Envoi…" : "Envoyer la réponse"}
              </button>
              {msgBrouillon ? <span className="text-[11.5px] text-ink-3">{msgBrouillon}</span> : null}
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
          <div className="flex flex-col gap-3 text-[12.5px]">
            <p className="text-ink">
              <span className="text-ink-3">Suggestion de l&apos;assistant : </span>
              {recommandation(m, ratt)}
            </p>
            {dossier && dossier.historique.length > 0 ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.06em] text-ink-4 mb-1">Fil ({dossier.historique.length})</p>
                <Timeline dossier={dossier} />
              </div>
            ) : null}
            <div>
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-4 mb-1">Copropriété (ESTALE)</p>
              <ContexteCoproContenu ctx={contexte} />
            </div>
          </div>
        </SectionRepliable>
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
        className="w-full flex items-center gap-1.5 py-2.5 text-left text-[12.5px] font-medium text-ink-2 hover:text-ink"
      >
        <ChevronRight
          strokeWidth={1.5}
          className={`w-3.5 h-3.5 text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {icone}
        {titre}
        {compte && <span className="text-ink-4 font-normal">· {compte}</span>}
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
          <p className="text-[12.5px] text-ink leading-snug">{e.resume}</p>
          <p className="text-[11px] text-ink-3 mt-0.5">
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
    <div className="flex items-start gap-2 text-[12.5px]">
      <span className="text-ink-3 mt-0.5 shrink-0">{icone}</span>
      <p className="text-ink-2">
        <span className="text-ink-3">{label} : </span>
        {children}
      </p>
    </div>
  );
}

function ContexteCoproContenu({ ctx }: { ctx: ContexteCopro | undefined }) {
  if (!ctx || !ctx.disponible) {
    return (
      <p className="text-[12.5px] text-ink-3 italic">
        Indisponible (copro absente d’eStale, ou eStale non configuré).
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
