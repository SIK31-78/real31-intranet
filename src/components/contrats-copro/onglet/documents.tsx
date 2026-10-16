"use client";

// Les documents d'un sujet (pointeurs SharePoint) : une ligne par fichier avec son lien,
// « Retirer » (le pointeur est masqué, le fichier reste), « Déposer un document » dans une
// modale (type, rattachement, fichier de 4 Mo au plus). Sans dépôt SharePoint actif, pas de
// bouton : une ligne le dit.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FolderOpen, Paperclip, Upload } from "lucide-react";
import { Button, classesBouton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Field, Select } from "@/components/ui/field";
import { Row, Rows } from "@/components/ui/list-rows";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { LIBELLE_TYPE_DOCUMENT, TYPES_DOCUMENT, type DocumentContrat, type SujetSuivi, type TypeDocument } from "@/lib/domain/contrats-copro";
import { deposerDocumentAction, retirerDocumentAction } from "@/app/contrats-copro/actions";
import { jour } from "./commun";

/** Une cible de rattachement proposée dans la modale de dépôt. */
export interface CibleDepot {
  type: "copro" | "cycle_assurance" | "offre_assurance" | "offre_gaz" | "devis_ctq";
  id: string;
  libelle: string;
}

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";
const TAILLE_MAX = 4 * 1024 * 1024;

export function DocumentsSujet({
  coproCode,
  sujet,
  documents,
  peutEcrire,
  depotActif,
  cibles,
}: {
  coproCode: string;
  sujet: SujetSuivi;
  documents: DocumentContrat[];
  peutEcrire: boolean;
  depotActif: boolean;
  cibles: CibleDepot[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();
  const [depot, setDepot] = useState(false);
  const visibles = documents.filter((d) => !d.supprimeLeISO);

  async function retirer(d: DocumentContrat) {
    const ok = await confirmer({ titre: "Retirer ce document ?", message: `« ${d.nomAffiche} » ne sera plus listé ici ; le fichier reste dans SharePoint.`, confirmer: "Retirer", danger: true });
    if (!ok) return;
    demarrer(async () => {
      const res = await retirerDocumentAction({ coproCode, documentId: d.id });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Document « ${d.nomAffiche} » retiré.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 min-h-7">
        <Eyebrow as="h4">Documents{visibles.length ? ` · ${visibles.length}` : ""}</Eyebrow>
        {peutEcrire && depotActif ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setDepot(true)}>
            <Upload strokeWidth={1.5} /> Déposer un document
          </Button>
        ) : peutEcrire ? (
          <span className="text-meta text-ink-3">Dépôt SharePoint non activé</span>
        ) : null}
      </div>
      {visibles.length === 0 ? (
        <EmptyState icone={FolderOpen} compact>
          Aucun document
        </EmptyState>
      ) : (
        <Rows>
          {visibles.map((d) => (
            <Row
              key={d.id}
              principal={
                d.webUrl ? (
                  <a href={d.webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline underline-offset-2">
                    <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" aria-hidden />
                    {d.nomAffiche}
                    <ExternalLink strokeWidth={1.5} className="w-3 h-3 text-ink-3" aria-hidden />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Paperclip strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" aria-hidden />
                    {d.nomAffiche}
                  </span>
                )
              }
              secondaire={`${LIBELLE_TYPE_DOCUMENT[d.typeDocument]} · déposé le ${jour(d.deposeLeISO.slice(0, 10))}`}
              droite={
                peutEcrire ? (
                  <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => retirer(d)}>
                    Retirer
                  </Button>
                ) : undefined
              }
            />
          ))}
        </Rows>
      )}
      {depot && <ModaleDepot coproCode={coproCode} sujet={sujet} cibles={cibles} onFermer={() => setDepot(false)} />}
    </div>
  );
}

function ModaleDepot({ coproCode, sujet, cibles, onFermer }: { coproCode: string; sujet: SujetSuivi; cibles: CibleDepot[]; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [type, setType] = useState<TypeDocument>(sujet === "assurance" || sujet === "gaz" ? "offre" : "devis");
  const [cible, setCible] = useState(0);
  const [fichier, setFichier] = useState<File | null>(null);
  const tropLourd = fichier !== null && fichier.size > TAILLE_MAX;
  const pret = fichier !== null && !tropLourd && cibles[cible] !== undefined;

  function valider() {
    if (!pret || !fichier) return;
    const c = cibles[cible];
    demarrer(async () => {
      const form = new FormData();
      form.set("fichier", fichier);
      form.set("coproCode", coproCode);
      form.set("sujet", sujet);
      form.set("typeDocument", type);
      form.set("rattachementType", c.type);
      form.set("rattachementId", c.id);
      const res = await deposerDocumentAction(form);
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Document « ${fichier.name} » déposé.`);
      onFermer();
      router.refresh();
    });
  }

  return (
    <Modal titre="Déposer un document" onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <Field label="Type de document" htmlFor="doc-type">
            <Select id="doc-type" value={type} onChange={(e) => setType(e.target.value as TypeDocument)}>
              {TYPES_DOCUMENT.map((t) => (
                <option key={t} value={t}>
                  {LIBELLE_TYPE_DOCUMENT[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rattaché à" htmlFor="doc-cible">
            <Select id="doc-cible" value={cible} onChange={(e) => setCible(Number(e.target.value))}>
              {cibles.map((c, i) => (
                <option key={`${c.type}-${c.id}`} value={i}>
                  {c.libelle}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fichier" htmlFor="doc-fichier" requis hint="PDF, image, Word ou Excel, 4 Mo au plus." erreur={tropLourd ? "Le fichier dépasse 4 Mo : réduis-le avant de le déposer." : undefined}>
            <div className="flex items-center gap-3 flex-wrap">
              <label htmlFor="doc-fichier" className={classesBouton({ variant: "secondary" })}>
                <Upload strokeWidth={1.5} className="w-4 h-4" aria-hidden /> {fichier ? "Changer de fichier" : "Choisir un fichier"}
              </label>
              <input id="doc-fichier" type="file" accept={ACCEPT} className="sr-only" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
              {fichier && (
                <span className="text-body text-ink-2 truncate">
                  {fichier.name} · {Math.max(1, Math.round(fichier.size / 1024))} Ko
                </span>
              )}
            </div>
          </Field>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>
          Annuler
        </Button>
        <Button variant="primary" loading={pending} disabled={!pret} onClick={valider}>
          <Upload strokeWidth={1.5} /> Déposer
        </Button>
      </ModalFooter>
    </Modal>
  );
}
