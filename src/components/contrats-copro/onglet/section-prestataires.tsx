"use client";

// Les prestataires de la copropriété : une ligne par entreprise et métier (ascensoriste,
// courtier, fournisseur de gaz…), le principal en pastille, « Retirer », « Ajouter un
// prestataire » depuis le référentiel du cabinet (qui se gère dans le module des clés).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Choix, Field, Select } from "@/components/ui/field";
import { Row, Rows } from "@/components/ui/list-rows";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Section } from "@/components/ui/section";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { LIBELLE_METIER, METIERS_PRESTATAIRE, type MetierPrestataire, type PrestataireCopro } from "@/lib/domain/contrats-copro";
import type { EntrepriseMetier } from "@/lib/services/contrats-copro/prestataires";
import { delierPrestataireAction, lierPrestataireAction } from "@/app/contrats-copro/actions-prestataires";

export function SectionPrestataires({
  coproCode,
  prestataires,
  entreprisesParMetier,
  peutEcrire,
}: {
  coproCode: string;
  prestataires: PrestataireCopro[];
  entreprisesParMetier: Record<MetierPrestataire, EntrepriseMetier[]>;
  peutEcrire: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();
  const [ajout, setAjout] = useState(false);

  async function retirer(p: PrestataireCopro) {
    const ok = await confirmer({ titre: "Retirer ce prestataire ?", message: `${p.entrepriseNom} ne sera plus ${LIBELLE_METIER[p.metier].toLowerCase()} de cette copropriété. Sa fiche dans le référentiel ne bouge pas.`, confirmer: "Retirer", danger: true });
    if (!ok) return;
    demarrer(async () => {
      const res = await delierPrestataireAction({ coproCode, entrepriseId: p.entrepriseId, metier: p.metier });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`${p.entrepriseNom} retirée.`);
      router.refresh();
    });
  }

  const tries = [...prestataires].sort((a, b) => a.metier.localeCompare(b.metier) || Number(b.principal) - Number(a.principal) || a.entrepriseNom.localeCompare(b.entrepriseNom, "fr"));

  return (
    <Section
      id="contrats-prestataires"
      titre="Prestataires"
      compte={prestataires.length || undefined}
      actions={
        <>
          <ButtonLink href="/cles/entreprises" variant="ghost" size="sm">
            Gérer les entreprises
          </ButtonLink>
          {peutEcrire && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setAjout(true)}>
              <Plus strokeWidth={1.5} /> Ajouter un prestataire
            </Button>
          )}
        </>
      }
    >
      {tries.length === 0 ? (
        <EmptyState icone={Building2}>Aucun prestataire rattaché à {coproCode}</EmptyState>
      ) : (
        <Rows>
          {tries.map((p) => (
            <Row
              key={`${p.entrepriseId}-${p.metier}`}
              principal={p.entrepriseNom}
              secondaire={`${LIBELLE_METIER[p.metier]}${p.email ? ` · ${p.email}` : ""}`}
              droite={
                <>
                  {p.principal && <Badge ton="brand">principal</Badge>}
                  {peutEcrire && (
                    <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => retirer(p)}>
                      Retirer
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </Rows>
      )}
      {ajout && <ModalePrestataire coproCode={coproCode} prestataires={prestataires} entreprisesParMetier={entreprisesParMetier} onFermer={() => setAjout(false)} />}
    </Section>
  );
}

function ModalePrestataire({
  coproCode,
  prestataires,
  entreprisesParMetier,
  onFermer,
}: {
  coproCode: string;
  prestataires: PrestataireCopro[];
  entreprisesParMetier: Record<MetierPrestataire, EntrepriseMetier[]>;
  onFermer: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [metier, setMetier] = useState<MetierPrestataire>("ascensoriste");
  const [entrepriseId, setEntrepriseId] = useState("");
  const dejaPrincipal = prestataires.some((p) => p.metier === metier && p.principal);
  const [principal, setPrincipal] = useState(!dejaPrincipal);
  const choix = (entreprisesParMetier[metier] ?? []).filter((e) => !prestataires.some((p) => p.metier === metier && p.entrepriseId === e.id));
  const entreprise = choix.find((e) => e.id === entrepriseId);

  function changerMetier(m: MetierPrestataire) {
    setMetier(m);
    setEntrepriseId("");
    setPrincipal(!prestataires.some((p) => p.metier === m && p.principal));
  }

  function valider() {
    if (!entreprise) return;
    demarrer(async () => {
      const res = await lierPrestataireAction({ coproCode, entrepriseId: entreprise.id, metier, principal });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`${entreprise.nom} rattachée comme ${LIBELLE_METIER[metier].toLowerCase()}.`);
      onFermer();
      router.refresh();
    });
  }

  return (
    <Modal titre="Ajouter un prestataire" onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <Field label="Métier" htmlFor="prest-metier">
            <Select id="prest-metier" value={metier} onChange={(e) => changerMetier(e.target.value as MetierPrestataire)} autoFocus>
              {METIERS_PRESTATAIRE.map((m) => (
                <option key={m} value={m}>
                  {LIBELLE_METIER[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Entreprise" htmlFor="prest-entreprise" requis hint={choix.length === 0 ? "Aucune entreprise de ce métier dans le référentiel : ajoute-la depuis « Gérer les entreprises »." : undefined}>
            <Select id="prest-entreprise" value={entrepriseId} onChange={(e) => setEntrepriseId(e.target.value)} disabled={choix.length === 0}>
              <option value="">Choisir…</option>
              {choix.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Choix type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} label={dejaPrincipal ? "Contact principal pour ce métier (remplace l'actuel)" : "Contact principal pour ce métier"} />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>
          Annuler
        </Button>
        <Button variant="primary" loading={pending} disabled={!entreprise} onClick={valider}>
          <Plus strokeWidth={1.5} /> Rattacher
        </Button>
      </ModalFooter>
    </Modal>
  );
}
