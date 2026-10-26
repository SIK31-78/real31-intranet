"use client";

// Ecran du tri des e-mails V2 (ADR-046) : la file a gauche, le mail et son rattachement
// a droite ; un onglet journal pour la revue de fin de semaine. Increment 2 : on range
// d'un clic (dossier du binome, Comptabilité, Divers) et on peut annuler. Sans
// MAIL_TRI_ECRITURE=on, tout rangement est simule (le mail ne bouge pas).

import { chercherCopros } from "@/lib/domain/recherche-copro-tolerante";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Paperclip } from "lucide-react";
import type { CoproDeLaFile, FileATrier, MailDeLaFile } from "@/lib/services/tri-emails/lire-file";
import type { Collaborateur } from "@/lib/services/tri-emails/binomes";
import {
  PAR_AUTOMATIQUE,
  PAR_OUTLOOK,
  signalDuRangement,
  suggestionSuivie,
  type CibleTri,
  type DossierChoisissable,
  type EntreeJournalTri,
  type LigneBinome,
  type MotifCorbeille,
  type NatureSuggestion,
  type SignalTri,
} from "@/lib/domain/tri-emails";
import {
  affecterCoproAction,
  ajouterAssistantAction,
  annulerRangementAction,
  definirPrincipalAction,
  lirePieceJointeTriAction,
  listerPiecesJointesTriAction,
  preciserCoproAction,
  coproDepuisPjAction,
  rangerMailAction,
  retirerAssistantAction,
  supprimerMailAction,
} from "@/app/tri-emails/actions";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented";
import { VisionneusePj, type ApercuPj } from "@/components/mes-emails/visionneuse-pj";
import { HistoriqueMailTri } from "@/components/tri-emails/historique-mail-tri";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { Tab, TabList, TabPanel } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const TON: Record<NatureSuggestion, BadgeTon> = {
  sure: "ok",
  faible: "info",
  plusieurs: "warn",
  "hors-estale": "err",
  aucune: "neutral",
};

const TITRE: Record<NatureSuggestion, string> = {
  sure: "Suggestion",
  faible: "Suggestion à confirmer",
  plusieurs: "À départager",
  "hors-estale": "Hors périmètre",
  aucune: "Pas de suggestion",
};

const LIBELLE_SIGNAL: Record<SignalTri, string> = {
  sure: "suggestion sûre",
  faible: "indice faible",
  plusieurs: "plusieurs copros",
  "hors-estale": "hors périmètre",
  aucune: "aucune piste",
  pj: "pièce jointe",
  conversation: "même conversation",
};

const LIBELLE_CORBEILLE: Record<MotifCorbeille, string> = {
  "non-remis": "Non remis",
  "reponse-auto": "Réponse auto",
  publicite: "Publicité",
};

function pastille(m: MailDeLaFile): string {
  const s = m.suggestion;
  if (m.corbeille) return "Corbeille proposée";
  if (s.nature === "sure" || s.nature === "faible") return s.candidats[0]!;
  if (s.nature === "plusieurs") return `${s.candidats.length} copros possibles`;
  if (s.nature === "hors-estale") return "Hors périmètre";
  return "Aucune piste";
}

// Résultat de l'analyse des PDF par mail (internetMessageId -> copro déduite ou null), pour
// la durée de la page : revenir sur un mail ne relance pas le téléchargement des PDF.
const ANALYSE_PJ = new Map<string, { candidats: string[]; piece: string } | null>();

// Type MIME fiable d'une pièce jointe : l'extension du nom prime sur ce que Graph déclare
// (il renvoie souvent « application/octet-stream » pour un PDF ou une image).
const MIME_PAR_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
};
function mimePieceJointe(nom: string, declare: string | undefined): string {
  const ext = nom.toLowerCase().split(".").pop() ?? "";
  return MIME_PAR_EXT[ext] ?? declare ?? "application/octet-stream";
}

const heure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Dernier = { journalId: string; dossierNom: string; objet: string; mailId: string; simulation: boolean };

export function TriEmailsVue({ file }: { file: FileATrier }) {
  const [onglet, setOnglet] = useState<"file" | "journal" | "binomes">("file");
  // Mails ranges depuis l'affichage : masques tout de suite, sans attendre le rechargement.
  const [masques, setMasques] = useState<Set<string>>(new Set());
  const [dernier, setDernier] = useState<Dernier | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const mails = file.mails.filter((m) => !masques.has(m.id));
  // Rangements automatiques (tâche planifiée) encore en place : on les signale,
  // ils s'annulent d'un clic dans l'onglet du journal.
  const rangesAuto = file.journal.filter((e) => e.par === PAR_AUTOMATIQUE).length;

  // Arrivee automatique des nouveaux mails (demande du 08/10) : on relit la file toutes
  // les 60 s quand l'onglet est visible, et des qu'on y revient. Jamais pendant une action.
  const occupe = useRef(false);
  useEffect(() => {
    occupe.current = enCours;
  }, [enCours]);
  useEffect(() => {
    const rafraichir = () => {
      if (document.visibilityState === "visible" && !occupe.current) router.refresh();
    };
    const minuterie = setInterval(rafraichir, 60_000);
    document.addEventListener("visibilitychange", rafraichir);
    return () => {
      clearInterval(minuterie);
      document.removeEventListener("visibilitychange", rafraichir);
    };
  }, [router]);

  function ranger(mail: MailDeLaFile, cible: CibleTri) {
    demarrer(async () => {
      const r = await rangerMailAction({
        messageId: mail.id,
        internetMessageId: mail.internetMessageId,
        expediteur: mail.deAdresse,
        objet: mail.objet,
        cible,
        // Copro venue d'un PDF : le journal le dit (audit du 19/10/2026).
        suggestion: signalDuRangement(mail.suggestion, ANALYSE_PJ.get(mail.internetMessageId) ?? null),
      });
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      setMasques((m) => new Set(m).add(mail.id));
      if (r.donnees) setDernier({ ...r.donnees, objet: mail.objet, mailId: mail.id });
      if (r.donnees?.etiquetteNonPosee) toast.warn("Mail rangé, mais l'étiquette n'a pas pu être posée : ajoute-la dans Outlook.");
      router.refresh();
    });
  }

  function supprimer(mail: MailDeLaFile) {
    demarrer(async () => {
      const r = await supprimerMailAction({
        messageId: mail.id,
        internetMessageId: mail.internetMessageId,
        expediteur: mail.deAdresse,
        objet: mail.objet,
        // Copro venue d'un PDF : le journal le dit (audit du 19/10/2026).
        suggestion: signalDuRangement(mail.suggestion, ANALYSE_PJ.get(mail.internetMessageId) ?? null),
      });
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      setMasques((m) => new Set(m).add(mail.id));
      if (r.donnees) setDernier({ ...r.donnees, objet: mail.objet, mailId: mail.id });
      router.refresh();
    });
  }

  function annuler(journalId: string, mailId?: string) {
    demarrer(async () => {
      const r = await annulerRangementAction({ journalId });
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      if (mailId) {
        setMasques((m) => {
          const n = new Set(m);
          n.delete(mailId);
          return n;
        });
      }
      setDernier(null);
      toast.ok("Remis dans la boîte de réception.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {file.corrigesOutlook > 0 && (
        <div role="status" className="rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-body text-ink-2">
          {file.corrigesOutlook === 1
            ? "Un mail déplacé à la main dans Outlook a été pris en compte."
            : `${file.corrigesOutlook} mails déplacés à la main dans Outlook ont été pris en compte.`}{" "}
          Voir l&apos;onglet « Rangés sur 7 jours ».
        </div>
      )}
      {rangesAuto > 0 && (
        <div role="status" className="rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-body text-ink-2">
          {rangesAuto === 1
            ? "Un mail a été rangé automatiquement ces 7 derniers jours."
            : `${rangesAuto} mails ont été rangés automatiquement ces 7 derniers jours.`}{" "}
          Voir l&apos;onglet « Rangés sur 7 jours » pour les vérifier ou les annuler.
        </div>
      )}
      {dernier && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3.5 py-2 text-body">
          <span className="min-w-0 flex-1">
            {dernier.simulation ? "Simulé : " : ""}« {dernier.objet} » rangé dans <span className="font-mono">{dernier.dossierNom}</span>.
          </span>
          <Button size="sm" variant="ghost" disabled={enCours} onClick={() => annuler(dernier.journalId, dernier.mailId)}>
            Annuler
          </Button>
        </div>
      )}
      <TabList label="Tri des e-mails">
        <Tab id="tri-t-file" panelId="tri-p-file" active={onglet === "file"} onClick={() => setOnglet("file")} count={mails.length}>
          À trier
        </Tab>
        <Tab
          id="tri-t-journal"
          panelId="tri-p-journal"
          active={onglet === "journal"}
          onClick={() => setOnglet("journal")}
          count={file.journal.length}
        >
          Rangés sur 7 jours
        </Tab>
        <Tab
          id="tri-t-binomes"
          panelId="tri-p-binomes"
          active={onglet === "binomes"}
          onClick={() => setOnglet("binomes")}
          count={file.binomes.filter((b) => b.copros.length > 0 && !b.principal).length || undefined}
        >
          Binômes
        </Tab>
      </TabList>
      {onglet === "file" && (
        <TabPanel id="tri-p-file" tabId="tri-t-file">
          <FileVue copros={file.copros} dossiers={file.dossiers} mails={mails} enCours={enCours} ranger={ranger} supprimer={supprimer} />
        </TabPanel>
      )}
      {onglet === "journal" && (
        <TabPanel id="tri-p-journal" tabId="tri-t-journal">
          <JournalVue journal={file.journal} copros={file.copros} enCours={enCours} annuler={(id) => annuler(id)} />
        </TabPanel>
      )}
      {onglet === "binomes" && (
        <TabPanel id="tri-p-binomes" tabId="tri-t-binomes">
          <BinomesVue lignes={file.binomes} collaborateurs={file.collaborateurs} />
        </TabPanel>
      )}
    </div>
  );
}

function FileVue({
  copros,
  dossiers,
  mails,
  enCours,
  ranger,
  supprimer,
}: {
  copros: CoproDeLaFile[];
  dossiers: DossierChoisissable[];
  mails: MailDeLaFile[];
  enCours: boolean;
  ranger: (mail: MailDeLaFile, cible: CibleTri) => void;
  supprimer: (mail: MailDeLaFile) => void;
}) {
  const [courantId, setCourantId] = useState<string | null>(mails[0]?.id ?? null);
  const [filtre, setFiltre] = useState("");
  // Choix de copro par mail (id -> reference), le temps de l'affichage.
  const [choix, setChoix] = useState<Record<string, string>>({});

  const parRef = useMemo(() => new Map(copros.map((c) => [c.reference, c])), [copros]);

  const visibles = useMemo(() => {
    const q = normaliser(filtre.trim());
    if (!q) return mails;
    return mails.filter((m) => normaliser(`${m.deNom} ${m.deAdresse} ${m.objet} ${m.suggestion.candidats.join(" ")}`).includes(q));
  }, [mails, filtre]);

  // Quand le mail courant est rangé il quitte la file : on avance au SUIVANT (même position),
  // au lieu de revenir en haut (correction du 13/10/2026). L'index courant est mémorisé.
  const indexCourant = useRef(0);
  useEffect(() => {
    const i = mails.findIndex((m) => m.id === courantId);
    if (i >= 0) {
      indexCourant.current = i;
      return;
    }
    const suivant = mails[Math.min(indexCourant.current, mails.length - 1)];
    setCourantId(suivant ? suivant.id : null);
  }, [mails, courantId]);

  const courant = mails.find((m) => m.id === courantId) ?? null;

  // Garder la ligne sélectionnée visible sans sauter en haut de la liste.
  const ligneCourante = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    ligneCourante.current?.scrollIntoView({ block: "nearest" });
  }, [courant?.id]);

  if (mails.length === 0) {
    return <EmptyState>La boîte de réception générique est vide : tout est trié.</EmptyState>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr] items-start">
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="p-3 border-b border-line">
          <label htmlFor="tri-filtre" className="sr-only">
            Filtrer la file
          </label>
          <input
            id="tri-filtre"
            type="search"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Filtrer : expéditeur, objet, code copro"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-body focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          />
        </div>
        <ul className="max-h-[70vh] overflow-y-auto">
          {visibles.map((m) => (
            <li key={m.id} ref={m.id === courant?.id ? ligneCourante : null} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => setCourantId(m.id)}
                aria-current={m.id === courant?.id}
                className={cn(
                  "w-full text-left px-4 py-2.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 hover:bg-surface-2",
                  m.id === courant?.id && "bg-green-50 hover:bg-green-50",
                )}
              >
                <span className="font-medium text-ink truncate">{m.deNom}</span>
                <span className="font-mono text-meta text-ink-3 tabular-nums">{heure(m.recuLe)}</span>
                <span className="col-span-2 text-ink-2 truncate">{m.objet}</span>
                <span className="col-span-2 mt-1 flex flex-wrap gap-1.5">
                  {m.interne && <Badge ton="err">Interne</Badge>}
                  {!m.interne && m.corbeille && <Badge ton="err">{LIBELLE_CORBEILLE[m.corbeille]}</Badge>}
                  <Badge ton={TON[m.suggestion.nature]}>{pastille(m)}</Badge>
                  {m.suggestion.candidats.length === 1 && parRef.get(m.suggestion.candidats[0]!)?.inactive && <Badge ton="outline">copro inactive</Badge>}
                </span>
              </button>
            </li>
          ))}
          {visibles.length === 0 && <li className="p-6 text-center text-ink-3">Aucun mail ne correspond au filtre.</li>}
        </ul>
      </div>

      {courant ? (
        <DetailMail
          key={courant.id}
          mail={courant}
          copros={copros}
          dossiers={dossiers}
          parRef={parRef}
          choisie={choix[courant.id] ?? (courant.suggestion.candidats.length === 1 ? courant.suggestion.candidats[0]! : null)}
          choisir={(ref) => setChoix((c) => ({ ...c, [courant.id]: ref }))}
          enCours={enCours}
          ranger={(cible) => ranger(courant, cible)}
          supprimer={() => supprimer(courant)}
        />
      ) : (
        <EmptyState>Sélectionnez un mail dans la file.</EmptyState>
      )}
    </div>
  );
}

function DetailMail({
  mail,
  copros,
  dossiers,
  parRef,
  choisie,
  choisir,
  enCours,
  ranger,
  supprimer,
}: {
  mail: MailDeLaFile;
  copros: CoproDeLaFile[];
  dossiers: DossierChoisissable[];
  parRef: Map<string, CoproDeLaFile>;
  choisie: string | null;
  choisir: (ref: string) => void;
  enCours: boolean;
  ranger: (cible: CibleTri) => void;
  supprimer: () => void;
}) {
  const [recherche, setRecherche] = useState("");
  const s = mail.suggestion;
  const copro = choisie ? parRef.get(choisie) ?? null : null;
  const dest = copro?.destination ?? null;

  // Quand le mail n'a pas de piste sûre, on lit automatiquement le texte de ses PDF (facture,
  // bon d'intervention) pour en déduire une copro (décision du 13/10/2026). À confirmer.
  const [pjCopro, setPjCopro] = useState<{ candidats: string[]; piece: string } | null>(
    () => ANALYSE_PJ.get(mail.internetMessageId) ?? null,
  );
  // « En cours » se déduit : une analyse est due et ce mail n'a pas encore de réponse.
  const [analyseFinie, setAnalyseFinie] = useState<string | null>(null);
  // Mail interne, non remis, réponse automatique : la corbeille est proposée, pas de lecture des PDF.
  const aCorbeille = Boolean(mail.interne || mail.corbeille);
  const analyseDue = !aCorbeille && mail.aPiecesJointes && s.nature !== "sure" && !ANALYSE_PJ.has(mail.internetMessageId);
  const pjEnCours = analyseDue && analyseFinie !== mail.internetMessageId;
  useEffect(() => {
    if (aCorbeille || !mail.aPiecesJointes || s.nature === "sure") return;
    // Déjà analysé (retour sur un mail) : pas de nouveau téléchargement des PDF.
    if (ANALYSE_PJ.has(mail.internetMessageId)) return;
    let actif = true;
    const id = mail.internetMessageId;
    coproDepuisPjAction({ internetMessageId: id }).then(
      (r) => {
        // Le résultat est gardé même si on a quitté le mail entre-temps.
        if (r.ok) ANALYSE_PJ.set(id, r.donnees ?? null);
        if (!actif) return;
        setAnalyseFinie(id);
        if (r.ok && r.donnees) setPjCopro(r.donnees);
      },
      () => {
        if (actif) setAnalyseFinie(id);
      },
    );
    return () => {
      actif = false;
    };
  }, [mail.internetMessageId, mail.aPiecesJointes, aCorbeille, s.nature]);

  const resultats = useMemo(() => {
    // Tolérante : « St Martin » trouve STMARTIN, la ville compte, S109 = S0109 (REA-327).
    return chercherCopros(copros, recherche);
  }, [copros, recherche]);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-title font-medium text-ink text-balance">{mail.objet}</h2>
            <p className="text-meta text-ink-2 mt-0.5">
              {mail.deNom} · <span className="font-mono">{mail.deAdresse}</span> · {heure(mail.recuLe)}
            </p>
            {mail.a && mail.a.length > 0 && (
              <p className="text-meta text-ink-3 mt-0.5 break-words">
                À : <span className="font-mono">{mail.a.join(", ")}</span>
              </p>
            )}
          </div>
          {mail.lienOutlook && (
            <a
              href={mail.lienOutlook}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-2 px-3 py-1.5 text-body font-medium hover:bg-surface-2"
            >
              Ouvrir dans Outlook
              <ExternalLink strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
        {/* Hauteur fixe, defilement interne (retour de Sekou du 08/10) : un long mail ne
            repousse plus le bloc de rattachement sous la ligne de flottaison. */}
        <div
          tabIndex={0}
          aria-label="Contenu du mail"
          className="mt-3 pt-3 border-t border-line max-h-[38vh] overflow-y-auto pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded-sm"
        >
          <p className="whitespace-pre-line text-ink-2 max-w-[68ch]">{mail.apercu}</p>
        </div>
        {/* L'aperçu est coupé avant le message cité : l'échange complet se déplie ici (REA-352). */}
        <HistoriqueMailTri key={mail.internetMessageId} internetMessageId={mail.internetMessageId} />
        {mail.aPiecesJointes && <PiecesJointes internetMessageId={mail.internetMessageId} />}
      </section>

      {aCorbeille && (
        <div className="rounded-xl border border-err-200 bg-err-50 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-body text-ink">
            {mail.interne ? (
              <>
                <strong className="font-medium">Mail interne</strong> : réponse d&apos;un collègue, la boîte partagée est restée en copie. Sans utilité : à mettre en corbeille.
              </>
            ) : mail.corbeille === "non-remis" ? (
              <>
                <strong className="font-medium">Non remis</strong> : avis de non-remise d&apos;un mail envoyé. Proposé à la corbeille ; rien n&apos;est supprimé sans votre clic.
              </>
            ) : mail.corbeille === "publicite" ? (
              <>
                <strong className="font-medium">Publicité</strong> : cet expéditeur a déjà été mis à la corbeille au moins deux fois, et jamais rangé. Proposé à la corbeille ; rien n&apos;est supprimé sans votre clic.
              </>
            ) : (
              <>
                <strong className="font-medium">Réponse automatique</strong> : absence ou accusé de réception. Proposée à la corbeille ; rien n&apos;est supprimé sans votre clic.
              </>
            )}
          </span>
          <Button variant="destructive" size="sm" disabled={enCours} onClick={supprimer}>
            Mettre à la corbeille
          </Button>
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface p-4 sm:p-5 flex flex-col gap-3">
        <h3 className="text-meta uppercase tracking-wider text-ink-3 font-medium">Rattacher à une copropriété</h3>

        <div
          className={cn(
            "rounded-lg border px-3 py-2.5 flex flex-col gap-2",
            s.nature === "sure" ? "border-green-200 bg-green-50" : s.nature === "aucune" ? "border-line bg-surface-2" : "border-transparent bg-warn-50",
          )}
        >
          <strong className="font-medium text-ink">{TITRE[s.nature]}</strong>
          <span className="text-meta text-ink-2">{s.raison}</span>
          {s.candidats.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {s.candidats.map((ref) => (
                <button
                  key={ref}
                  type="button"
                  onClick={() => choisir(ref)}
                  aria-pressed={choisie === ref}
                  className={cn(
                    "rounded-lg border border-line-2 bg-surface px-2.5 py-1 text-left text-body hover:bg-surface-2",
                    choisie === ref && "border-green-600 ring-1 ring-green-600",
                  )}
                >
                  <span className="font-mono text-meta text-green-700 font-medium">{ref}</span> {parRef.get(ref)?.nom}
                  <MentionInactive copro={parRef.get(ref)} />
                </button>
              ))}
            </div>
          )}
        </div>

        {(pjEnCours || pjCopro) && (
          <div className="rounded-lg border border-info-200 bg-info-50 px-3 py-2.5 flex flex-col gap-2">
            {pjEnCours && !pjCopro && <span className="text-meta text-ink-2">Analyse des pièces jointes…</span>}
            {pjCopro && (
              <>
                <span className="text-meta text-ink-2">
                  D&apos;après la pièce jointe «&nbsp;{pjCopro.piece}&nbsp;», à confirmer :
                </span>
                <div className="flex flex-wrap gap-2">
                  {pjCopro.candidats
                    .filter((ref) => parRef.has(ref))
                    .map((ref) => (
                      <button
                        key={ref}
                        type="button"
                        onClick={() => choisir(ref)}
                        aria-pressed={choisie === ref}
                        className={cn(
                          "rounded-lg border border-line-2 bg-surface px-2.5 py-1 text-left text-body hover:bg-surface-2",
                          choisie === ref && "border-green-600 ring-1 ring-green-600",
                        )}
                      >
                        <span className="font-mono text-meta text-green-700 font-medium">{ref}</span> {parRef.get(ref)?.nom}
                        <MentionInactive copro={parRef.get(ref)} />
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {s.nature !== "hors-estale" && (
          <div>
            <label htmlFor="tri-recherche" className="sr-only">
              Chercher une copropriété
            </label>
            <input
              id="tri-recherche"
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher une copropriété : code, nom, adresse"
              autoComplete="off"
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-body focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            />
            {resultats.length > 0 && (
              <ul className="mt-1.5 rounded-lg border border-line divide-y divide-line max-h-56 overflow-y-auto">
                {resultats.map((c) => (
                  <li key={c.reference}>
                    <button
                      type="button"
                      onClick={() => {
                        choisir(c.reference);
                        setRecherche("");
                      }}
                      className="w-full flex gap-3 px-3 py-1.5 text-left hover:bg-surface-2"
                    >
                      <span className="font-mono text-meta text-green-700 min-w-[52px]">{c.reference}</span>
                      <span className="text-ink">{c.nom}</span>
                      {c.source === "crypto" && <span className="text-meta text-ink-3">Crypto</span>}
                      <MentionInactive copro={c} />
                      <span className="ml-auto text-meta text-ink-3 truncate">{c.adresse}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {copro?.inactive && (
          <p className="text-meta text-ink-2">
            <strong className="font-medium text-ink">{copro.reference} est une copro inactive</strong> (mandat terminé) : vérifiez que le mail la
            concerne bien avant de le ranger.
          </p>
        )}

        {copro && (
          <div className="grid gap-2.5 sm:grid-cols-3 mt-1">
            <Case titre="Binôme">
              {dest ? (
                <>
                  <span className="font-medium text-ink">{dest.gestionnaire.nomComplet}</span>
                  <span className="text-meta text-ink-2">
                    {dest.assistant ? `Assistant : ${dest.assistant.nomComplet}` : "Assistant non renseigné"}
                  </span>
                </>
              ) : (
                <span className="text-ink-2">Pas de gestionnaire connu pour cette copropriété</span>
              )}
            </Case>
            <Case titre="Rangé dans">
              {dest?.dossier ? (
                <span className="font-mono text-body text-ink">{dest.dossier}</span>
              ) : (
                <span className="text-ink-2">Initiales du gestionnaire inconnues dans l&apos;intranet</span>
              )}
            </Case>
            <Case titre="Étiquette Outlook">
              <span className="font-mono text-meta w-fit rounded bg-info-50 text-info-700 px-2 py-0.5 font-medium">
                {copro.reference}
              </span>
            </Case>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-1">
          <Button
            variant="primary"
            loading={enCours}
            disabled={!copro || !dest?.nomDossier || enCours}
            onClick={() => copro && ranger({ type: "copro", reference: copro.reference })}
          >
            {dest?.nomDossier ? `Ranger dans ${dest.nomDossier}` : "Ranger"}
          </Button>
          <Button variant="secondary" disabled={enCours} onClick={() => ranger({ type: "comptabilite" })}>
            Comptabilité
          </Button>
          <Button variant="ghost" disabled={enCours} onClick={() => ranger({ type: "divers" })}>
            Divers
          </Button>
          <Button variant="destructive" disabled={enCours} onClick={supprimer} className="ml-auto">
            Supprimer
          </Button>
        </div>
        <RangerAilleurs
          key={mail.id}
          dossiers={dossiers}
          copros={copros}
          proposees={s.nature === "plusieurs" ? s.candidats : []}
          enCours={enCours}
          ranger={ranger}
        />
      </section>
    </div>
  );
}

/**
 * Ranger dans n'importe quel dossier de binome, avec zero, une ou plusieurs etiquettes :
 * l'invitation d'un prestataire (aucune copro), des factures pour plusieurs copros.
 */
function RangerAilleurs({
  dossiers,
  copros,
  proposees,
  enCours,
  ranger,
}: {
  dossiers: DossierChoisissable[];
  copros: CoproDeLaFile[];
  /** Etiquettes cochees d'avance : les copros candidates quand il y en a plusieurs. */
  proposees: string[];
  enCours: boolean;
  ranger: (cible: CibleTri) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [dossier, setDossier] = useState<DossierChoisissable | null>(null);
  const [rechDossier, setRechDossier] = useState("");
  const [etiquettes, setEtiquettes] = useState<string[]>(proposees);
  const [rechCopro, setRechCopro] = useState("");

  const dossiersTrouves = useMemo(() => {
    const q = normaliser(rechDossier.trim());
    return q ? dossiers.filter((d) => normaliser(d.libelle).includes(q)).slice(0, 6) : [];
  }, [dossiers, rechDossier]);
  const coprosTrouvees = useMemo(() => {
    const q = normaliser(rechCopro.trim());
    if (!q) return [];
    return copros.filter((c) => !etiquettes.includes(c.reference) && normaliser(`${c.reference} ${c.nom} ${c.adresse}`).includes(q)).slice(0, 6);
  }, [copros, rechCopro, etiquettes]);

  if (!ouvert) {
    return (
      <div>
        <Button size="sm" variant="ghost" onClick={() => setOuvert(true)}>
          Ranger dans un autre dossier…
        </Button>
      </div>
    );
  }

  const champ =
    "w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-body focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600";
  const resultat = "w-full flex gap-3 px-3 py-1.5 text-left hover:bg-surface-2";
  return (
    <div className="rounded-lg border border-line bg-canvas p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="font-medium text-ink">Ranger dans un autre dossier</strong>
        <Button size="sm" variant="ghost" onClick={() => setOuvert(false)}>
          Fermer
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-meta uppercase tracking-wider text-ink-3">Dossier</span>
        {dossier ? (
          <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-green-600 bg-surface px-2.5 py-1">
            <span className="text-ink">{dossier.libelle}</span>
            <button type="button" className="text-meta text-ink-3 hover:text-ink" onClick={() => setDossier(null)} aria-label="Changer de dossier">
              Changer
            </button>
          </span>
        ) : (
          <>
            <label htmlFor="ailleurs-dossier" className="sr-only">
              Chercher un dossier de binôme
            </label>
            <input
              id="ailleurs-dossier"
              type="search"
              value={rechDossier}
              onChange={(e) => setRechDossier(e.target.value)}
              placeholder="Initiales ou nom : SC, Sandy, Galiano…"
              autoComplete="off"
              className={champ}
            />
            {dossiersTrouves.length > 0 && (
              <ul className="rounded-lg border border-line divide-y divide-line bg-surface">
                {dossiersTrouves.map((d) => (
                  <li key={d.cle}>
                    <button type="button" className={resultat} onClick={() => setDossier(d)}>
                      <span className="font-mono text-meta text-green-700 min-w-[60px]">{d.nom}</span>
                      <span className="text-ink">{d.libelle.split(" · ")[1]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-meta uppercase tracking-wider text-ink-3">Étiquettes (facultatif)</span>
        {etiquettes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {etiquettes.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5 rounded bg-info-50 text-info-700 px-2 py-0.5">
                <span className="font-mono text-meta font-medium">{r}</span>
                <button
                  type="button"
                  className="text-meta hover:text-ink"
                  aria-label={`Retirer l'étiquette ${r}`}
                  onClick={() => setEtiquettes((e) => e.filter((x) => x !== r))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <label htmlFor="ailleurs-copro" className="sr-only">
          Ajouter une étiquette de copropriété
        </label>
        <input
          id="ailleurs-copro"
          type="search"
          value={rechCopro}
          onChange={(e) => setRechCopro(e.target.value)}
          placeholder="Ajouter une copropriété : code, nom, adresse"
          autoComplete="off"
          className={champ}
        />
        {coprosTrouvees.length > 0 && (
          <ul className="rounded-lg border border-line divide-y divide-line bg-surface">
            {coprosTrouvees.map((c) => (
              <li key={c.reference}>
                <button
                  type="button"
                  className={resultat}
                  onClick={() => {
                    setEtiquettes((e) => [...e, c.reference]);
                    setRechCopro("");
                  }}
                >
                  <span className="font-mono text-meta text-green-700 min-w-[52px]">{c.reference}</span>
                  <span className="text-ink">{c.nom}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Button
          variant="primary"
          loading={enCours}
          disabled={!dossier || enCours}
          onClick={() => dossier && ranger({ type: "dossier", cle: dossier.cle, copros: etiquettes })}
        >
          {dossier
            ? `Ranger dans ${dossier.nom} ${etiquettes.length ? `avec ${etiquettes.length} étiquette${etiquettes.length > 1 ? "s" : ""}` : "sans étiquette"}`
            : "Choisir un dossier"}
        </Button>
      </div>
    </div>
  );
}

const taille = (o: number) => (o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1)} Mo`);

/** Les pieces jointes du mail, chargees a l'ouverture ; un clic ouvre l'apercu (PDF, image). */
function PiecesJointes({ internetMessageId }: { internetMessageId: string }) {
  const [pieces, setPieces] = useState<PieceJointeRef[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [apercu, setApercu] = useState<ApercuPj | null>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    listerPiecesJointesTriAction({ internetMessageId }).then((r) => {
      if (!actif) return;
      if (r.ok) setPieces(r.donnees ?? []);
      else setErreur(r.erreur);
    });
    return () => {
      actif = false;
    };
  }, [internetMessageId]);

  // L'URL objet du blob est liberee a la fermeture de l'apercu.
  useEffect(() => () => {
    if (apercu) URL.revokeObjectURL(apercu.url);
  }, [apercu]);

  async function ouvrir(pj: PieceJointeRef) {
    setOuverture(pj.id);
    const r = await lirePieceJointeTriAction({ internetMessageId, attachmentId: pj.id });
    setOuverture(null);
    if (!r.ok || !r.donnees) {
      setErreur(r.ok ? "Pièce jointe vide." : r.erreur);
      return;
    }
    const octets = Uint8Array.from(atob(r.donnees.base64), (c) => c.charCodeAt(0));
    // Graph étiquette souvent un PDF en « application/octet-stream » : l'extension prime,
    // sinon ni le blob ni la visionneuse ne l'ouvrent en aperçu (constat du 13/10/2026).
    const type = mimePieceJointe(r.donnees.nom, r.donnees.type);
    setApercu({ nom: r.donnees.nom, type, url: URL.createObjectURL(new Blob([octets], { type })) });
  }

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-meta text-ink-3">
        <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true" />
        Pièces jointes
      </span>
      {erreur && <span className="text-meta text-err-700">{erreur}</span>}
      {pieces === null && !erreur && <span className="text-meta text-ink-3">Chargement…</span>}
      {pieces?.length === 0 && <span className="text-meta text-ink-3">Aucune à afficher ici : voir dans Outlook.</span>}
      {pieces && pieces.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pieces.map((pj) => (
            <button
              key={pj.id}
              type="button"
              disabled={ouverture !== null}
              onClick={() => ouvrir(pj)}
              className="inline-flex items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5 py-1 text-body hover:bg-surface-2 disabled:opacity-60"
            >
              <span className="text-ink truncate max-w-[260px]">{pj.nom}</span>
              <span className="text-meta text-ink-3 tabular-nums">{ouverture === pj.id ? "ouverture…" : taille(pj.taille)}</span>
            </button>
          ))}
        </div>
      )}
      <VisionneusePj apercu={apercu} onFermer={() => setApercu(null)} />
    </div>
  );
}

/** Un mail glisse dans un dossier qui recoit plusieurs copros : on choisit laquelle. */
function PreciserCopro({ entree, candidates }: { entree: EntreeJournalTri; candidates: CoproDeLaFile[] }) {
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 whitespace-normal">
      <Badge ton="warn">Copro à préciser</Badge>
      {candidates.map((c) => (
        <Button
          key={c.reference}
          size="sm"
          variant="ghost"
          disabled={enCours}
          onClick={() =>
            demarrer(async () => {
              const r = await preciserCoproAction({ journalId: entree.id, reference: c.reference });
              if (!r.ok) {
                toast.err(r.erreur);
                return;
              }
              toast.ok(`Étiqueté ${c.reference}.`);
              router.refresh();
            })
          }
        >
          {c.reference}
        </Button>
      ))}
    </span>
  );
}

/** Revue de fin de semaine : chaque rangement, le signal qui l'avait propose, suivi ou non. */
function JournalVue({
  journal,
  copros,
  enCours,
  annuler,
}: {
  journal: EntreeJournalTri[];
  copros: CoproDeLaFile[];
  enCours: boolean;
  annuler: (journalId: string) => void;
}) {
  if (journal.length === 0) return <EmptyState>Aucun mail rangé ces 7 derniers jours.</EmptyState>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-body">
        <thead className="bg-surface-2 text-meta uppercase tracking-wider text-ink-3">
          <tr>
            <th className="text-left font-medium px-3 py-2">Quand</th>
            <th className="text-left font-medium px-3 py-2">Mail</th>
            <th className="text-left font-medium px-3 py-2">Rangé dans</th>
            <th className="text-left font-medium px-3 py-2">Signal</th>
            <th className="text-left font-medium px-3 py-2">Par</th>
            <th className="px-3 py-2">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {journal.map((e) => {
            const suivie = suggestionSuivie(e);
            return (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="px-3 py-2 font-mono text-meta text-ink-2 tabular-nums whitespace-nowrap">{heure(e.faitLe)}</td>
                <td className="px-3 py-2 min-w-[220px]">
                  <span className="text-ink">{e.objet}</span>
                  <span className="block text-meta text-ink-3 font-mono">{e.expediteur}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="font-mono">{e.dossierNom}</span>
                  {e.coproReference && <span className="block text-meta text-ink-3 font-mono">{e.coproReference}</span>}
                  {!e.coproReference && e.dossierCle?.startsWith("binome:") && (
                    <PreciserCopro entree={e} candidates={copros.filter((c) => c.destination?.cle === e.dossierCle)} />
                  )}
                  {e.simulation && (
                    <span className="block mt-1">
                      <Badge ton="warn">Simulé</Badge>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {e.signal ? (
                    <Badge ton={suivie === false ? "err" : suivie ? "ok" : "neutral"}>
                      {LIBELLE_SIGNAL[e.signal]}
                      {suivie === false ? " · corrigé" : suivie ? " · suivi" : ""}
                    </Badge>
                  ) : (
                    <span className="text-ink-3">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-meta text-ink-2">{e.par === PAR_OUTLOOK ? "Glissé dans Outlook" : e.par === PAR_AUTOMATIQUE ? "Rangé automatiquement" : e.par}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" disabled={enCours} onClick={() => annuler(e.id)}>
                    Annuler
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Les binomes : un gestionnaire, son assistant principal, ses autres assistants et leurs copros. */
function BinomesVue({ lignes, collaborateurs }: { lignes: LigneBinome[]; collaborateurs: Collaborateur[] }) {
  if (lignes.length === 0) return <EmptyState>Aucun gestionnaire à afficher.</EmptyState>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-ink-2 max-w-[75ch]">
        Le gestionnaire de chaque copropriété vient d&apos;ESTALE ou de la fiche copro de l&apos;intranet ; les assistants se tiennent ici. L&apos;assistant
        principal reçoit les mails de toutes les copropriétés du gestionnaire, sauf celles confiées à un autre
        assistant. Changer d&apos;assistant ne déplace aucun mail : le dossier est renommé au prochain rangement.
      </p>
      <ul className="flex flex-col gap-2.5">
        {lignes.map((l) => (
          <LigneBinomeVue key={l.gestionnaire.email} ligne={l} collaborateurs={collaborateurs} />
        ))}
      </ul>
    </div>
  );
}

const ROLES: Record<string, string> = {
  ASSISTANT: "Assistant",
  GESTIONNAIRE: "Gestionnaire",
  DIRECTEUR_SYNDIC: "Directeur syndic",
  DIRECTEUR_AGENCE: "Directeur d'agence",
  COMPTABLE: "Comptable",
  ADMIN: "Administrateur",
};
const libelleRole = (role: string) => ROLES[role.toUpperCase()] ?? "Autre";

/** Barre de recherche d'un collaborateur (nom, initiales, e-mail). */
function ChoixCollaborateur({
  id,
  collaborateurs,
  exclure,
  desactive,
  choisir,
  fermer,
}: {
  id: string;
  collaborateurs: Collaborateur[];
  exclure: string[];
  desactive: boolean;
  choisir: (email: string) => void;
  fermer: () => void;
}) {
  const [recherche, setRecherche] = useState("");
  const resultats = useMemo(() => {
    const q = normaliser(recherche.trim());
    if (!q) return [];
    return collaborateurs
      .filter((c) => !exclure.includes(c.email))
      .filter((c) => normaliser(`${c.nomComplet} ${c.email} ${c.initiales}`).includes(q))
      .slice(0, 6);
  }, [collaborateurs, recherche, exclure]);
  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[360px]">
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Chercher un collaborateur
        </label>
        <input
          id={id}
          type="search"
          autoFocus
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom, initiales ou e-mail"
          autoComplete="off"
          className="w-full rounded-lg border border-line bg-canvas px-3 py-1.5 text-body focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        />
        <Button size="sm" variant="ghost" onClick={fermer}>
          Fermer
        </Button>
      </div>
      {resultats.length > 0 && (
        <ul className="rounded-lg border border-line divide-y divide-line bg-surface">
          {resultats.map((c) => (
            <li key={c.email}>
              <button
                type="button"
                disabled={desactive}
                onClick={() => choisir(c.email)}
                className="w-full flex gap-3 px-3 py-1.5 text-left hover:bg-surface-2"
              >
                <span className="font-mono text-meta text-green-700 min-w-[40px]">{c.initiales}</span>
                <span className="text-ink">{c.nomComplet}</span>
                {c.role && <span className="ml-auto text-meta text-ink-3">{libelleRole(c.role)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LigneBinomeVue({ ligne, collaborateurs }: { ligne: LigneBinome; collaborateurs: Collaborateur[] }) {
  const [edition, setEdition] = useState<"principal" | "autre" | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const emailG = ligne.gestionnaire.email.toLowerCase();
  const dejaPris = [emailG, ...(ligne.principal ? [ligne.principal.assistant.email] : []), ...ligne.autres.map((x) => x.assistant.email)];

  function agir(action: () => Promise<{ ok: boolean; erreur?: string }>, succes: string) {
    demarrer(async () => {
      const r = await action();
      if (!r.ok) {
        toast.err(r.erreur ?? "Échec.");
        return;
      }
      setEdition(null);
      toast.ok(succes);
      router.refresh();
    });
  }

  const estale = ligne.assistantEstale;
  const plusieurs = ligne.autres.length > 0;
  const options = [
    { value: "principal", label: ligne.principal?.nomDossier ?? ligne.nomDossierSeul ?? "Principal" },
    ...ligne.autres.map((x) => ({ value: x.id, label: x.nomDossier ?? x.assistant.nomComplet })),
  ];

  return (
    <li className="rounded-xl border border-line bg-surface px-4 py-3 grid gap-3 lg:grid-cols-[minmax(180px,1fr)_2fr]">
      <div className="min-w-0">
        <span className="text-ink font-medium">{ligne.gestionnaire.nomComplet}</span>
        <span className="block text-meta text-ink-3 font-mono truncate">{ligne.gestionnaire.email}</span>
        <span className="block text-meta text-ink-3 mt-1">
          {ligne.copros.length === 0
            ? "Pas encore de copropriété dans la boîte"
            : `${ligne.copros.length} copropriété${ligne.copros.length > 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-meta uppercase tracking-wider text-ink-3 w-[150px]">Assistant principal</span>
          {edition === "principal" ? (
            <ChoixCollaborateur
              id={`principal-${emailG}`}
              collaborateurs={collaborateurs}
              exclure={[emailG]}
              desactive={enCours}
              fermer={() => setEdition(null)}
              choisir={(email) => agir(() => definirPrincipalAction({ gestionnaire: emailG, assistant: email }), "Assistant principal enregistré.")}
            />
          ) : (
            <>
              {ligne.principal ? (
                <span className="text-ink">{ligne.principal.assistant.nomComplet}</span>
              ) : (
                <Badge ton="neutral">Aucun</Badge>
              )}
              <span className="font-mono text-meta text-ink-2">{ligne.principal?.nomDossier ?? ligne.nomDossierSeul ?? ""}</span>
              <Button size="sm" variant="secondary" disabled={enCours} onClick={() => setEdition("principal")}>
                {ligne.principal ? "Changer" : "Choisir"}
              </Button>
              {ligne.principal && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={enCours}
                  onClick={() => agir(() => retirerAssistantAction({ binomeId: ligne.principal!.id }), "Assistant principal retiré.")}
                >
                  Retirer
                </Button>
              )}
              {!ligne.principal && estale && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={enCours}
                  onClick={() => agir(() => definirPrincipalAction({ gestionnaire: emailG, assistant: estale.email }), "Assistant principal enregistré.")}
                >
                  Prendre {estale.nomComplet} (fiche copro)
                </Button>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-meta uppercase tracking-wider text-ink-3 w-[150px]">Autres assistants</span>
          {ligne.autres.map((x) => (
            <span key={x.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas pl-2.5 pr-1 py-0.5">
              <span className="text-ink">{x.assistant.nomComplet}</span>
              <span className="font-mono text-meta text-ink-2">{x.nomDossier}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={enCours}
                onClick={() => agir(() => retirerAssistantAction({ binomeId: x.id }), "Assistant retiré : ses copropriétés reviennent au principal.")}
              >
                Retirer
              </Button>
            </span>
          ))}
          {edition === "autre" ? (
            <ChoixCollaborateur
              id={`autre-${emailG}`}
              collaborateurs={collaborateurs}
              exclure={dejaPris}
              desactive={enCours}
              fermer={() => setEdition(null)}
              choisir={(email) => agir(() => ajouterAssistantAction({ gestionnaire: emailG, assistant: email }), "Assistant ajouté.")}
            />
          ) : (
            <Button size="sm" variant="ghost" disabled={enCours || !ligne.principal} onClick={() => setEdition("autre")}>
              {ligne.principal ? "Ajouter" : "Choisir d'abord le principal"}
            </Button>
          )}
        </div>

        {plusieurs && ligne.copros.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-meta uppercase tracking-wider text-ink-3">Qui s&apos;occupe de quelle copropriété</span>
            <ul className="flex flex-col gap-1.5">
              {ligne.copros.map((c) => (
                <li key={c.reference} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-meta text-green-700 min-w-[52px]">{c.reference}</span>
                  <span className="text-ink min-w-[140px]">{c.nom}</span>
                  <SegmentedControl
                    size="sm"
                    label={`Assistant de ${c.reference}`}
                    options={options}
                    value={c.binomeId ?? "principal"}
                    disabled={enCours}
                    onChange={(v) => {
                      const binomeId = !v || v === "principal" ? null : v;
                      agir(() => affecterCoproAction({ reference: c.reference, binomeId }), `${c.reference} affectée.`);
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}

function Case({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-canvas px-3 py-2.5 flex flex-col gap-0.5">
      <span className="text-meta uppercase tracking-wider text-ink-3">{titre}</span>
      {children}
    </div>
  );
}

/** « copro inactive » à côté d'une copro au mandat terminé : reconnue, jamais proposée comme sûre. */
function MentionInactive({ copro }: { copro: CoproDeLaFile | undefined }) {
  if (!copro?.inactive) return null;
  return (
    <Badge ton="outline" className="ml-1.5 align-middle">
      copro inactive
    </Badge>
  );
}
