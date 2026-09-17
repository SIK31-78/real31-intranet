"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import type {
  DossierBoite,
  MailEntrant,
  MesEmails,
  PieceJointeRef,
  Rattachement,
} from "@/lib/domain/mes-emails";
import {
  destinatairesDeReponse,
  dossierOutlookSuggere,
  sujetDeReponse,
  trierMails,
  trouverContexte,
  trouverDossier,
  typeDossierSuggere,
  type Destinataires,
} from "@/lib/domain/mes-emails";
import type { TypeDossier } from "@/lib/domain/dossier";
import { Card } from "@/components/ui/card";
import {
  devaliderMailAction,
  editBrouillonAction,
  marquerLuAction,
  creerBrouillonAction,
  genererBrouillonAction,
  envoyerReponseAction,
  chargerPiecesJointesAction,
  chargerCorpsAction,
  telechargerPieceJointeAction,
  rattacherCoproAction,
  chargerDossiersAction,
  classerDansDossierAction,
  chargerDossiersCoproAction,
  rattacherADossierAction,
  creerDossierDepuisMailAction,
} from "@/app/mes-emails/actions";
import { EnTete } from "./en-tete-mails";
import { ListeMails } from "./liste-mails";
import { AnalysePane } from "./panneau-analyse";
import { VisionneusePj, type ApercuPj } from "./visionneuse-pj";
import type { CorpsAffiche, Statut, VueBoite } from "./mes-emails.utils";

// Orchestrateur de « Mes e-mails » : tout l'etat et les actions vivent ici ; l'ecran est
// compose de la liste (volet gauche), du panneau d'analyse (volet droit) et de la
// visionneuse de piece jointe. Les regles de la reponse (sujet, destinataires, dossier
// propose, recommandation) vivent dans le domaine mes-emails, testees ; l'ecran ne fait
// que les appeler.
const defautSujet = sujetDeReponse;
const defautDestinataires = destinatairesDeReponse;

export function MesEmailsVue({
  data,
  signatureHtml,
}: {
  data: MesEmails;
  signatureHtml?: string | null;
}) {
  const mailsTries = useMemo(() => trierMails(data.mails), [data.mails]);
  const copros = useMemo(() => {
    const vus = new Map<string, string>();
    for (const m of data.mails) if (!vus.has(m.coproCode)) vus.set(m.coproCode, m.coproNom);
    return [...vus.entries()].map(([code, nom]) => ({ code, nom }));
  }, [data.mails]);

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
  const [vue, setVue] = useState<VueBoite>("recus");
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
  // Vrais dossiers Outlook de la boite (charges en lazy) + dossier choisi par mail.
  // null = chargement ; "indisponible" = Outlook n'a pas repondu (pas une liste vide).
  const [dossiers, setDossiers] = useState<DossierBoite[] | null | "indisponible">(null);
  const [dossiersChoisis, setDossiersChoisis] = useState<Map<string, string>>(new Map());
  const [msgClasser, setMsgClasser] = useState<string | null>(null);
  // Dossiers REELS (module Dossiers) de la copro, charges en lazy a l'ouverture du picker.
  const [dossiersReels, setDossiersReels] = useState<
    Map<string, { id: string; titre: string; type: TypeDossier }[]>
  >(new Map());
  // Pieces jointes REELLES chargees a la demande a l'ouverture (null = en cours).
  const [pjParMail, setPjParMail] = useState<Map<string, PieceJointeRef[] | null | "indisponible">>(new Map());
  // Corps complet charge a l'ouverture (la liste n'a qu'un extrait) : null = en cours.
  const [corpsParMail, setCorpsParMail] = useState<Map<string, string | null | "indisponible">>(new Map());
  // Destinataires editables de la reponse (A / Cc / Cci), par mail.
  const [destParMail, setDestParMail] = useState<Map<string, Destinataires>>(new Map());
  // Mails dont l'editeur de reponse est ouvert manuellement (ex. mail sans action).
  const [composeParMail, setComposeParMail] = useState<Set<string>>(new Set());
  // Sujet editable de la reponse, par mail.
  const [sujetParMail, setSujetParMail] = useState<Map<string, string>>(new Map());
  // PJ reçues a RE-JOINDRE a la reponse (ids d'attachment selectionnes), par mail.
  const [pjJointesParMail, setPjJointesParMail] = useState<Map<string, Set<string>>>(new Map());
  // Visionneuse de piece jointe (PDF/image) : blob courant ouvert dans la modale.
  const [apercu, setApercu] = useState<ApercuPj | null>(null);

  useEffect(() => {
    void chargerDossiersAction()
      .then((r) => setDossiers(r.ok ? r.dossiers : "indisponible"))
      .catch(() => setDossiers("indisponible"));
  }, []);

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
  const sujetDe = (m: MailEntrant): string => sujetParMail.get(m.id) ?? defautSujet(m);
  const majSujet = (m: MailEntrant, v: string) => setSujetParMail((p) => new Map(p).set(m.id, v));
  const pjJointesDe = (m: MailEntrant): Set<string> => pjJointesParMail.get(m.id) ?? new Set();
  const corpsDe = (m: MailEntrant): CorpsAffiche => {
    if (!m.corpsTronque) return { texte: m.corps, etat: "complet" };
    const c = corpsParMail.get(m.id);
    if (typeof c === "string" && c !== "indisponible") return { texte: c, etat: "complet" };
    return { texte: m.corps, etat: c === "indisponible" ? "indisponible" : "chargement" };
  };
  const togglePjJointe = (m: MailEntrant, id: string) =>
    setPjJointesParMail((p) => {
      const courant = new Set(p.get(m.id) ?? []);
      if (courant.has(id)) courant.delete(id);
      else courant.add(id);
      return new Map(p).set(m.id, courant);
    });

  // Dossier Outlook auto-detecte (nom contenant le code copro, puis le nom) : sert de
  // preselection ; l'utilisateur peut choisir un autre dossier (copro, agence, spam...).
  const autoDossier = (m: MailEntrant): string => (Array.isArray(dossiers) ? dossierOutlookSuggere(m, dossiers) : "");
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
    const r = await creerBrouillonAction(m.id, m.coproCode, brouillonDe(m));
    setMsgBrouillon(r.ok ? "Brouillon créé dans Outlook." : `Échec : ${r.message ?? ""}`);
  }

  // Ouvre l'editeur de reponse sur un mail (meme sans action) : reponse manuelle.
  const repondre = (m: MailEntrant) => setComposeParMail((p) => new Set(p).add(m.id));

  // Recupere une PJ (base64 cote serveur) -> Blob -> URL objet (pour download OU apercu).
  async function chargerBlobPj(
    m: MailEntrant,
    pj: PieceJointeRef,
  ): Promise<ApercuPj | null> {
    const r = await telechargerPieceJointeAction(m.id, coproDe(m).code, pj.id);
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
  const countCopro = (code: string | null): number =>
    data.mails.filter((m) => matchVue(m) && (code === null || m.coproCode === code)).length;
  const countCoproNonLus = (code: string | null): number =>
    data.mails.filter(
      (m) => matchVue(m) && !lus.has(m.id) && (code === null || m.coproCode === code),
    ).length;
  const visibles = mailsTries.filter(
    (m) =>
      matchVue(m) &&
      (filtreCopro === "toutes" || m.coproCode === filtreCopro) &&
      (q === "" || `${m.objet} ${m.de} ${m.coproNom}`.toLowerCase().includes(q)),
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
        void chargerPiecesJointesAction(id, coproDe(m).code).then((r) =>
          setPjParMail((prev) => new Map(prev).set(id, r.ok ? r.pieces : "indisponible")),
        );
      }
      // Le corps complet, une seule fois par mail (la liste n'a qu'un extrait).
      if (m.corpsTronque && !corpsParMail.has(id)) {
        setCorpsParMail((p) => new Map(p).set(id, null));
        void chargerCorpsAction(id, coproDe(m).code).then((r) =>
          setCorpsParMail((prev) => new Map(prev).set(id, r.ok ? r.corps : "indisponible")),
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
    const recap = `Envoyer la réponse à ${dst.to.join(", ")}${dst.cc.length ? `\n(cc : ${dst.cc.join(", ")})` : ""}${dst.cci.length ? `\n(cci : ${dst.cci.join(", ")})` : ""} ?`;
    if (!window.confirm(recap)) return;
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
      );
      if (!r.ok) {
        setMsgBrouillon(`Échec de l'envoi : ${r.message ?? ""}`);
        return;
      }
      setRepondus((p) => add(p, m.id));
      setMsgBrouillon("Réponse envoyée ✓");
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
    const folderNom = (Array.isArray(dossiers) ? dossiers : []).find((f) => f.id === folderId)?.nom ?? m.dossierClasseNom ?? "";
    void classerDansDossierAction(m.id, coproDe(m).code, folderId, folderNom, [], brouillonDe(m)).then((r) => {
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

  const nbNonLus = data.mails.filter((m) => !lus.has(m.id)).length;
  const nbClasses = classes.size;
  const nbRecus = data.mails.length - nbClasses;
  const DOSSIERS = [
    { cle: "recus", label: "Reçus", n: nbRecus },
    { cle: "traites", label: "Traités", n: nbClasses },
    { cle: "tous", label: "Tous", n: data.mails.length },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <EnTete
        data={data}
        nbNonLus={nbNonLus}
        nbATraiter={data.mails.length - nbClasses}
        nbClasses={nbClasses}
      />

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Volet gauche : la boite */}
        <ListeMails
          vue={vue}
          onChangerVue={setVue}
          dossiersVue={DOSSIERS}
          copros={copros}
          filtreCopro={filtreCopro}
          onFiltrerCopro={setFiltreCopro}
          countCopro={countCopro}
          countCoproNonLus={countCoproNonLus}
          recherche={recherche}
          onRecherche={setRecherche}
          visibles={visibles}
          selectionId={selection?.id}
          lus={lus}
          statutDe={statutDe}
          onOuvrir={ouvrir}
        />

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
              corps={corpsDe(selection)}
              onTelecharger={(pj) => void telechargerPj(selection, pj)}
              onApercu={(pj) => void voirPj(selection, pj)}
              pjJointes={pjJointesDe(selection)}
              onTogglePjJointe={(id) => togglePjJointe(selection, id)}
              destinataires={destinatairesDe(selection)}
              onMajDestinataires={(champ, v) => majDest(selection, champ, v)}
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
              <Mail strokeWidth={1.25} className="w-8 h-8 text-ink-3 mx-auto" />
              <p className="text-body font-medium text-ink mt-3">
                {vue === "traites" ? "Aucun mail traité" : vue === "tous" ? "Aucun mail" : "Boîte vide"}
              </p>
              <p className="text-body text-ink-3 mt-1">
                {vue === "recus"
                  ? "Tous les mails de ce dossier sont traités."
                  : "Rien à afficher ici."}
              </p>
            </Card>
          )}
        </section>
      </div>

      <VisionneusePj apercu={apercu} onFermer={fermerApercu} />
    </div>
  );
}
