"use client";

// Annonce de la prochaine AG aux copropriétaires par un mailing ESTALE (REA-144).
// Bouton -> aperçu du texte (modèle présentiel ou hybride, modifiable) -> création du
// mailing dans ESTALE, NON ENVOYÉ. Le gestionnaire relit et lance l'envoi dans ESTALE.
// Rendu seulement pour une copro ESTALE (la page ne le passe pas pour une copro Crypto).
// Hors des paliers de la checklist : l'annonce part avant le CS (date limite à J-45),
// quand la phase « Convocation » est encore verrouillée.

import { useState, useTransition } from "react";
import { ExternalLink, Mail } from "lucide-react";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented";
import type { ModeleAnnonceAg } from "@/lib/domain/annonce-ag-mailing";
import type { ApercuAnnonceAg, Resultat } from "@/lib/services/estale/annonce-ag-mailing";
import type { MailingCree } from "@/lib/ports/mailing-estale-provider";

export interface ActionsAnnonceAg {
  apercu: (modele?: ModeleAnnonceAg) => Promise<Resultat<ApercuAnnonceAg>>;
  creer: (modele?: ModeleAnnonceAg) => Promise<Resultat<MailingCree>>;
}

const OPTIONS_MODELE = [
  { value: "presentiel" as const, label: "Présentiel" },
  { value: "hybride" as const, label: "Hybride (AG CONNECT)" },
];

function dateCourte(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function AnnonceAgEstale({ actions, lectureSeule }: { actions: ActionsAnnonceAg; lectureSeule: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [apercu, setApercu] = useState<ApercuAnnonceAg | null>(null);
  const [cree, setCree] = useState<MailingCree | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [enCreation, setEnCreation] = useState(false);

  const charger = (modele?: ModeleAnnonceAg) =>
    startTransition(async () => {
      setErreur(null);
      const r = await actions.apercu(modele);
      if (r.ok) setApercu(r.valeur);
      else {
        setApercu(null);
        setErreur(r.raison);
      }
    });

  const ouvrir = () => {
    setOuvert(true);
    setCree(null);
    charger();
  };

  const creer = () => {
    if (!apercu) return;
    setEnCreation(true);
    startTransition(async () => {
      setErreur(null);
      const r = await actions.creer(apercu.modele);
      if (r.ok) setCree(r.valeur);
      else setErreur(r.raison);
      setEnCreation(false);
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
        <Mail strokeWidth={1.5} className="w-4 h-4 text-ink-3 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="text-body text-ink">Annonce de la date d&apos;AG aux copropriétaires</div>
          <div className="text-meta text-ink-3">
            Mailing ESTALE préparé ici, relu et envoyé depuis ESTALE. À faire avant la date limite des demandes (J-45).
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={ouvrir} disabled={lectureSeule}>
          Préparer l&apos;annonce de l&apos;AG (ESTALE)
        </Button>
      </div>

      {ouvert && (
        <Modal titre="Annonce de l'AG aux copropriétaires" onFermer={() => setOuvert(false)} size="lg">
          <ModalBody>
            <div className="flex flex-col gap-3">
              {erreur && <Callout ton="err">{erreur}</Callout>}

              {apercu && !cree && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <SegmentedControl
                      label="Modèle de l'annonce"
                      size="sm"
                      options={OPTIONS_MODELE}
                      value={apercu.modele}
                      disabled={isPending}
                      onChange={(v) => v && v !== apercu.modele && charger(v)}
                    />
                    <span className="text-meta text-ink-3">
                      {apercu.modele === apercu.modelePropose ? apercu.raisonModele : "Modèle changé à la main."}
                    </span>
                  </div>
                  <div className="text-meta text-ink-2">
                    AG du <span className="tabular-nums">{dateCourte(apercu.agDateISO)}</span> · date limite des
                    demandes <span className="tabular-nums">{dateCourte(apercu.dateLimiteISO)}</span>
                  </div>
                  <div className="text-body text-ink">
                    <span className="text-ink-3">Objet : </span>
                    {apercu.objet}
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 text-body text-ink">
                    {apercu.texte}
                  </div>
                  {apercu.refusCreation ? (
                    <Callout ton="warn">{apercu.refusCreation}</Callout>
                  ) : (
                    <Callout ton="info">
                      Le mailing sera créé dans ESTALE <strong>sans être envoyé</strong>, pour tous les copropriétaires
                      qui ont une adresse e-mail. Vous relisez le texte et les destinataires dans ESTALE, puis vous lancez
                      l&apos;envoi.
                    </Callout>
                  )}
                </>
              )}

              {cree && (
                <>
                  <Callout ton="ok" titre={`Mailing ${cree.reference} créé dans ESTALE, non envoyé.`}>
                    {cree.destinatairesMail} copropriétaire{cree.destinatairesMail > 1 ? "s" : ""} par e-mail.
                    {cree.sansEmail > 0 &&
                      ` ${cree.sansEmail} sans adresse e-mail utilisable : à prévenir autrement (non inclus).`}
                  </Callout>
                  {cree.coutEnvoi > 0 && (
                    <Callout ton="warn">
                      ESTALE annonce un coût d&apos;envoi de {cree.coutEnvoi.toFixed(2).replace(".", ",")} €.
                    </Callout>
                  )}
                  <p className="text-body text-ink-2">
                    Ouvrez ESTALE, menu Mailings, mailing « {cree.titre} » (référence {cree.reference}) : relisez puis
                    lancez l&apos;envoi.
                  </p>
                </>
              )}

              {isPending && !apercu && !erreur && <p className="text-meta text-ink-3">Préparation de l&apos;aperçu…</p>}
            </div>
          </ModalBody>
          <ModalFooter>
            {cree ? (
              <>
                <Button variant="ghost" onClick={() => setOuvert(false)}>
                  Fermer
                </Button>
                <ButtonAnchor variant="primary" href={cree.lien} target="_blank" rel="noreferrer">
                  <ExternalLink strokeWidth={1.5} /> Ouvrir ESTALE
                </ButtonAnchor>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setOuvert(false)}>
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  onClick={creer}
                  disabled={isPending || !apercu || Boolean(apercu.refusCreation)}
                >
                  {enCreation ? "Création…" : "Créer le mailing dans ESTALE"}
                </Button>
              </>
            )}
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
