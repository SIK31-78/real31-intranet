"use client";

import { Check, RotateCcw } from "lucide-react";
import type {
  ContexteCopro,
  Dossier,
  DossierBoite,
  MailEntrant,
  PieceJointeRef,
  Rattachement,
} from "@/lib/domain/mes-emails";
import type { Destinataires } from "@/lib/domain/mes-emails";
import type { TypeDossier } from "@/lib/domain/dossier";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MailRecu } from "./mail-recu";
import { EditeurReponse } from "./editeur-reponse";
import { RattachementDossier } from "./rattachement-dossier";
import { DetailDossier } from "./detail-dossier";
import type { CorpsAffiche, Statut } from "./mes-emails.utils";

// Volet droit de « Mes e-mails » : le mail recu, la recommandation + reponse, le bouton
// Classer, le rattachement a un dossier de suivi et le detail repliable. Sans etat propre.
export function AnalysePane({
  m,
  contexte,
  ratt,
  dossier,
  dossiersReels,
  typeSuggere,
  statut,
  brouillon,
  coproCode,
  coproNom,
  coprosDispo,
  onRattacherCopro,
  dossiers,
  dossierIdChoisi,
  onChoisirDossier,
  msgClasser,
  changer,
  ouverts,
  copie,
  onEditBrouillon,
  onBlurBrouillon,
  signatureHtml,
  onCreerBrouillon,
  onGenererBrouillon,
  compose,
  onRepondre,
  piecesJointes,
  corps,
  onTelecharger,
  onApercu,
  pjJointes,
  onTogglePjJointe,
  destinataires,
  onMajDestinataires,
  sujet,
  onMajSujet,
  onEnvoyer,
  envoiEnCours,
  msgBrouillon,
  onToggleChanger,
  onRattacherDossier,
  onCreerDossier,
  onCopier,
  onValider,
  onDevalider,
  onToggleSection,
}: {
  m: MailEntrant;
  contexte: ContexteCopro | undefined;
  ratt: Rattachement;
  dossier: Dossier | undefined;
  dossiersReels: { id: string; titre: string; type: TypeDossier }[] | null;
  typeSuggere: TypeDossier;
  statut: Statut;
  brouillon: string;
  coproCode: string;
  coproNom: string;
  coprosDispo: { code: string; nom: string }[];
  onRattacherCopro: (code: string) => void;
  dossiers: DossierBoite[] | null | "indisponible";
  dossierIdChoisi: string;
  onChoisirDossier: (id: string) => void;
  msgClasser: string | null;
  changer: boolean;
  ouverts: Set<string>;
  copie: boolean;
  onEditBrouillon: (t: string) => void;
  onBlurBrouillon: () => void;
  signatureHtml?: string | null;
  onCreerBrouillon: () => void;
  onGenererBrouillon: () => void;
  compose: boolean;
  onRepondre: () => void;
  piecesJointes: PieceJointeRef[] | null | "indisponible";
  corps: CorpsAffiche;
  onTelecharger: (pj: PieceJointeRef) => void;
  onApercu: (pj: PieceJointeRef) => void;
  pjJointes: Set<string>;
  onTogglePjJointe: (id: string) => void;
  destinataires: Destinataires;
  onMajDestinataires: (champ: keyof Destinataires, v: string[]) => void;
  sujet: string;
  onMajSujet: (v: string) => void;
  onEnvoyer: () => void;
  envoiEnCours: boolean;
  msgBrouillon: string | null;
  onToggleChanger: () => void;
  onRattacherDossier: (dossierId: string, titre: string) => void;
  onCreerDossier: (type: TypeDossier, titre: string) => void;
  onCopier: () => void;
  onValider: () => void;
  onDevalider: () => void;
  onToggleSection: (cle: string) => void;
}) {
  const classe = statut === "classe";
  const labelValider = "Classer";

  return (
    <Card className="overflow-hidden">
      {/* === LE MAIL ENTRANT === */}
      <MailRecu
        m={m}
        statut={statut}
        coproCode={coproCode}
        coproNom={coproNom}
        coprosDispo={coprosDispo}
        onRattacherCopro={onRattacherCopro}
        dossiers={dossiers}
        dossierIdChoisi={dossierIdChoisi}
        onChoisirDossier={onChoisirDossier}
        corps={corps}
        piecesJointes={piecesJointes}
        onTelecharger={onTelecharger}
        onApercu={onApercu}
      />

      <div className="px-5 py-4 flex flex-col gap-3">
        {/* Recommandation : phrase + reponse EDITABLE */}
        <EditeurReponse
          m={m}
          ratt={ratt}
          brouillon={brouillon}
          compose={compose}
          copie={copie}
          onCopier={onCopier}
          onCreerBrouillon={onCreerBrouillon}
          destinataires={destinataires}
          onMajDestinataires={onMajDestinataires}
          sujet={sujet}
          onMajSujet={onMajSujet}
          piecesJointes={piecesJointes}
          pjJointes={pjJointes}
          onTogglePjJointe={onTogglePjJointe}
          onEditBrouillon={onEditBrouillon}
          onBlurBrouillon={onBlurBrouillon}
          signatureHtml={signatureHtml}
          onEnvoyer={onEnvoyer}
          envoiEnCours={envoiEnCours}
          msgBrouillon={msgBrouillon}
          onRepondre={onRepondre}
          onGenererBrouillon={onGenererBrouillon}
        />

        {/* Action principale : repond (brouillon) + classe dans le dossier choisi.
            Le "Plan d'action" (etapes IA) est differe -> cf. ROADMAP (a venir). */}
        <div>
          {classe ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={onDevalider}
                variant="secondary" size="lg"
              >
                <RotateCcw strokeWidth={1.5} className="w-4 h-4" />
                Annuler (classé)
              </Button>
              {m.dossierClasseNom ? (
                <span className="text-meta text-ink-3">
                  classé dans «&nbsp;{m.dossierClasseNom}&nbsp;»
                </span>
              ) : null}
            </div>
          ) : (
            <Button
              onClick={onValider}
              disabled={!dossierIdChoisi}
              title={!dossierIdChoisi ? "Choisis un dossier de destination" : undefined}
              variant="secondary" size="lg"
            >
              <Check strokeWidth={2} className="w-4 h-4" />
              {labelValider}
            </Button>
          )}
          {msgClasser ? <p className="mt-1.5 text-meta text-err-700">{msgClasser}</p> : null}
        </div>

        <RattachementDossier
          m={m}
          ratt={ratt}
          coproCode={coproCode}
          dossiersReels={dossiersReels}
          typeSuggere={typeSuggere}
          changer={changer}
          onToggleChanger={onToggleChanger}
          onRattacherDossier={onRattacherDossier}
          onCreerDossier={onCreerDossier}
        />

        {/* Detail repliable : historique + contexte eStale */}
        <DetailDossier
          dossier={dossier}
          contexte={contexte}
          ouverts={ouverts}
          onToggleSection={onToggleSection}
        />
      </div>
    </Card>
  );
}
