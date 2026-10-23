"use client";

// « Envoyer un e-mail » depuis l'écran E-mails : le compositeur s'ouvre dans une fenêtre,
// sans quitter la boîte (demande de Sekou du 13/10/2026). Les copropriétés ne se chargent
// qu'à l'ouverture : l'écran de la boîte ne paie pas ce coût à chaque affichage.

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody } from "@/components/ui/modal";
import { Callout } from "@/components/ui/callout";
import { useConfirm } from "@/components/ui/confirm";
import { Compositeur } from "./compositeur";
import { listerCoprosCompositionAction } from "@/app/mes-emails/composer/actions";
import type { CoproChoisissable, ModeleMail } from "@/lib/domain/mes-emails-composition";

export function EnvoyerEmail({
  gestionnaireNom,
  agence,
  brouillonPossible,
  envoiDirect = false,
  boite,
  signatureHtml,
  modeles,
  pilote = false,
}: {
  /** Nouveautés en pilote (super-admin) : texte mis en forme (REA-345). */
  pilote?: boolean;
  gestionnaireNom: string;
  agence: string;
  brouillonPossible: boolean;
  envoiDirect?: boolean;
  boite: string | null;
  signatureHtml: string | null;
  modeles: ModeleMail[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [copros, setCopros] = useState<CoproChoisissable[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Un mail à moitié écrit ne se perd pas d'un clic à côté ni d'Échap ; la croix le fait confirmer.
  const [saisie, setSaisie] = useState(false);
  const confirmer = useConfirm();

  function fermer() {
    setOuvert(false);
    setSaisie(false);
  }
  async function fermerSiConfirme() {
    if (saisie) {
      const ok = await confirmer({
        titre: "Abandonner ce mail ?",
        message: "Les destinataires, l'objet, le message et les pièces jointes saisis seront perdus.",
        confirmer: "Abandonner",
        annuler: "Continuer l'écriture",
        danger: true,
      });
      if (!ok) return;
    }
    fermer();
  }

  function ouvrir() {
    setOuvert(true);
    if (copros !== null) return;
    void listerCoprosCompositionAction().then((r) => {
      if (r.ok) setCopros(r.donnees ?? []);
      else {
        setCopros([]);
        setErreur(r.erreur);
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={ouvrir}>
        <Send strokeWidth={1.5} />
        Envoyer un e-mail
      </Button>
      {ouvert && (
        <Modal titre="Envoyer un e-mail" size="lg" onFermer={() => void fermerSiConfirme()} saisieEnCours={saisie}>
          <ModalBody>
          {copros === null ? (
            <p className="text-body text-ink-3">Chargement des copropriétés…</p>
          ) : (
            <div className="flex flex-col gap-3">
              {erreur && <Callout ton="warn">{erreur}</Callout>}
              <Compositeur
                copros={copros}
                gestionnaireNom={gestionnaireNom}
                agence={agence}
                brouillonPossible={brouillonPossible}
                envoiDirect={envoiDirect}
                boite={boite}
                signatureHtml={signatureHtml}
                modeles={modeles}
                pilote={pilote}
                onTermine={fermer}
                onSaisie={setSaisie}
              />
            </div>
          )}
          </ModalBody>
        </Modal>
      )}
    </>
  );
}
