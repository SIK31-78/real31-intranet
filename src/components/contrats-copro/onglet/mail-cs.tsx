"use client";

// Le mail au conseil syndical (décision 9 : envoi direct avec prévisualisation, un avertissement
// avant départ). À l'ouverture, le serveur prépare l'aperçu (modèle, variables, destinataires
// de la cascade, signature) ; le gestionnaire relit et retouche tout ; « Envoyer » confirme le
// nombre de destinataires puis part depuis SA boîte. La prévisualisation se recalcule sur le
// texte édité, avec les mêmes fonctions de domaine que l'envoi.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, X } from "lucide-react";
import { Aide } from "@/components/ui/aide";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Choix, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  LIBELLE_SUJET,
  MARQUEUR_OFFRES,
  tableauOffres,
  texteVersHtmlMailCs,
  variantesPourSujet,
  type DonneesOffresMailCs,
  type SujetSuivi,
  type VarianteMailCs,
} from "@/lib/domain/contrats-copro";
import { adresseMailValide } from "@/lib/domain/mes-emails-composition";
import type { ApercuMailCs } from "@/lib/services/contrats-copro/mail-cs";
import type { SourceDestinataires } from "@/lib/services/coproprietes/destinataires-conseil";
import { envoyerMailCsAction, preparerMailCsAction } from "@/app/contrats-copro/actions-mail";
import { pluriel } from "./commun";

const SOURCE_LABEL: Record<SourceDestinataires, string> = {
  estale: "conseil syndical (ESTALE)",
  crypto: "liste de secours",
  aucune: "aucune adresse connue",
};

const LIBELLE_VARIANTE: Record<VarianteMailCs, string> = {
  comparatif: "Comparatif",
  devis_unique: "Devis unique",
};

export function BoutonMailCs({ coproCode, sujet, donnees }: { coproCode: string; sujet: SujetSuivi; donnees: DonneesOffresMailCs }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(true)}>
        <Mail strokeWidth={1.5} /> Envoyer au conseil syndical
      </Button>
      {ouvert && <ModaleMailCs coproCode={coproCode} sujet={sujet} donnees={donnees} onFermer={() => setOuvert(false)} />}
    </>
  );
}

function ModaleMailCs({ coproCode, sujet, donnees, onFermer }: { coproCode: string; sujet: SujetSuivi; donnees: DonneesOffresMailCs; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const variantes = variantesPourSujet(sujet);
  const [variante, setVariante] = useState<VarianteMailCs>(variantes[0]);
  const [modeleId, setModeleId] = useState<string | undefined>(undefined);
  const [apercu, setApercu] = useState<ApercuMailCs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, demarrerChargement] = useTransition();
  const [envoi, setEnvoi] = useState(false);
  const [a, setA] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  // Les destinataires retouchés à la main survivent à un changement de variante ou de modèle.
  const destinatairesTouches = useRef(false);
  const [objet, setObjet] = useState("");
  const [corps, setCorps] = useState("");
  const [tableauInclus, setTableauInclus] = useState(true);

  useEffect(() => {
    demarrerChargement(async () => {
      const res = await preparerMailCsAction({ coproCode, sujet, variante, ...(modeleId ? { modeleId } : {}) });
      if (!res.ok || !res.donnees) {
        setErreur(res.ok ? "Aperçu vide." : res.erreur);
        return;
      }
      const ap = res.donnees;
      setErreur(null);
      setApercu(ap);
      setObjet(ap.objet);
      setCorps(ap.corpsTexte);
      setModeleId(ap.modeleId ?? undefined);
      if (!destinatairesTouches.current) {
        setA(ap.a);
        setCc(ap.cc);
      }
    });
    // `modeleId` est volontairement hors des dépendances : c'est le choix du Select qui relance,
    // pas la valeur renvoyée par le serveur (sinon la première réponse relancerait un appel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coproCode, sujet, variante]);

  function changerModele(id: string) {
    setModeleId(id || undefined);
    demarrerChargement(async () => {
      const res = await preparerMailCsAction({ coproCode, sujet, variante, ...(id ? { modeleId: id } : {}) });
      if (!res.ok || !res.donnees) return toast.err(res.ok ? "Aperçu vide." : res.erreur);
      setApercu(res.donnees);
      setObjet(res.donnees.objet);
      setCorps(res.donnees.corpsTexte);
    });
  }

  const tableau = useMemo(() => tableauOffres(sujet, donnees), [sujet, donnees]);
  const html = useMemo(() => texteVersHtmlMailCs(corps, tableauInclus ? tableau.html : null), [corps, tableauInclus, tableau.html]);
  const avecMarqueur = corps.includes(MARQUEUR_OFFRES);

  async function envoyer() {
    const aValides = a.filter(adresseMailValide);
    if (aValides.length === 0) return toast.err("Ajoute au moins une adresse valide en « À ».");
    const mauvaise = [...a, ...cc].find((e) => !adresseMailValide(e));
    if (mauvaise) return toast.err(`Adresse invalide : ${mauvaise}`);
    if (!objet.trim()) return toast.err("L'objet du mail est vide.");
    if (!corps.trim()) return toast.err("Le texte du mail est vide.");
    const total = a.length + cc.length;
    const ok = await confirmer({
      titre: "Envoyer au conseil syndical ?",
      message: `Ce mail part vraiment aux ${pluriel(total, "destinataire")}${cc.length ? ` (${a.length} en « À », ${cc.length} en copie)` : ""}. Continuer ?`,
      confirmer: "Envoyer",
    });
    if (!ok) return;
    setEnvoi(true);
    const res = await envoyerMailCsAction({ coproCode, sujet, variante, ...(modeleId ? { modeleId } : {}), objet: objet.trim(), corpsTexte: corps, a, cc, tableauInclus });
    setEnvoi(false);
    if (!res.ok) return toast.err(res.erreur);
    toast.ok(`Mail envoyé à ${(res.donnees?.a ?? a).join(", ")}.`);
    onFermer();
    router.refresh();
  }

  const fermer = () => {
    if (!envoi) onFermer();
  };

  return (
    <Modal titre={`Mail au conseil syndical : ${LIBELLE_SUJET[sujet]}`} onFermer={fermer} size="lg">
      <ModalBody>
        <div className="flex flex-col gap-3">
          {variantes.length > 1 && (
            <SegmentedControl
              label="Type de mail"
              size="sm"
              value={variante}
              onChange={(v) => v && setVariante(v)}
              options={variantes.map((v) => ({ value: v, label: LIBELLE_VARIANTE[v] }))}
              disabled={chargement}
            />
          )}

          {erreur && <Callout ton="err">{erreur}</Callout>}
          {!apercu && !erreur && <p className="text-body text-ink-3">Préparation du mail…</p>}

          {apercu && (
            <>
              {apercu.avertissements.map((m) => (
                <Callout key={m} ton="warn">
                  {m}
                </Callout>
              ))}

              {apercu.modeles.length > 0 && (
                <Field label="Modèle" htmlFor="mailcs-modele">
                  <Select id="mailcs-modele" value={modeleId ?? ""} onChange={(e) => changerModele(e.target.value)} disabled={chargement}>
                    {apercu.modeles.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.titre}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body text-ink-2">Destinataires</span>
                  <span className="text-meta text-ink-3">source : {SOURCE_LABEL[apercu.sourceDestinataires]}</span>
                </div>
                <div className="border border-line bg-surface rounded-md px-2.5 py-2 flex flex-col gap-1">
                  <LigneDestinataires label="À" valeurs={a} onChange={(v) => { setA(v); destinatairesTouches.current = true; }} />
                  <LigneDestinataires label="Cc" valeurs={cc} onChange={(v) => { setCc(v); destinatairesTouches.current = true; }} />
                </div>
              </div>

              <Field label="Objet" htmlFor="mailcs-objet" requis>
                <Input id="mailcs-objet" value={objet} onChange={(e) => setObjet(e.target.value)} />
              </Field>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="flex flex-col gap-2 min-w-0">
                  <Field label="Message" htmlFor="mailcs-corps" requis hint={avecMarqueur ? `Le marqueur ${MARQUEUR_OFFRES} devient le tableau des offres.` : undefined}>
                    <Textarea id="mailcs-corps" rows={14} value={corps} onChange={(e) => setCorps(e.target.value)} className="resize-y font-[inherit]" />
                  </Field>
                  <Choix type="checkbox" checked={tableauInclus} onChange={(e) => setTableauInclus(e.target.checked)} label={`Inclure le tableau des ${sujet === "ctq_ascenseur" || sujet === "ctq_vmc" ? "devis" : "offres"}`} />
                  {apercu.tableauTexte && (
                    <Aide titre={`Ce que ${MARQUEUR_OFFRES} deviendra en texte brut`}>
                      <pre className="whitespace-pre-wrap font-[inherit] text-meta">{tableau.texte}</pre>
                    </Aide>
                  )}
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-body text-ink-2">Aperçu</span>
                  <div className="rounded-md border border-line bg-surface-2/40 p-3 overflow-auto max-h-96 text-ink">
                    <div className={cn("[&_table]:my-2 [&_td]:align-top", "[&_a]:underline")} dangerouslySetInnerHTML={{ __html: html }} />
                    {apercu.signatureHtml ? (
                      <div className="mt-3 border-t border-line pt-3" dangerouslySetInnerHTML={{ __html: apercu.signatureHtml }} />
                    ) : (
                      <p className="mt-3 text-meta text-ink-3">Sans signature.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer} disabled={envoi}>
          Annuler
        </Button>
        <Button variant="primary" onClick={envoyer} loading={envoi} disabled={!apercu || chargement}>
          <Send strokeWidth={1.5} /> Envoyer
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** Une ligne de destinataires en puces : ajout à la virgule ou à Entrée, retrait à la croix. */
function LigneDestinataires({ label, valeurs, onChange }: { label: string; valeurs: string[]; onChange: (v: string[]) => void }) {
  const [saisie, setSaisie] = useState("");
  const ajouter = () => {
    const e = saisie.trim().replace(/[,;]$/, "").trim();
    if (e && !valeurs.includes(e)) onChange([...valeurs, e]);
    setSaisie("");
  };
  return (
    <div className="flex items-start gap-2 min-h-6">
      <span className="w-7 shrink-0 pt-1 text-meta font-medium text-ink-2">{label}</span>
      <div className="flex-1 flex flex-wrap items-center gap-1">
        {valeurs.map((e) => {
          const valide = adresseMailValide(e);
          return (
            <span
              key={e}
              className={cn("inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-sm border text-meta", valide ? "bg-surface-2 border-line text-ink-2" : "bg-err-50 border-err-500/30 text-err-700")}
              title={valide ? undefined : "Adresse invalide"}
            >
              <span className="truncate max-w-56">{e}</span>
              <button
                type="button"
                onClick={() => onChange(valeurs.filter((x) => x !== e))}
                aria-label={`Retirer ${e}`}
                className="text-ink-3 hover:text-err-700 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              >
                <X strokeWidth={2} className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <input
          value={saisie}
          onChange={(ev) => setSaisie(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === "," || ev.key === ";") {
              ev.preventDefault();
              ajouter();
            }
          }}
          onBlur={ajouter}
          placeholder="ajouter une adresse…"
          aria-label={`Ajouter une adresse en ${label}`}
          className="flex-1 min-w-32 h-6 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
        />
      </div>
    </div>
  );
}
