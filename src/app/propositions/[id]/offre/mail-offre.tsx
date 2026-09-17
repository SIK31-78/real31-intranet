"use client";

// Le mail de l'offre : a relire, retoucher, puis ENVOYER depuis l'intranet (contrat PDF
// en piece jointe, depuis la boite du gestionnaire). Le bouton « copier » reste pour qui
// prefere finir dans Outlook ; « offre remise sans envoi » date une remise faite ailleurs.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Send } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatJour } from "@/lib/services/facturation/format";
import { envoyerOffreAction, marquerOffreRemiseAction } from "@/app/propositions/actions";

type Options = { dateAgISO?: string; debutISO?: string; dureeMois?: number };

export function MailOffre({
  texte,
  propositionId,
  options,
  contactEmail,
  contratPret,
  dejaRemiseISO,
}: {
  texte: string;
  propositionId: string;
  options: Options;
  contactEmail?: string;
  /** Le contrat se remplit : sans lui, rien ne part. */
  contratPret: boolean;
  dejaRemiseISO?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [valeur, setValeur] = useState(texte);
  const [copie, setCopie] = useState(false);
  const [pending, demarrer] = useTransition();

  async function copier() {
    try {
      await navigator.clipboard.writeText(valeur);
      setCopie(true);
      toast.ok("Mail copié : collez-le dans Outlook.");
      setTimeout(() => setCopie(false), 2000);
    } catch {
      toast.err("Copie impossible : sélectionnez le texte à la main.");
    }
  }

  const envoyer = () =>
    demarrer(async () => {
      const res = await envoyerOffreAction({ id: propositionId, ...options, texteMail: valeur });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Offre envoyée à ${res.donnees?.a ?? contactEmail} avec ${res.donnees?.pieceJointe ?? "le contrat"}.`);
      router.push(`/propositions/${propositionId}`);
    });

  const peutEnvoyer = contratPret && !!contactEmail && !pending;
  const pourquoiPas = !contactEmail ? "Le contact n'a pas d'adresse e-mail." : !contratPret ? "Le contrat ne se remplit pas encore." : null;

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <Textarea value={valeur} onChange={(e) => setValeur(e.target.value)} rows={26} className="font-mono text-meta leading-relaxed" spellCheck={false} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-meta text-ink-3">
            {pourquoiPas ?? (
              <>
                Part de votre boîte à <span className="text-ink">{contactEmail}</span>, vous en copie, avec le contrat en PDF.
                {dejaRemiseISO ? ` Déjà remise le ${formatJour(dejaRemiseISO)}.` : ""}
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={copier} disabled={pending}>
              {copie ? <Check strokeWidth={1.5} /> : <Copy strokeWidth={1.5} />} Copier
            </Button>
            <Button type="button" variant="primary" onClick={envoyer} disabled={!peutEnvoyer}>
              {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Send strokeWidth={1.5} />} Envoyer l&apos;offre
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function MarquerOffreRemise({
  propositionId,
  options,
  disabled,
  dejaRemiseISO,
}: {
  propositionId: string;
  options: Options;
  disabled: boolean;
  dejaRemiseISO?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={disabled || pending}
        onClick={() =>
          demarrer(async () => {
            const res = await marquerOffreRemiseAction({ id: propositionId, ...options });
            if (!res.ok) return toast.err(res.erreur);
            toast.ok("Offre marquée comme remise.");
            router.push(`/propositions/${propositionId}`);
          })
        }
      >
        {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Check strokeWidth={1.5} />} Remise sans envoi
      </Button>
      <p className="text-meta text-ink-3">
        {dejaRemiseISO ? `Déjà remise le ${formatJour(dejaRemiseISO)} — recliquer trace une nouvelle remise.` : "Si l'offre est partie autrement (en main propre, depuis Outlook) : date la remise et note le cycle."}
      </p>
    </div>
  );
}
