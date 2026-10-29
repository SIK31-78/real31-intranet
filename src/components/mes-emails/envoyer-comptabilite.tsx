"use client";

// « Comptabilité » (demande de Sekou, 28/10/2026) : à côté de « Pas pour moi », un clic envoie
// le mail de la boîte partagée, rangé chez le binôme, dans le dossier « Comptabilité » de la
// même boîte (syndic2, syndic4…). Le journal du tri garde le geste et la copro du mail ; il
// s'annule depuis l'écran Tri des e-mails, comme tout rangement. Pas d'« Annuler » ici : une
// fois parti, le mail n'est plus distribué au binôme (même règle que « Pas pour moi »).
//
// Note interne (décision 6, 29/10/2026) : le clic sur « Comptabilité » envoie toujours en un
// clic. La petite flèche à côté ouvre la même chose avec un mot pour les comptables (« facture
// déjà payée », « à rapprocher de… ») : la note est écrite AVANT l'envoi (après, le mail n'est
// plus distribué au binôme et la note serait refusée), et suit le mail en Comptabilité.

import { useState, useTransition } from "react";
import { Calculator, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { envoyerEnComptabiliteAction } from "@/app/mes-emails/actions-comptabilite";
import { ajouterNoteAction } from "@/app/mes-emails/actions-equipe";
import { NOTE_LONGUEUR_MAX } from "@/lib/domain/boite-equipe";
import { Deroulant } from "./equipe-mail";

/**
 * `compact` : en petit, en texte, dans la barre d'actions du volet (29/10/2026).
 * `notePossible` : la petite flèche « avec une note » (boîte d'équipe active, hors incarnation).
 */
export function EnvoyerEnComptabilite({
  emailId,
  boite,
  onParti,
  compact = false,
  notePossible = false,
  onNoteAjoutee,
}: {
  emailId: string;
  boite: string;
  onParti: () => void;
  compact?: boolean;
  notePossible?: boolean;
  onNoteAjoutee?: () => void;
}) {
  const toast = useToast();
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [note, setNote] = useState("");

  function envoyer(avecNote = "") {
    demarrer(async () => {
      if (avecNote.trim()) {
        const n = await ajouterNoteAction(emailId, boite, avecNote);
        if (!n.ok) return void toast.err(`Rien n'est parti : ${n.erreur}`);
        onNoteAjoutee?.();
      }
      const r = await envoyerEnComptabiliteAction(emailId, boite);
      if (!r.ok) return void toast.err(r.erreur);
      toast.ok(`Envoyé en Comptabilité (${boite.split("@")[0]})${avecNote.trim() ? ", avec la note" : ""}.`);
      setOuvert(false);
      onParti();
    });
  }

  const bouton = (
    <Button size={compact ? "sm" : "lg"} variant={compact ? "ghost" : "secondary"} onClick={() => envoyer()} disabled={enCours} title="Envoyer ce mail dans le dossier Comptabilité de la boîte partagée">
      <Calculator strokeWidth={1.5} />
      Comptabilité
    </Button>
  );
  if (!notePossible) return bouton;
  return (
    <div className="relative inline-flex items-center">
      {bouton}
      <Button
        size={compact ? "sm" : "lg"}
        variant="ghost"
        iconOnly
        aria-label="Comptabilité, avec une note"
        title="Envoyer en Comptabilité avec une note interne pour les comptables"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        disabled={enCours}
      >
        <ChevronDown strokeWidth={1.75} />
      </Button>
      <Deroulant ouvert={ouvert} onFermer={() => setOuvert(false)}>
        <div className="px-3 py-1.5 flex flex-col gap-2">
          <Textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_LONGUEUR_MAX}
            rows={3}
            placeholder="Note interne pour les comptables (jamais envoyée)"
            aria-label="Note interne pour les comptables"
          />
          <Button size="sm" onClick={() => envoyer(note)} loading={enCours}>
            <Calculator strokeWidth={1.5} />
            Envoyer en Comptabilité
          </Button>
        </div>
      </Deroulant>
    </div>
  );
}
