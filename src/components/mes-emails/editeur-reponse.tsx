"use client";

import { Sparkles, FilePlus2, Paperclip, Copy, Check, Mail, Send } from "lucide-react";
import type { MailEntrant, PieceJointeRef, Rattachement } from "@/lib/domain/mes-emails";
import { phraseRecommandation, type Destinataires } from "@/lib/domain/mes-emails";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { ChampsDestinataires } from "./champs-destinataires";

const recommandation = phraseRecommandation;

// Bloc « Recommandation de l'assistant » : la phrase, puis soit l'editeur de reponse
// (destinataires, sujet, PJ a re-joindre, texte, signature, Envoyer), soit les boutons
// Répondre / Générer un brouillon quand aucun texte n'est encore ouvert.
export function EditeurReponse({
  m,
  ratt,
  brouillon,
  compose,
  copie,
  onCopier,
  onCreerBrouillon,
  destinataires,
  onMajDestinataires,
  sujet,
  onMajSujet,
  piecesJointes,
  pjJointes,
  onTogglePjJointe,
  onEditBrouillon,
  onBlurBrouillon,
  signatureHtml,
  onEnvoyer,
  envoiEnCours,
  msgBrouillon,
  onRepondre,
  onGenererBrouillon,
}: {
  m: MailEntrant;
  ratt: Rattachement;
  brouillon: string;
  compose: boolean;
  copie: boolean;
  onCopier: () => void;
  onCreerBrouillon: () => void;
  destinataires: Destinataires;
  onMajDestinataires: (champ: keyof Destinataires, v: string[]) => void;
  sujet: string;
  onMajSujet: (v: string) => void;
  piecesJointes: PieceJointeRef[] | null | "indisponible";
  pjJointes: Set<string>;
  onTogglePjJointe: (id: string) => void;
  onEditBrouillon: (t: string) => void;
  onBlurBrouillon: () => void;
  signatureHtml?: string | null;
  onEnvoyer: () => void;
  envoiEnCours: boolean;
  msgBrouillon: string | null;
  onRepondre: () => void;
  onGenererBrouillon: () => void;
}) {
  const genEnCours = (msgBrouillon ?? "").startsWith("Génération");

  return (
    <div className="rounded-lg border border-green-500/25 bg-green-50/60 p-4">
      <p className="text-body font-semibold text-green-700 flex items-center gap-1.5 mb-1.5">
        <Sparkles strokeWidth={1.5} className="w-4 h-4" />
        Recommandation de l’assistant
      </p>
      <p className="text-body text-ink leading-snug">{recommandation(m, ratt)}</p>

      {brouillon || compose ? (
        <>
          <div className="flex items-center justify-between mt-3 mb-1">
            <span className="text-meta text-ink-3">Réponse (modifiable)</span>
            <div className="flex items-center gap-2">
              <Button onClick={onCopier} variant="secondary" size="sm">
                <Copy strokeWidth={1.5} className="w-3.5 h-3.5" />
                {copie ? "Copié" : "Copier"}
              </Button>
              <Button onClick={onCreerBrouillon} variant="secondary" size="sm">
                <FilePlus2 strokeWidth={1.5} className="w-3.5 h-3.5" />
                Brouillon Outlook
              </Button>
            </div>
          </div>
          <ChampsDestinataires valeur={destinataires} onChange={onMajDestinataires} />
          <Input
            value={sujet}
            onChange={(e) => onMajSujet(e.target.value)}
            placeholder="Sujet"
            aria-label="Sujet de la réponse"
            className="mb-2"
          />
          {Array.isArray(piecesJointes) && piecesJointes.length > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-meta text-ink-3">Joindre&nbsp;:</span>
              {piecesJointes.map((pj) => {
                const jointe = pjJointes.has(pj.id);
                return (
                  <button
                    key={pj.id}
                    type="button"
                    onClick={() => onTogglePjJointe(pj.id)}
                    title={jointe ? "Jointe à la réponse" : "Joindre à la réponse"}
                    className={`inline-flex items-center gap-1 h-6 pl-1.5 pr-2 rounded-full border text-meta transition-colors ${jointe ? "border-green-500/40 bg-green-50 text-green-700" : "border-line bg-surface text-ink-3 hover:bg-surface-2"}`}
                  >
                    {jointe ? (
                      <Check strokeWidth={2} className="w-3 h-3 shrink-0" />
                    ) : (
                      <Paperclip strokeWidth={1.5} className="w-3 h-3 shrink-0" />
                    )}
                    <span className="truncate max-w-[160px]">{pj.nom}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <Textarea
            value={brouillon}
            onChange={(e) => onEditBrouillon(e.target.value)}
            onBlur={onBlurBrouillon}
            rows={7}

          />
          {signatureHtml ? (
            <div className="mt-2">
              <span className="text-meta text-ink-3">Signature (ajoutée à l’envoi)</span>
              <iframe
                title="Signature"
                sandbox=""
                srcDoc={signatureHtml}
                className="mt-1 w-full h-[110px] rounded-md border border-line bg-white"
              />
            </div>
          ) : null}
          <div className="mt-2.5 flex items-center gap-3">
            <Button
              onClick={onEnvoyer}
              disabled={envoiEnCours}
              variant="secondary" size="lg"
            >
              <Send strokeWidth={2} className="w-4 h-4" />
              {envoiEnCours ? "Envoi…" : "Envoyer la réponse"}
            </Button>
            {msgBrouillon ? <span className="text-meta text-ink-3">{msgBrouillon}</span> : null}
          </div>
        </>
      ) : (
        // Repondre possible sur N'IMPORTE QUEL mail (meme sans action). Pour les mails
        // a traiter, on propose en plus la generation IA (a la demande = sur clic).
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            onClick={onRepondre}
            variant="secondary"
          >
            <Mail strokeWidth={1.5} className="w-3.5 h-3.5" />
            Répondre
          </Button>
          {m.ticketable ? (
            <Button
              onClick={onGenererBrouillon}
              disabled={genEnCours}
              variant="secondary"
            >
              <Sparkles strokeWidth={1.5} className="w-3.5 h-3.5" />
              {genEnCours ? "Génération…" : "Générer un brouillon (IA)"}
            </Button>
          ) : null}
          {msgBrouillon ? (
            <p className="w-full mt-1 text-meta text-ink-3">{msgBrouillon}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
