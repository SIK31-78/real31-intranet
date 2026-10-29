"use client";

// « Pas pour moi » (REA-327, demande d'une assistante, 15/10/2026) : un mail de la boîte partagée rangé chez le
// mauvais binôme part chez le binôme de la bonne copro, même si elle n'est pas dans le
// portefeuille de la personne. Pas de « rendre au tri » (Sekou, 16/10/2026) : l'équipe
// connaît ses copros mieux que le tri, elle choisit la bonne. La recherche est tolérante :
// « St Martin » trouve STMARTIN, la ville compte, S109 = S0109, « Dupont » trouve les copros
// de ce copropriétaire (28/10/2026).
// Autre agence (ADR-050, 28/10/2026) : la liste propose aussi les copros des AUTRES boîtes
// triées ; en choisir une recopie le mail dans la boîte de cette agence (rangé chez le binôme
// de la copro) et retire l'original d'ici. « Envoyer à syndicN » le dépose dans la réception
// de l'autre boîte, pour son tri, quand on ne connaît pas la copro. Rien de tout cela tant que
// l'écriture n'est pas ouverte sur les deux boîtes (liste vide côté serveur).
// Boîte « destination seulement » (syndic1 pour ML, 28/10/2026, relevée par Crypto) : ses copros
// sont proposées de même, mais le mail arrive seulement dans sa réception, sans rangement.

import { useMemo, useState, useTransition } from "react";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal, ModalBody } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { chercherCopros, type CoproDestination } from "@/lib/domain/recherche-copro-tolerante";
import { coprosPourReaffecterAction, envoyerABonneCoproAction } from "@/app/mes-emails/actions";
import { basculerMailAction, destinationsBasculeAction } from "@/app/mes-emails/actions-bascule";
import type { CoproAutreBoite, DestinationBascule } from "@/lib/services/tri-emails/basculer";

/** Une copro de la boîte du mail, ou d'une autre boîte (le mail y basculerait). */
type Choix = CoproDestination & { boite?: string; agences?: string[] };

const court = (boite: string) => boite.split("@")[0];

/** `compact` : en petit, en texte, dans la barre d'actions du volet (29/10/2026). */
export function PasPourMoi({ emailId, boite, onParti, compact = false }: { emailId: string; boite: string; onParti: () => void; compact?: boolean }) {
  const toast = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [copros, setCopros] = useState<CoproDestination[] | null>(null);
  const [ailleurs, setAilleurs] = useState<{ boites: DestinationBascule[]; copros: CoproAutreBoite[] }>({ boites: [], copros: [] });
  const [recherche, setRecherche] = useState("");
  const [enCours, demarrer] = useTransition();
  // Les copros de la boîte du mail d'abord, puis celles des autres boîtes.
  const resultats = useMemo(
    () => chercherCopros<Choix>([...(copros ?? []), ...ailleurs.copros], recherche),
    [copros, ailleurs.copros, recherche],
  );

  function ouvrir() {
    setOuvert(true);
    if (copros === null) {
      // Les copros de la boîte du mail (un comptable voit plusieurs boîtes, 28/10/2026).
      void coprosPourReaffecterAction(boite).then((r) => {
        if (r.ok) setCopros(r.donnees ?? []);
        else {
          setCopros([]);
          toast.err(r.erreur);
        }
      });
      void destinationsBasculeAction(boite).then((r) => {
        if (r.ok && r.donnees) setAilleurs(r.donnees);
      });
    }
  }

  // Vers une autre boîte triée : avec la copro (rangé chez son binôme là-bas), ou sans (son tri).
  function basculer(cible: string, reference: string | null) {
    demarrer(async () => {
      const r = await basculerMailAction(emailId, boite, cible, reference);
      if (!r.ok) return void toast.err(r.erreur);
      const d = r.donnees;
      if (d?.cibleTriee === false) {
        toast.ok(`Mail envoyé dans la boîte de réception de ${court(cible)}${reference ? `, pour ${reference}` : ""} (boîte non triée par l'intranet).`);
      } else if (d?.dossierNom) toast.ok(`Mail envoyé dans la boîte ${court(cible)}, dossier ${d.dossierNom}, pour ${reference}.`);
      else if (d?.rangementRefuse) toast.warn(`Mail envoyé dans la boîte ${court(cible)}, mais pas rangé (${d.rangementRefuse}) : son tri s'en chargera.`);
      else toast.ok(`Mail envoyé dans la boîte ${court(cible)} : son tri le rangera.`);
      setOuvert(false);
      onParti();
    });
  }

  function choisir(c: Choix) {
    if (c.boite) basculer(c.boite, c.reference);
    else envoyer(c);
  }

  function envoyer(c: CoproDestination) {
    demarrer(async () => {
      const r = await envoyerABonneCoproAction(emailId, c.reference, boite);
      if (!r.ok) return void toast.err(r.erreur);
      toast.ok(`Mail envoyé dans le dossier ${r.donnees?.dossierNom ?? ""}, pour ${c.reference}.`);
      setOuvert(false);
      onParti();
    });
  }

  return (
    <>
      <Button size={compact ? "sm" : "lg"} variant={compact ? "ghost" : "secondary"} onClick={ouvrir} title="Ce mail a été rangé chez vous par erreur : l'envoyer au binôme de la bonne copropriété">
        <UserX strokeWidth={1.5} />
        Pas pour moi
      </Button>
      {ouvert && (
        <Modal titre="Ce mail n'est pas pour moi" onFermer={() => setOuvert(false)}>
          <ModalBody>
            <div className="flex flex-col gap-2">
              <p className="text-body text-ink-2">
                Choisissez la copropriété qu&apos;il concerne : il part dans le dossier du binôme qui la gère.
              </p>
              <Input
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Nom, adresse, ville, code ou copropriétaire (ex. St Martin, Bezons, S109, Dupont)"
                aria-label="Rechercher la copropriété"
                autoFocus
              />
              {copros === null ? (
                <p className="text-meta text-ink-3">Chargement des copropriétés…</p>
              ) : recherche.trim() && resultats.length === 0 ? (
                <p className="text-meta text-ink-3">Aucune copropriété ne correspond.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {resultats.map((c) => (
                    <li key={`${c.boite ?? ""}|${c.reference}`}>
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => choisir(c)}
                        className="w-full text-left rounded-md border border-line px-3 py-2 hover:border-green-600 hover:bg-surface-2 disabled:opacity-60"
                      >
                        <span className="text-body text-ink">
                          <span className="font-mono">{c.reference}</span> · {c.nom}
                        </span>
                        {c.coproprietaireTrouve && (
                          <span className="block text-meta text-ink-2">{c.coproprietaireTrouve} · copropriétaire</span>
                        )}
                        <span className="block text-meta text-ink-3">
                          {c.adresse || "Adresse inconnue"}
                          {c.gestionnaire ? ` · gérée par ${c.gestionnaire}` : ""}
                        </span>
                        {c.boite && (
                          <span className="block text-meta text-warn-700">
                            Autre agence ({c.agences?.join(", ")}) : le mail part dans la boîte {court(c.boite)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {ailleurs.boites.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 mt-1 text-meta text-ink-2">
                  <span>Pas pour cette agence ?</span>
                  {ailleurs.boites.map((b) => (
                    <Button
                      key={b.boite}
                      size="sm"
                      variant="secondary"
                      disabled={enCours}
                      onClick={() => basculer(b.boite, null)}
                      title={
                        b.triee
                          ? `Recopie le mail tel quel dans la boîte de réception de ${b.boite}, où son tri le rangera ; l'original part aux éléments supprimés d'ici.`
                          : `Recopie le mail tel quel dans la boîte de réception de ${b.boite}, qui n'est pas triée par l'intranet ; l'original part aux éléments supprimés d'ici.`
                      }
                    >
                      Envoyer à {court(b.boite)} ({b.agences.join(", ")})
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </ModalBody>
        </Modal>
      )}
    </>
  );
}
