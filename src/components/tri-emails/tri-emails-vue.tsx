"use client";

// Ecran du tri des e-mails V2 (ADR-046) : la file a gauche, le mail et son rattachement
// a droite ; un onglet journal pour la revue de fin de semaine. Increment 2 : on range
// d'un clic (dossier du binome, Comptabilité, Divers) et on peut annuler. Sans
// MAIL_TRI_ECRITURE=on, tout rangement est simule (le mail ne bouge pas).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Paperclip } from "lucide-react";
import type { CoproDeLaFile, FileATrier, MailDeLaFile } from "@/lib/services/tri-emails/lire-file";
import type { Collaborateur } from "@/lib/services/tri-emails/binomes";
import {
  suggestionSuivie,
  type CibleTri,
  type EntreeJournalTri,
  type LigneBinome,
  type NatureSuggestion,
} from "@/lib/domain/tri-emails";
import {
  affecterCoproAction,
  ajouterAssistantAction,
  annulerRangementAction,
  definirPrincipalAction,
  rangerMailAction,
  retirerAssistantAction,
} from "@/app/tri-emails/actions";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented";
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
  "hors-estale": "Hors ESTALE",
  aucune: "Pas de suggestion",
};

const LIBELLE_SIGNAL: Record<NatureSuggestion, string> = {
  sure: "suggestion sûre",
  faible: "indice faible",
  plusieurs: "plusieurs copros",
  "hors-estale": "hors ESTALE",
  aucune: "aucune piste",
};

function pastille(m: MailDeLaFile): string {
  const s = m.suggestion;
  if (s.nature === "sure" || s.nature === "faible") return s.candidats[0]!;
  if (s.nature === "plusieurs") return `${s.candidats.length} copros possibles`;
  if (s.nature === "hors-estale") return "Hors ESTALE";
  return "Aucune piste";
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

  function ranger(mail: MailDeLaFile, cible: CibleTri) {
    demarrer(async () => {
      const r = await rangerMailAction({
        messageId: mail.id,
        internetMessageId: mail.internetMessageId,
        expediteur: mail.deAdresse,
        objet: mail.objet,
        cible,
        suggestion: { nature: mail.suggestion.nature, candidats: mail.suggestion.candidats },
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
          <FileVue copros={file.copros} mails={mails} enCours={enCours} ranger={ranger} />
        </TabPanel>
      )}
      {onglet === "journal" && (
        <TabPanel id="tri-p-journal" tabId="tri-t-journal">
          <JournalVue journal={file.journal} enCours={enCours} annuler={(id) => annuler(id)} />
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
  mails,
  enCours,
  ranger,
}: {
  copros: CoproDeLaFile[];
  mails: MailDeLaFile[];
  enCours: boolean;
  ranger: (mail: MailDeLaFile, cible: CibleTri) => void;
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

  // Le mail affiche : celui choisi s'il est encore dans la file, sinon le premier.
  const courant = mails.find((m) => m.id === courantId) ?? mails[0] ?? null;

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
            <li key={m.id} className="border-b border-line last:border-b-0">
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
                <span className="col-span-2 mt-1">
                  <Badge ton={TON[m.suggestion.nature]}>{pastille(m)}</Badge>
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
          parRef={parRef}
          choisie={choix[courant.id] ?? (courant.suggestion.candidats.length === 1 ? courant.suggestion.candidats[0]! : null)}
          choisir={(ref) => setChoix((c) => ({ ...c, [courant.id]: ref }))}
          enCours={enCours}
          ranger={(cible) => ranger(courant, cible)}
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
  parRef,
  choisie,
  choisir,
  enCours,
  ranger,
}: {
  mail: MailDeLaFile;
  copros: CoproDeLaFile[];
  parRef: Map<string, CoproDeLaFile>;
  choisie: string | null;
  choisir: (ref: string) => void;
  enCours: boolean;
  ranger: (cible: CibleTri) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const s = mail.suggestion;
  const copro = choisie ? parRef.get(choisie) ?? null : null;
  const dest = copro?.destination ?? null;

  const resultats = useMemo(() => {
    const q = normaliser(recherche.trim());
    if (!q) return [];
    return copros.filter((c) => normaliser(`${c.reference} ${c.nom} ${c.adresse}`).includes(q)).slice(0, 8);
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
        <p className="mt-3 pt-3 border-t border-line whitespace-pre-line text-ink-2 max-w-[68ch]">{mail.apercu}</p>
        {mail.aPiecesJointes && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-meta text-ink-3">
            <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5" aria-hidden="true" />
            Pièces jointes : à ouvrir dans Outlook
          </p>
        )}
      </section>

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
                </button>
              ))}
            </div>
          )}
        </div>

        {s.nature !== "hors-estale" && (
          <div>
            <label htmlFor="tri-recherche" className="sr-only">
              Chercher une copropriété ESTALE
            </label>
            <input
              id="tri-recherche"
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher une copropriété ESTALE : code, nom, adresse"
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
                      <span className="ml-auto text-meta text-ink-3 truncate">{c.adresse}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
                <span className="text-ink-2">Pas de gestionnaire au mandat dans ESTALE</span>
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
        </div>
      </section>
    </div>
  );
}

/** Revue de fin de semaine : chaque rangement, le signal qui l'avait propose, suivi ou non. */
function JournalVue({
  journal,
  enCours,
  annuler,
}: {
  journal: EntreeJournalTri[];
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
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-meta text-ink-2">{e.par}</td>
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
        ESTALE donne le gestionnaire de chaque copropriété ; les assistants se tiennent ici. L&apos;assistant
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
            ? "Pas encore de copropriété ESTALE"
            : `${ligne.copros.length} copropriété${ligne.copros.length > 1 ? "s" : ""} ESTALE`}
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
                  Prendre {estale.nomComplet} (ESTALE)
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
