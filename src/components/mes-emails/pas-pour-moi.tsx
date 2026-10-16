"use client";

// « Pas pour moi » (REA-327, Mylène 15/10/2026) : un mail de la boîte partagée rangé chez le
// mauvais binôme part chez le binôme de la bonne copro, même si elle n'est pas dans le
// portefeuille de la personne. Pas de « rendre au tri » (Sekou, 16/10/2026) : l'équipe
// connaît ses copros mieux que le tri, elle choisit la bonne. La recherche est tolérante :
// « St Martin » trouve STMARTIN, la ville compte, S109 = S0109.

import { useMemo, useState, useTransition } from "react";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal, ModalBody } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { chercherCopros, type CoproDestination } from "@/lib/domain/recherche-copro-tolerante";
import { coprosPourReaffecterAction, envoyerABonneCoproAction } from "@/app/mes-emails/actions";

export function PasPourMoi({ emailId, boite, onParti }: { emailId: string; boite: string; onParti: () => void }) {
  const toast = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [copros, setCopros] = useState<CoproDestination[] | null>(null);
  const [recherche, setRecherche] = useState("");
  const [enCours, demarrer] = useTransition();
  const resultats = useMemo(() => chercherCopros(copros ?? [], recherche), [copros, recherche]);

  function ouvrir() {
    setOuvert(true);
    if (copros === null) {
      void coprosPourReaffecterAction().then((r) => {
        if (r.ok) setCopros(r.donnees ?? []);
        else {
          setCopros([]);
          toast.err(r.erreur);
        }
      });
    }
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
      <Button size="lg" onClick={ouvrir} title="Ce mail a été rangé chez vous par erreur : l'envoyer au binôme de la bonne copropriété">
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
                placeholder="Nom, adresse, ville ou code (ex. St Martin, Bezons, S109)"
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
                    <li key={c.reference}>
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => envoyer(c)}
                        className="w-full text-left rounded-md border border-line px-3 py-2 hover:border-green-600 hover:bg-surface-2 disabled:opacity-60"
                      >
                        <span className="text-body text-ink">
                          <span className="font-mono">{c.reference}</span> · {c.nom}
                        </span>
                        <span className="block text-meta text-ink-3">
                          {c.adresse || "Adresse inconnue"}
                          {c.gestionnaire ? ` · gérée par ${c.gestionnaire}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ModalBody>
        </Modal>
      )}
    </>
  );
}
