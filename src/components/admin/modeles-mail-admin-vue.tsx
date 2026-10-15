"use client";

// Vue client de /admin/modeles-mail (REA-296). Les modèles sont rangés par agence, « Tout
// le cabinet » en premier. Création et modification dans une fenêtre, retrait (le modèle
// sort des listes sans être supprimé) et suppression en deux temps. Seuls les modèles des
// agences que la personne gère sont modifiables ; les gardes réelles sont dans les actions.

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Choix, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { VARIABLES_MODELE, type ModeleMailStocke } from "@/lib/domain/modeles-mail";
import { creerModeleMailAction, modifierModeleMailAction, supprimerModeleMailAction } from "@/app/admin/modeles-mail/actions";

const CABINET = "Tout le cabinet";

type Props = {
  modeles: ModeleMailStocke[];
  nonConfigure: boolean;
  agences: string[];
  agencesEditables: string[];
  cabinetEditable: boolean;
};

export function ModelesMailAdminVue({ modeles, nonConfigure, agences, agencesEditables, cabinetEditable }: Props) {
  // null = fenêtre fermée ; "nouveau" = création ; sinon le modèle modifié.
  const [edite, setEdite] = useState<ModeleMailStocke | "nouveau" | null>(null);
  const peutModifier = (agence: string | null) => (agence === null ? cabinetEditable : agencesEditables.includes(agence));
  const groupes = [null, ...agences].map((agence) => ({ agence, liste: modeles.filter((m) => m.agence === agence) }));
  const peutCreer = cabinetEditable || agencesEditables.length > 0;

  if (nonConfigure) {
    return (
      <Callout ton="warn">
        La table des modèles n&apos;existe pas encore : passer <code>supabase/sql/intranet_mail_modeles.sql</code>. En
        attendant, le compositeur propose les modèles de secours.
      </Callout>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {peutCreer && (
        <div>
          <Button variant="primary" onClick={() => setEdite("nouveau")}>
            <Plus strokeWidth={2} />
            Nouveau modèle
          </Button>
        </div>
      )}
      {modeles.length === 0 && <p className="text-body text-ink-3">Aucun modèle pour le moment : le compositeur propose les modèles de secours.</p>}
      {groupes
        .filter((g) => g.liste.length > 0)
        .map((g) => (
          <section key={g.agence ?? "cabinet"} className="flex flex-col gap-2">
            <h2 className="text-meta uppercase tracking-[0.06em] text-ink-3">{g.agence ?? CABINET}</h2>
            {g.liste.map((m) => (
              <LigneModele key={m.id} m={m} modifiable={peutModifier(m.agence)} onModifier={() => setEdite(m)} />
            ))}
          </section>
        ))}
      {edite && (
        <FormulaireModele
          modele={edite === "nouveau" ? null : edite}
          agencesPossibles={agencesEditables}
          cabinetPossible={cabinetEditable}
          onFermer={() => setEdite(null)}
        />
      )}
    </div>
  );
}

function LigneModele({ m, modifiable, onModifier }: { m: ModeleMailStocke; modifiable: boolean; onModifier: () => void }) {
  const { ok, err } = useToast();
  const [enCours, start] = useTransition();
  const [confirmer, setConfirmer] = useState(false);

  function basculer() {
    start(async () => {
      const r = await modifierModeleMailAction(m.id, { titre: m.titre, sujet: m.sujet, corps: m.corps, agence: m.agence ?? "", actif: !m.actif });
      if (r.ok) ok(m.actif ? "Modèle retiré des listes" : "Modèle remis dans les listes");
      else err(r.message ?? "Modification impossible.");
    });
  }
  function supprimer() {
    if (!confirmer) {
      setConfirmer(true);
      return;
    }
    start(async () => {
      const r = await supprimerModeleMailAction(m.id);
      if (r.ok) ok("Modèle supprimé");
      else err(r.message ?? "Suppression impossible.");
    });
  }

  return (
    <Card>
      <div className={`flex flex-col gap-1.5 px-4 py-3 ${m.actif ? "" : "opacity-60"}`}>
        <div className="flex items-center gap-2">
          <span className="text-body font-medium text-ink">{m.titre}</span>
          {m.sujet ? <span className="text-meta text-ink-3 truncate">· objet « {m.sujet} »</span> : null}
          {!m.actif && <Badge ton="neutral">Retiré</Badge>}
        </div>
        <p className="text-meta text-ink-2 whitespace-pre-wrap line-clamp-3">{m.corps}</p>
        {modifiable && (
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" variant="secondary" disabled={enCours} onClick={onModifier}>
              Modifier
            </Button>
            <Button size="sm" variant="secondary" disabled={enCours} onClick={basculer}>
              {m.actif ? "Retirer" : "Remettre"}
            </Button>
            <Button size="sm" variant="danger" disabled={enCours} onClick={supprimer}>
              {confirmer ? "Confirmer ?" : "Supprimer"}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function FormulaireModele({
  modele,
  agencesPossibles,
  cabinetPossible,
  onFermer,
}: {
  modele: ModeleMailStocke | null;
  agencesPossibles: string[];
  cabinetPossible: boolean;
  onFermer: () => void;
}) {
  const { ok, err } = useToast();
  const [enCours, start] = useTransition();
  const [titre, setTitre] = useState(modele?.titre ?? "");
  const [sujet, setSujet] = useState(modele?.sujet ?? "");
  const [corps, setCorps] = useState(modele?.corps ?? "");
  const [agence, setAgence] = useState(modele ? (modele.agence ?? "") : (agencesPossibles[0] ?? ""));
  const [actif, setActif] = useState(modele?.actif ?? true);
  const texte = useRef<HTMLTextAreaElement>(null);

  // Insère une variable là où se trouve le curseur dans le texte.
  function inserer(cle: string) {
    const t = texte.current;
    const v = `{{${cle}}}`;
    const debut = t?.selectionStart ?? corps.length;
    const fin = t?.selectionEnd ?? corps.length;
    setCorps(corps.slice(0, debut) + v + corps.slice(fin));
    requestAnimationFrame(() => {
      t?.focus();
      t?.setSelectionRange(debut + v.length, debut + v.length);
    });
  }

  function enregistrer() {
    const saisie = { titre, sujet, corps, agence, actif };
    start(async () => {
      const r = modele ? await modifierModeleMailAction(modele.id, saisie) : await creerModeleMailAction(saisie);
      if (r.ok) {
        ok(modele ? "Modèle enregistré" : "Modèle créé");
        onFermer();
      } else err(r.message ?? "Enregistrement impossible.");
    });
  }

  return (
    <Modal titre={modele ? "Modifier le modèle" : "Nouveau modèle"} size="lg" onFermer={onFermer}>
      <ModalBody>
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Field label="Titre (dans la liste « Modèle »)" htmlFor="mm-titre" requis>
              <Input id="mm-titre" value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Agence" htmlFor="mm-agence">
              <Select id="mm-agence" value={agence} onChange={(e) => setAgence(e.target.value)}>
                {cabinetPossible && <option value="">{CABINET}</option>}
                {agencesPossibles.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Objet proposé" htmlFor="mm-objet" hint="Le code et l'adresse de la copropriété sont ajoutés devant automatiquement.">
            <Input id="mm-objet" value={sujet} onChange={(e) => setSujet(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Texte" htmlFor="mm-corps" requis hint="Sans signature : Signitic l'ajoute.">
            <Textarea id="mm-corps" ref={texte} value={corps} onChange={(e) => setCorps(e.target.value)} rows={14} maxLength={20_000} />
          </Field>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-meta text-ink-3">Insérer :</span>
            {VARIABLES_MODELE.map((v) => (
              <button
                key={v.cle}
                type="button"
                onClick={() => inserer(v.cle)}
                title={`{{${v.cle}}}`}
                className="h-6 px-2 rounded border border-line bg-surface text-meta text-ink-2 hover:border-green-600 hover:text-ink"
              >
                {v.libelle}
              </button>
            ))}
          </div>
          <Choix type="checkbox" label="Proposé dans les listes" checked={actif} onChange={(e) => setActif(e.target.checked)} />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer} disabled={enCours}>
          Annuler
        </Button>
        <Button variant="primary" onClick={enregistrer} loading={enCours}>
          Enregistrer
        </Button>
      </ModalFooter>
    </Modal>
  );
}
