"use client";

// Annonce de la prochaine AG aux copropriétaires par un mailing ESTALE (REA-144).
// Module ouvert en modale depuis l'item « Date d'AG annoncée aux copropriétaires » de la
// phase « Avant CS » (cf. module-modal.tsx). Aperçu du texte (modèle présentiel ou
// hybride) -> création du mailing dans ESTALE, NON ENVOYÉ. Le gestionnaire relit et
// lance l'envoi dans ESTALE, puis coche l'item.
// Copro Crypto (`actions` absent) : la modale explique que l'annonce automatique n'existe
// que pour les copros ESTALE ; l'item reste cochable à la main.

import { useEffect, useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
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

/** Point d'entrée du module : explication pour une copro Crypto, sinon l'annonce ESTALE. */
export function AnnonceAgModal({ actions, onFermer }: { actions?: ActionsAnnonceAg | undefined; onFermer: () => void }) {
  if (!actions) {
    return (
      <Modal titre="Annonce de l'AG aux copropriétaires" onFermer={onFermer} size="md">
        <ModalBody>
          <Callout ton="info">
            L&apos;annonce automatique par mailing n&apos;existe que pour les copropriétés gérées dans ESTALE : les
            copropriétaires de cette copropriété sont dans Crypto. Prévenez-les comme d&apos;habitude, puis cochez
            l&apos;item à la main.
          </Callout>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onFermer}>
            Fermer
          </Button>
        </ModalFooter>
      </Modal>
    );
  }
  return <AnnonceAgEstale actions={actions} onFermer={onFermer} />;
}

function AnnonceAgEstale({ actions, onFermer }: { actions: ActionsAnnonceAg; onFermer: () => void }) {
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

  // Aperçu chargé à l'ouverture : la modale n'est montée que quand l'item l'ouvre.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => charger(), []);

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
        <Modal titre="Annonce de l'AG aux copropriétaires" onFermer={onFermer} size="lg">
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
                  {apercu.avertissement && <Callout ton="warn">{apercu.avertissement}</Callout>}
                  <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 text-body text-ink">
                    {apercu.texte}
                  </div>
                  <p className="text-meta text-ink-3">
                    « Madame, Monsieur, » est un aperçu : la civilité de chaque copropriétaire sera reprise par ESTALE.
                  </p>
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
                    Ouvrez le mailing « {cree.titre} » dans ESTALE (bouton ci-dessous, ou menu Mailings, référence{" "}
                    {cree.reference}) : relisez puis lancez l&apos;envoi.
                  </p>
                </>
              )}

              {isPending && !apercu && !erreur && <p className="text-meta text-ink-3">Préparation de l&apos;aperçu…</p>}
            </div>
          </ModalBody>
          <ModalFooter>
            {cree ? (
              <>
                <Button variant="ghost" onClick={onFermer}>
                  Fermer
                </Button>
                <ButtonAnchor variant="primary" href={cree.lien} target="_blank" rel="noreferrer">
                  <ExternalLink strokeWidth={1.5} /> Ouvrir le mailing dans ESTALE
                </ButtonAnchor>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={onFermer}>
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
  );
}
