"use client";

// « Reformuler » (ADR-051, 28/10/2026) : le texte tapé part au modèle, la version propre le
// REMPLACE dans l'éditeur, et « Annuler la reformulation » rend le texte d'avant à l'identique
// (mise en forme comprise) tant que la personne n'a rien retapé. Rien ne part sans « Envoyer ».
//
// La reformulation travaille sur le texte brut : l'écran envoie le texte de l'éditeur (jamais
// la citation du mail d'origine, ajoutée par le serveur à l'envoi) et reçoit des paragraphes,
// posés comme un modèle de mail. La mise en forme (gras, listes) ne survit donc pas : c'est
// voulu, le mail reformulé n'en a pas besoin, et l'annulation la rend.

import { useState } from "react";
import { Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { reformulerAction } from "@/app/mes-emails/actions-reformulation";
import { LONGUEUR_MAX, LONGUEUR_MIN, MESSAGE_ECHEC, type NatureMail } from "@/lib/domain/reformulation";

export function BoutonReformuler<S>({
  texte,
  nature,
  objet,
  desactive = false,
  capturer,
  appliquer,
  restaurer,
}: {
  /** Le texte brut de l'éditeur, tel qu'il partirait (sans citation ni signature). */
  texte: string;
  nature: NatureMail;
  objet?: string;
  /** Envoi en cours : on ne touche plus au texte. */
  desactive?: boolean;
  /** L'état exact de l'éditeur avant la reformulation (texte, HTML), pour l'annulation. */
  capturer: () => S;
  /** Pose le texte reformulé dans l'éditeur. */
  appliquer: (texte: string) => void;
  restaurer: (avant: S) => void;
}) {
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);
  const [annulable, setAnnulable] = useState<{ avant: S; apres: string } | null>(null);

  const longueur = texte.trim().length;
  const tropLong = longueur > LONGUEUR_MAX;
  // L'annulation vaut jusqu'à la prochaine frappe : dès que le texte n'est plus celui posé par
  // la reformulation, elle disparaît.
  const peutAnnuler = annulable !== null && texte === annulable.apres;

  async function reformuler() {
    if (enCours) return;
    const avant = capturer();
    setEnCours(true);
    try {
      const r = await reformulerAction({ texte, nature, ...(objet ? { objet } : {}) });
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      const nouveau = r.donnees?.texte ?? "";
      if (!nouveau || r.donnees?.inchange) {
        toast.info("Le texte était déjà correct, il n'a pas changé.");
        return;
      }
      appliquer(nouveau);
      setAnnulable({ avant, apres: nouveau });
    } catch {
      // Action injoignable (réseau, déploiement en cours) : le texte n'a pas bougé.
      toast.err(MESSAGE_ECHEC);
    } finally {
      setEnCours(false);
    }
  }

  function annuler() {
    if (!annulable) return;
    restaurer(annulable.avant);
    setAnnulable(null);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {peutAnnuler ? (
        <Button type="button" size="sm" variant="ghost" onClick={annuler} disabled={desactive}>
          <Undo2 strokeWidth={1.5} />
          Annuler la reformulation
        </Button>
      ) : null}
      {tropLong ? (
        <span className="text-meta text-ink-3">
          Texte trop long pour être reformulé ({longueur} caractères, {LONGUEUR_MAX} au plus).
        </span>
      ) : null}
      <Button
        type="button"
        size="sm"
        onClick={() => void reformuler()}
        loading={enCours}
        disabled={desactive || enCours || longueur < LONGUEUR_MIN || tropLong}
        title="Corrige et clarifie le texte écrit ; vous relisez avant d'envoyer"
      >
        {enCours ? null : <Sparkles strokeWidth={1.5} />}
        {enCours ? "Reformulation…" : "Reformuler"}
      </Button>
    </span>
  );
}
