"use client";

// Le mail de l'offre : a relire, retoucher, copier dans Outlook. Et le bouton qui acte
// que l'offre est partie.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Send } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatJour } from "@/lib/services/facturation/format";
import { marquerOffreRemiseAction } from "@/app/propositions/actions";

export function MailOffre({ texte }: { texte: string }) {
  const toast = useToast();
  const [valeur, setValeur] = useState(texte);
  const [copie, setCopie] = useState(false);

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

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <Textarea value={valeur} onChange={(e) => setValeur(e.target.value)} rows={26} className="font-mono text-meta leading-relaxed" spellCheck={false} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-meta text-ink-3">Le texte se retouche ici avant copie ; il n&apos;est pas enregistré.</p>
          <Button type="button" variant="secondary" onClick={copier}>
            {copie ? <Check strokeWidth={1.5} /> : <Copy strokeWidth={1.5} />} Copier le mail
          </Button>
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
  options: { dateAgISO?: string; debutISO?: string; dureeMois?: number };
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
        {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Send strokeWidth={1.5} />} Offre envoyée
      </Button>
      <p className="text-meta text-ink-3">{dejaRemiseISO ? `Déjà remise le ${formatJour(dejaRemiseISO)} — recliquer trace un nouvel envoi.` : "Date la remise et note le cycle proposé dans le journal."}</p>
    </div>
  );
}
