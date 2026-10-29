"use client";

// Boîte d'équipe de l'écran E-mails (ADR-053, décisions de Sekou du 29/10/2026, n° 5, 6 et 9) :
// - « Je prends » (un clic) et « Attribuer à… » (petite flèche à côté : le menu des personnes
//   possibles, avec une note facultative) ; la pastille d'initiales sur la ligne du mail ;
// - le bandeau jaune des notes internes, « Interne, jamais envoyé », seulement s'il y a des notes ;
// - le menu « En attente » (De côté, Demain, Dans 3 jours, Dans une semaine, Date…), qui sert
//   aussi à « Relancer si pas de réponse » sur un mail envoyé (sans « De côté »).
// Règle d'or : jamais un clic de plus sur les parcours fréquents. Le geste simple reste un clic ;
// ce qui est facultatif (la note, le choix d'une personne) est derrière la petite flèche.
// Dans la barre d'actions, ce sont de petites icônes avec info-bulle (Sekou, 29/10/2026 : neuf
// boutons sur deux lignes, « on comprend rien ») : une seule ligne de boutons à 1280 px.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BellRing, CalendarClock, Check, ChevronDown, ExternalLink, Hand, StickyNote, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { jourParis, libelleRetour, NOTE_LONGUEUR_MAX, type ChoixAttente, type MembreEquipe, type NoteInterne, type RelanceAffichee } from "@/lib/domain/boite-equipe";
import {
  ajouterNoteAction,
  attribuerMailAction,
  attributairesAction,
  modifierNoteAction,
  notesDuMailAction,
  prendreMailAction,
  relancerSiPasDeReponseAction,
  reprendreMailAction,
  retirerAttributionAction,
  supprimerNoteAction,
} from "@/app/mes-emails/actions-equipe";

const memeAdresse = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Un panneau qui s'ouvre sous son bouton ; se ferme au clic dehors et sur Échap. */
export function Deroulant({ ouvert, onFermer, children, largeur = "w-72" }: { ouvert: boolean; onFermer: () => void; children: ReactNode; largeur?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onFermer();
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer();
    };
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert, onFermer]);
  if (!ouvert) return null;
  return (
    <div ref={ref} className={`absolute right-0 top-full mt-1 z-30 ${largeur} rounded-lg border border-line bg-surface shadow-2 py-1 text-left`}>
      {children}
    </div>
  );
}

/** Une entrée de menu (bouton plein largeur). */
function Entree({ onClick, disabled, children, title }: { onClick: () => void; disabled?: boolean; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-body text-ink hover:bg-surface-2 disabled:opacity-50 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}

/** La petite flèche collée à une icône de la barre : le menu du geste (attribuer à…, note). */
export function FlecheMenu({ label, title, ouvert, onClick, disabled }: { label: string; title: string; ouvert: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      aria-expanded={ouvert}
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-4 inline-flex items-center justify-center rounded-sm text-ink-3 hover:text-ink hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 disabled:opacity-50"
    >
      <ChevronDown strokeWidth={1.75} className="w-3 h-3" />
    </button>
  );
}

/** Les initiales de la personne à qui le mail est attribué ; en vert quand c'est moi. */
export function PastilleAttributaire({ membre, moi, taille = "sm" }: { membre: MembreEquipe; moi: string; taille?: "sm" | "md" }) {
  const amoi = memeAdresse(membre.email, moi);
  return (
    <span
      title={amoi ? "Attribué à moi" : `Attribué à ${membre.nomComplet}`}
      aria-label={amoi ? "Attribué à moi" : `Attribué à ${membre.nomComplet}`}
      className={
        "inline-flex items-center justify-center rounded-full border font-semibold tabular-nums shrink-0 " +
        (taille === "md" ? "h-6 min-w-6 px-1.5 text-meta " : "h-[18px] min-w-[18px] px-1 text-meta leading-none ") +
        (amoi ? "bg-green-50 text-green-700 border-green-500/40" : "bg-surface-2 text-ink-2 border-line")
      }
    >
      {membre.initiales || membre.email.slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * L'icône « Je prends » + la petite flèche « Attribuer à… ». Un clic sur l'icône suffit (le mail
 * est à moi) ; la flèche ouvre la liste des personnes possibles (binôme, ou comptables en
 * Comptabilité), une note facultative et « Retirer l'attribution ». Mail déjà attribué :
 * l'icône montre les initiales ; un clic le prend s'il est à un autre, ouvre le menu (changer,
 * retirer) s'il est à moi. La note ne coûte rien quand on l'ignore : le champ est dans le menu.
 */
export function BoutonsAttribution({
  emailId,
  boite,
  attributaire,
  moi,
  notesPossibles,
  onAttribue,
  onNoteAjoutee,
}: {
  emailId: string;
  boite: string;
  attributaire: MembreEquipe | null;
  /** Moi, tel que la pastille l'affiche (pour « Je prends » sans attendre le serveur). */
  moi: MembreEquipe;
  /** Notes refusées en incarnation : le champ est masqué. */
  notesPossibles: boolean;
  onAttribue: (m: MembreEquipe | null) => void;
  onNoteAjoutee: () => void;
}) {
  const toast = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [possibles, setPossibles] = useState<MembreEquipe[] | null>(null);
  const [note, setNote] = useState("");
  const [enCours, setEnCours] = useState(false);
  const amoi = attributaire !== null && memeAdresse(attributaire.email, moi.email);

  async function prendre() {
    const avant = attributaire;
    onAttribue(moi);
    const r = await prendreMailAction(emailId, boite);
    if (!r.ok) {
      onAttribue(avant);
      toast.err(r.erreur);
    }
  }

  function ouvrir() {
    setOuvert((o) => !o);
    if (possibles === null) {
      void attributairesAction(emailId, boite).then((r) => {
        if (r.ok) setPossibles(r.donnees ?? []);
        else {
          setPossibles([]);
          toast.err(r.erreur);
        }
      });
    }
  }

  async function attribuer(cible: MembreEquipe) {
    setEnCours(true);
    try {
      // La note d'abord : elle se lit avec le mail, quel que soit l'attributaire.
      if (note.trim()) {
        const n = await ajouterNoteAction(emailId, boite, note);
        if (!n.ok) return void toast.err(n.erreur);
        onNoteAjoutee();
        setNote("");
      }
      const r = await attribuerMailAction(emailId, boite, cible.email);
      if (!r.ok) return void toast.err(r.erreur);
      onAttribue(r.donnees ?? cible);
      toast.ok(memeAdresse(cible.email, moi.email) ? "Le mail est à vous." : `Attribué à ${cible.nomComplet}.`);
      setOuvert(false);
    } finally {
      setEnCours(false);
    }
  }

  async function retirer() {
    setEnCours(true);
    try {
      const r = await retirerAttributionAction(emailId, boite);
      if (!r.ok) return void toast.err(r.erreur);
      onAttribue(null);
      setOuvert(false);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="relative inline-flex items-center">
      {attributaire ? (
        // Déjà attribué : les initiales à la place de la main.
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          onClick={() => (amoi ? ouvrir() : void prendre())}
          aria-label={amoi ? "À moi : changer ou retirer l'attribution" : `Attribué à ${attributaire.nomComplet} : je prends`}
          title={amoi ? "À moi. Cliquer pour l'attribuer à quelqu'un d'autre ou la retirer" : `Attribué à ${attributaire.nomComplet}. Cliquer : je prends`}
        >
          <span
            aria-hidden="true"
            className={
              "inline-flex items-center justify-center h-[18px] min-w-[18px] px-0.5 rounded-full border text-meta font-semibold leading-none tabular-nums " +
              (amoi ? "bg-green-50 text-green-700 border-green-500/40" : "bg-surface-2 text-ink-2 border-line")
            }
          >
            {attributaire.initiales || attributaire.email.slice(0, 2).toUpperCase()}
          </span>
        </Button>
      ) : (
        <Button size="sm" variant="ghost" iconOnly onClick={() => void prendre()} aria-label="Je prends" title="Je prends : ce mail est à moi (la flèche : attribuer à…)">
          <Hand strokeWidth={1.5} />
        </Button>
      )}
      <FlecheMenu label="Attribuer à…" title="Attribuer à… (avec une note si besoin)" ouvert={ouvert} onClick={ouvrir} />
      <Deroulant ouvert={ouvert} onFermer={() => setOuvert(false)}>
        <p className="px-3 pt-1 pb-1.5 text-meta text-ink-3">Attribuer à…</p>
        {possibles === null ? (
          <p className="px-3 py-1.5 text-meta text-ink-3">Chargement…</p>
        ) : possibles.length === 0 ? (
          <p className="px-3 py-1.5 text-meta text-ink-3">Personne d&apos;autre dans l&apos;équipe de ce mail.</p>
        ) : (
          possibles.map((p) => (
            <Entree key={p.email} onClick={() => void attribuer(p)} disabled={enCours || memeAdresse(p.email, attributaire?.email)}>
              <PastilleAttributaire membre={p} moi={moi.email} />
              <span className="flex-1 min-w-0 truncate">{p.nomComplet}</span>
              {memeAdresse(p.email, attributaire?.email) ? <Check strokeWidth={2} className="w-3.5 h-3.5 text-green-700" /> : null}
            </Entree>
          ))
        )}
        {notesPossibles ? (
          <div className="px-3 pt-2 pb-1 border-t border-line mt-1">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={NOTE_LONGUEUR_MAX}
              rows={2}
              placeholder="Note interne pour l'équipe (facultatif)"
              aria-label="Note interne jointe à l'attribution (facultatif)"
            />
          </div>
        ) : null}
        {attributaire ? (
          <div className="border-t border-line mt-1 pt-1">
            <Entree onClick={() => void retirer()} disabled={enCours}>
              <UserMinus strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" />
              Retirer l&apos;attribution
            </Entree>
          </div>
        ) : null}
      </Deroulant>
    </div>
  );
}

/** Demain, à Paris (AAAA-MM-JJ) : le premier jour qu'on peut choisir. */
function demain(): string {
  return jourParis(new Date(Date.now() + 86_400_000));
}

/**
 * Le menu « En attente » : De côté (sans date, mail reçu seulement), Demain, Dans 3 jours, Dans
 * une semaine, Date… Le même menu sert à « Relancer si pas de réponse » sur un envoi.
 */
export function MenuAttente({
  libelle,
  titre,
  deCote,
  onChoisir,
  taille = "md",
  icone = false,
}: {
  libelle: string;
  titre: string;
  /** Proposer « De côté » (mail reçu) ; jamais pour une relance. */
  deCote: boolean;
  onChoisir: (choix: ChoixAttente) => Promise<boolean>;
  taille?: "sm" | "md";
  /** Petite icône seule (barre d'actions du volet) : le libellé passe en aria-label. */
  icone?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [jour, setJour] = useState("");
  const [enCours, setEnCours] = useState(false);
  async function choisir(c: ChoixAttente) {
    setEnCours(true);
    try {
      if (await onChoisir(c)) {
        setOuvert(false);
        setJour("");
      }
    } finally {
      setEnCours(false);
    }
  }
  return (
    <div className="relative inline-flex">
      {icone ? (
        <Button size="sm" variant="ghost" iconOnly onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-label={libelle} title={titre}>
          <CalendarClock strokeWidth={1.5} />
        </Button>
      ) : (
        <Button size={taille} onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} title={titre}>
          <CalendarClock strokeWidth={1.5} />
          {libelle}
          <ChevronDown strokeWidth={1.75} />
        </Button>
      )}
      <Deroulant ouvert={ouvert} onFermer={() => setOuvert(false)} largeur="w-60">
        {deCote ? (
          <Entree onClick={() => void choisir("de-cote")} disabled={enCours} title="Sans date : il sort du chiffre jusqu'à ce que vous le repreniez">
            De côté
          </Entree>
        ) : null}
        <Entree onClick={() => void choisir("demain")} disabled={enCours}>
          Demain
        </Entree>
        <Entree onClick={() => void choisir("3-jours")} disabled={enCours}>
          Dans 3 jours
        </Entree>
        <Entree onClick={() => void choisir("semaine")} disabled={enCours}>
          Dans une semaine
        </Entree>
        <form
          className="flex items-center gap-1.5 px-3 py-1.5 border-t border-line mt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (jour) void choisir({ jour });
          }}
        >
          <input
            type="date"
            min={demain()}
            value={jour}
            onChange={(e) => setJour(e.target.value)}
            aria-label="Jusqu'au (date)"
            className="flex-1 min-w-0 h-7 rounded border border-line bg-surface px-1.5 text-meta text-ink"
          />
          <Button size="sm" type="submit" disabled={!jour || enCours}>
            OK
          </Button>
        </form>
        <p className="px-3 pt-1 text-meta text-ink-3">Retour le matin, à 8 h.</p>
      </Deroulant>
    </div>
  );
}

/** « jusqu'au jeudi 30 oct. » ou « de côté ». */
export function libelleAttente(a: { deCote: boolean; jusquAu: string | null }): string {
  return a.deCote || !a.jusquAu ? "De côté" : `Jusqu'au ${libelleRetour(a.jusquAu)}`;
}

const dateNote = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Le bandeau jaune des notes internes, entre l'en-tête et le texte du mail (décision 6). Rien
 * tant qu'il n'y a pas de note (sauf quand on vient de demander d'en écrire une). Auteur +
 * date ; modification et suppression par l'auteur. Strictement interne : jamais envoyé, jamais
 * dans Outlook (le libellé le dit).
 */
export function NotesInternes({
  emailId,
  boite,
  nombre,
  moi,
  peutEcrire,
  ajout,
  onFermerAjout,
  onNombre,
}: {
  emailId: string;
  boite: string;
  /** Le nombre de notes connu (liste) : 0 = rien à charger. */
  nombre: number;
  moi: string;
  /** Faux en incarnation : lecture seule. */
  peutEcrire: boolean;
  /** « Note interne » cliqué dans l'en-tête : le champ s'ouvre même sans note. */
  ajout: boolean;
  onFermerAjout: () => void;
  onNombre: (n: number) => void;
}) {
  const toast = useToast();
  const confirmer = useConfirm();
  const [notes, setNotes] = useState<NoteInterne[] | null>(null);
  const [texte, setTexte] = useState("");
  const [enEdition, setEnEdition] = useState<{ id: string; texte: string } | null>(null);
  const [ajoutLocal, setAjoutLocal] = useState(false);
  const [enCours, setEnCours] = useState(false);

  // Chargées une fois par mail (le composant est remonté à chaque mail : key = emailId).
  const aCharger = nombre > 0 && notes === null;
  useEffect(() => {
    if (!aCharger) return;
    let actif = true;
    void notesDuMailAction(emailId, boite).then((r) => {
      if (actif) setNotes(r.ok ? (r.donnees ?? []) : []);
    });
    return () => {
      actif = false;
    };
  }, [aCharger, emailId, boite]);

  const liste = notes ?? [];
  const champOuvert = peutEcrire && (ajout || ajoutLocal);
  if (nombre === 0 && liste.length === 0 && !champOuvert) return null;

  function fermerChamp() {
    setTexte("");
    setAjoutLocal(false);
    onFermerAjout();
  }

  async function ajouter() {
    if (!texte.trim()) return;
    setEnCours(true);
    try {
      const r = await ajouterNoteAction(emailId, boite, texte);
      if (!r.ok) return void toast.err(r.erreur);
      const n = [...liste, r.donnees!];
      setNotes(n);
      onNombre(n.length);
      fermerChamp();
    } finally {
      setEnCours(false);
    }
  }

  async function enregistrer() {
    if (!enEdition || !enEdition.texte.trim()) return;
    setEnCours(true);
    try {
      const r = await modifierNoteAction(emailId, boite, enEdition.id, enEdition.texte);
      if (!r.ok) return void toast.err(r.erreur);
      setNotes(liste.map((x) => (x.id === enEdition.id ? { ...x, texte: enEdition.texte.trim(), modifieLe: new Date().toISOString() } : x)));
      setEnEdition(null);
    } finally {
      setEnCours(false);
    }
  }

  async function supprimer(note: NoteInterne) {
    const ok = await confirmer({ titre: "Supprimer cette note ?", message: "Elle disparaît pour toute l'équipe.", confirmer: "Supprimer", danger: true });
    if (!ok) return;
    const r = await supprimerNoteAction(emailId, boite, note.id);
    if (!r.ok) return void toast.err(r.erreur);
    const n = liste.filter((x) => x.id !== note.id);
    setNotes(n);
    onNombre(n.length);
  }

  return (
    <div className="mx-5 mt-3 rounded-md border border-warn-500/40 bg-warn-50 px-3 py-2" role="note" aria-label="Notes internes">
      <p className="flex items-center gap-1.5 text-meta font-medium text-warn-700">
        <StickyNote strokeWidth={1.75} className="w-3.5 h-3.5" />
        Interne, jamais envoyé
      </p>
      {nombre > 0 && notes === null ? <p className="mt-1 text-meta text-ink-3">Chargement des notes…</p> : null}
      {liste.length > 0 ? (
        <ul className="mt-1.5 flex flex-col gap-2">
          {liste.map((n) => {
            const mienne = memeAdresse(n.auteurEmail, moi);
            return (
              <li key={n.id} className="text-body text-ink">
                <p className="text-meta text-ink-3">
                  <span className="font-medium text-ink-2">{n.auteurNom}</span> · {dateNote(n.creeLe)}
                  {n.modifieLe ? " · modifiée" : ""}
                  {mienne && peutEcrire && enEdition?.id !== n.id ? (
                    <>
                      {" · "}
                      <button type="button" className="underline hover:text-ink" onClick={() => setEnEdition({ id: n.id, texte: n.texte })}>
                        modifier
                      </button>
                      {" · "}
                      <button type="button" className="underline hover:text-err-700" onClick={() => void supprimer(n)}>
                        supprimer
                      </button>
                    </>
                  ) : null}
                </p>
                {enEdition?.id === n.id ? (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <Textarea
                      value={enEdition.texte}
                      onChange={(e) => setEnEdition({ id: n.id, texte: e.target.value })}
                      maxLength={NOTE_LONGUEUR_MAX}
                      rows={2}
                      aria-label="Modifier la note interne"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void enregistrer()} loading={enCours} disabled={!enEdition.texte.trim()}>
                        Enregistrer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEnEdition(null)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{n.texte}</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {champOuvert ? (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <Textarea
            autoFocus
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void ajouter();
            }}
            maxLength={NOTE_LONGUEUR_MAX}
            rows={2}
            placeholder="Pour l'équipe : ce qui a été dit, ce qui reste à faire…"
            aria-label="Nouvelle note interne"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void ajouter()} loading={enCours} disabled={!texte.trim()}>
              Ajouter la note
            </Button>
            <Button size="sm" variant="ghost" onClick={fermerChamp}>
              Annuler
            </Button>
          </div>
        </div>
      ) : peutEcrire && liste.length > 0 ? (
        <button type="button" onClick={() => setAjoutLocal(true)} className="mt-1.5 text-meta text-warn-700 underline hover:text-ink">
          Ajouter une note
        </button>
      ) : null}
    </div>
  );
}

const jourCourt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" });

/**
 * Les relances dues, en tête de « À traiter » (décision 9) : un mail ENVOYÉ resté sans réponse
 * à la date choisie. « C'est réglé » lève la relance ; « Relancer encore » repousse la date ;
 * le mail envoyé s'ouvre dans Outlook pour écrire la relance.
 */
export function RelancesDues({ relances, moi, onLevee }: { relances: RelanceAffichee[]; moi: string; onLevee: (r: RelanceAffichee) => void }) {
  const toast = useToast();
  if (relances.length === 0) return null;

  async function regle(r: RelanceAffichee) {
    const x = await reprendreMailAction(r.internetMessageId, r.boite);
    if (!x.ok) return void toast.err(x.erreur);
    onLevee(r);
  }
  async function encore(r: RelanceAffichee, choix: ChoixAttente): Promise<boolean> {
    if (choix === "de-cote" || !r.conversationId) return false;
    const x = await relancerSiPasDeReponseAction({ emailId: r.internetMessageId, boite: r.boite, conversationId: r.conversationId, envoyeLe: r.envoyeLe, choix });
    if (!x.ok) {
      toast.err(x.erreur);
      return false;
    }
    toast.ok(`Relance repoussée au ${libelleRetour(x.donnees!.jusquAu)}.`);
    onLevee(r);
    return true;
  }

  return (
    <ul className="divide-y divide-line rounded-lg bg-warn-50/40" aria-label="Relances dues">
      {relances.map((r) => (
        <li key={`${r.boite}|${r.internetMessageId}`} className="px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <BellRing strokeWidth={1.75} className="w-3.5 h-3.5 shrink-0 text-warn-700" aria-hidden="true" />
            <span className="text-body text-ink font-medium truncate flex-1">{r.objet}</span>
            {!memeAdresse(r.parEmail, moi) ? <span className="text-meta text-ink-3 shrink-0" title="Relance posée par">{r.parInitiales}</span> : null}
          </div>
          <p className="mt-0.5 pl-5 text-meta text-warn-700">Relance : pas de réponse depuis le {jourCourt(r.envoyeLe)}</p>
          {r.a.length ? <p className="pl-5 text-meta text-ink-3 truncate">À {r.a.join(", ")}</p> : null}
          <div className="mt-1.5 pl-5 flex flex-wrap items-center gap-1.5">
            <Button size="sm" onClick={() => void regle(r)} title="La réponse est arrivée ailleurs, ou la relance n'a plus lieu d'être">
              <Check strokeWidth={1.75} />
              C&apos;est réglé
            </Button>
            {r.conversationId ? (
              <MenuAttente taille="sm" libelle="Plus tard" titre="Relancer plus tard s'il n'y a toujours pas de réponse" deCote={false} onChoisir={(c) => encore(r, c)} />
            ) : null}
            {r.lienOutlook ? (
              <a href={r.lienOutlook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-meta text-info-700 hover:underline">
                Ouvrir dans Outlook
                <ExternalLink strokeWidth={1.5} className="w-3 h-3" />
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
