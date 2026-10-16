"use client";

// « Transférer » un mail de l'écran E-mails à un collègue ou à l'extérieur (REA-350,
// 16/10/2026, en pilote). Les destinataires se cherchent dans le même annuaire que
// « Envoyer un e-mail » ; les pièces jointes d'origine partent avec (createForward de
// Graph), depuis la boîte qui détient le mail.

import { useState } from "react";
import { Forward, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { adresseMailValide, resumeDestinataires } from "@/lib/domain/mes-emails-composition";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { transfererMailAction } from "@/app/mes-emails/actions";
import { ChampPersonnes, LigneExpediteur, adresses, type Personne } from "./compositeur";

export function TransfererMail({
  emailId,
  boite,
  boitePerso,
  objet,
  piecesJointes,
}: {
  emailId: string;
  /** Boîte qui détient le mail : c'est d'elle que part le transfert. */
  boite: string;
  boitePerso: boolean;
  objet: string;
  /** PJ réelles du mail (null = en cours de chargement). */
  piecesJointes: PieceJointeRef[] | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button variant="doux" onClick={() => setOuvert(true)}>
        <Forward strokeWidth={1.75} />
        Transférer
      </Button>
      {ouvert ? (
        <FenetreTransfert
          emailId={emailId}
          boite={boite}
          boitePerso={boitePerso}
          objet={objet}
          piecesJointes={piecesJointes}
          onFermer={() => setOuvert(false)}
        />
      ) : null}
    </>
  );
}

function FenetreTransfert({
  emailId,
  boite,
  boitePerso,
  objet,
  piecesJointes,
  onFermer,
}: {
  emailId: string;
  boite: string;
  boitePerso: boolean;
  objet: string;
  piecesJointes: PieceJointeRef[] | null;
  onFermer: () => void;
}) {
  const toast = useToast();
  const [a, setA] = useState<Personne[]>([]);
  const [cc, setCc] = useState<Personne[]>([]);
  const [corps, setCorps] = useState("");
  const [enCours, setEnCours] = useState(false);

  function deplacer(depuis: string, cle: string) {
    const [source, setSource, setCible] = depuis === "a" ? [a, setA, setCc] : [cc, setCc, setA];
    const p = source.find((x) => x.cle === cle);
    if (!p) return;
    setSource((l) => l.filter((x) => x.cle !== cle));
    setCible((l) => (l.some((x) => x.cle === cle) ? l : [...l, p]));
  }

  const invalides = [...adresses(a), ...adresses(cc)].filter((e) => !adresseMailValide(e));

  async function transferer() {
    if (enCours) return;
    if (invalides.length) {
      toast.err(`Adresse invalide : ${invalides.map((e) => `« ${e} »`).join(", ")}. À retirer ou corriger.`);
      return;
    }
    if (adresses(a).length === 0) {
      toast.err("Ajoute au moins un destinataire en « À ».");
      return;
    }
    setEnCours(true);
    try {
      const r = await transfererMailAction({ emailId, boite, a: adresses(a), cc: adresses(cc), corps });
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      const pour = resumeDestinataires(a.map((p) => p.nom || p.emails[0] || ""));
      toast.ok(
        r.donnees?.envoye
          ? `Mail transféré à ${pour} depuis ${r.donnees.boite}.`
          : `Transfert pour ${pour} créé en brouillon dans ${r.donnees?.boite ?? boite} : à relire puis envoyer dans Outlook.`,
      );
      onFermer();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modal titre="Transférer le mail" size="lg" onFermer={onFermer}>
      <ModalBody>
        <div className="flex flex-col gap-3">
          <LigneExpediteur boite={boite} />
          {!boitePerso ? (
            <p className="text-meta text-ink-3">
              Boîte partagée : tant que l&apos;envoi n&apos;y est pas ouvert, le transfert reste en brouillon dans Outlook, à relire puis envoyer.
            </p>
          ) : null}
          <ChampPersonnes champ="a" label="À" personnes={a} onChange={setA} onDeplacer={deplacer} placeholder="Nom du collègue ou de la personne (ou une adresse)…" />
          <ChampPersonnes champ="cc" label="Cc" personnes={cc} onChange={setCc} onDeplacer={deplacer} placeholder="Nom ou adresse…" />
          <p className="text-body text-ink-2">
            <span className="text-ink-3">Objet : </span>TR: {objet}
          </p>
          <Textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={6} placeholder="Un mot pour accompagner le transfert (facultatif)…" aria-label="Message du transfert" />
          <div className="flex flex-wrap items-center gap-1.5 text-meta text-ink-3">
            <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5" />
            {piecesJointes === null
              ? "Pièces jointes en cours de chargement…"
              : piecesJointes.length === 0
                ? "Aucune pièce jointe."
                : `Jointes d'office : ${piecesJointes.map((pj) => pj.nom).join(", ")}`}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer} disabled={enCours}>
          Annuler
        </Button>
        <Button variant="primary" onClick={() => void transferer()} loading={enCours} disabled={adresses(a).length === 0}>
          <Forward strokeWidth={1.75} />
          {enCours ? "Transfert…" : "Transférer"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
