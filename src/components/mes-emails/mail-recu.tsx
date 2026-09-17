"use client";

import { Mail, Building2, FolderInput, Paperclip, Download } from "lucide-react";
import type { DossierBoite, MailEntrant, PieceJointeRef } from "@/lib/domain/mes-emails";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { formatDateLongue } from "@/lib/format-date";
import { StatutBadge } from "./statut-badge";
import { formatTaille, initiales, type CorpsAffiche, type Statut } from "./mes-emails.utils";

// Haut du volet de detail : le mail entrant tel que recu (expediteur, copro facultative,
// dossier Outlook de classement, corps, pieces jointes).
export function MailRecu({
  m,
  statut,
  coproCode,
  coproNom,
  coprosDispo,
  onRattacherCopro,
  dossiers,
  dossierIdChoisi,
  onChoisirDossier,
  corps,
  piecesJointes,
  onTelecharger,
  onApercu,
}: {
  m: MailEntrant;
  statut: Statut;
  coproCode: string;
  coproNom: string;
  coprosDispo: { code: string; nom: string }[];
  onRattacherCopro: (code: string) => void;
  dossiers: DossierBoite[] | null | "indisponible";
  dossierIdChoisi: string;
  onChoisirDossier: (id: string) => void;
  corps: CorpsAffiche;
  piecesJointes: PieceJointeRef[] | null | "indisponible";
  onTelecharger: (pj: PieceJointeRef) => void;
  onApercu: (pj: PieceJointeRef) => void;
}) {
  return (
    <div className="border-b border-line">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <span className="text-meta font-medium uppercase tracking-[0.06em] text-ink-3 flex items-center gap-1.5">
            <Mail strokeWidth={1.5} className="w-3.5 h-3.5" />
            Mail reçu
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <StatutBadge statut={statut} />
          </div>
        </div>

        <h2 className="text-title font-semibold text-ink leading-snug">{m.objet}</h2>

        <div className="mt-2.5 flex items-start gap-2.5">
          <span className="w-8 h-8 rounded-full bg-surface-3 text-ink-2 text-meta font-medium flex items-center justify-center shrink-0">
            {initiales(m.de)}
          </span>
          <div className="text-body leading-relaxed min-w-0">
            <p className="text-ink">
              <span className="font-medium">{m.de}</span>{" "}
              <span className="text-ink-3">&lt;{m.expediteurEmail}&gt;</span>
            </p>
            <p className="text-ink-3">
              À : {m.destinataires.join(", ")}
              {m.copie.length > 0 && <> · Cc : {m.copie.join(", ")}</>}
            </p>
            <p className="text-ink-3">{formatDateLongue(m.date)}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-body">
                <Building2 strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                <span className={coproCode ? "font-medium text-ink" : "text-ink-3 italic"}>
                  {coproCode ? `${coproNom} (${coproCode})` : "Sans copropriété"}
                </span>
              </span>
              <Select
                value={coproCode}
                onChange={(e) => onRattacherCopro(e.target.value)}
                aria-label="Copropriété (facultatif)"
                largeur="auto" className="max-w-[220px]"
              >
                {/* Copro FACULTATIVE et reversible : l'option vide retire le rattachement. */}
                <option value="">{coproCode ? "- Retirer la copropriété" : "Rattacher à une copropriété…"}</option>
                {coprosDispo.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.nom} ({c.code})
                  </option>
                ))}
              </Select>
              <span className="inline-flex items-center gap-1 text-meta">
                <FolderInput strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                <Select
                  value={dossierIdChoisi}
                  onChange={(e) => onChoisirDossier(e.target.value)}
                  aria-label="Dossier Outlook de classement"
                  largeur="auto" className="max-w-[220px]"
                >
                  <option value="">
                    {dossiers === null ? "Chargement des dossiers…" : dossiers === "indisponible" ? "Dossiers Outlook indisponibles" : "Classer dans…"}
                  </option>
                  {(Array.isArray(dossiers) ? dossiers : []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.niveau > 0 ? `  ${d.nom}` : d.nom}
                    </option>
                  ))}
                </Select>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3 text-body text-ink-2 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-auto">
          {corps.texte}
          {corps.etat === "chargement" && <span className="block mt-2 text-meta text-ink-3">… chargement de la suite</span>}
          {corps.etat === "indisponible" && <span className="block mt-2 text-meta text-warn-700">La suite du mail n&apos;a pas pu être chargée (extrait seulement).</span>}
        </div>
        {m.attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {piecesJointes === null ? (
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-sm border border-line bg-surface text-meta text-ink-3">
                <Paperclip strokeWidth={1.5} className="w-3 h-3" />
                Chargement des pièces jointes…
              </span>
            ) : piecesJointes === "indisponible" ? (
              <span className="text-meta text-warn-700 italic">Pièces jointes indisponibles : Outlook n&apos;a pas répondu</span>
            ) : piecesJointes.length === 0 ? (
              <span className="text-meta text-ink-3 italic">Aucune pièce jointe lisible</span>
            ) : (
              piecesJointes.map((pj) => (
                <span
                  key={pj.id}
                  title={formatTaille(pj.taille)}
                  className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-sm border border-line bg-surface text-meta text-ink-2"
                >
                  <Paperclip strokeWidth={1.5} className="w-3 h-3 text-ink-3 shrink-0" />
                  <Button
                    onClick={() => onApercu(pj)}
                    title="Aperçu"
                    variant="ghost" className="truncate max-w-[200px]"
                  >
                    {pj.nom}
                  </Button>
                  <Button
                    onClick={() => onTelecharger(pj)}
                    title="Télécharger"
                    variant="ghost"
                  >
                    <Download strokeWidth={1.5} className="w-3 h-3" />
                  </Button>
                </span>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
