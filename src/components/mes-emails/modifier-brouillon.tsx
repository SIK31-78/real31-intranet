"use client";

// « Modifier » un brouillon de ma boîte perso (02/11/2026, décision Sekou, option a) : il se
// rouvre dans une fenêtre d'écriture, avec l'éditeur riche (celui des pilotes) et les champs du
// nouveau mail (À, Cc, Cci avec l'annuaire, objet, trombone). Seule la partie écrite passe par
// l'éditeur : la signature et l'historique d'une réponse restent tels quels dans Outlook, et la
// signature n'est jamais ajoutée une deuxième fois (le serveur relit le brouillon à
// l'enregistrement, domain/brouillon-edition). Un brouillon dont la signature a été posée dans
// Outlook ne s'ouvre pas ici (02/11/2026, décision Sekou) : le serveur le refuse, la fenêtre
// affiche le refus.
// « Enregistrer » met à jour le brouillon sans l'envoyer ; « Envoyer » le met à jour puis
// l'envoie. Pièces d'origine : on peut en retirer ; les fichiers ajoutés sont déposés par
// tranches sur le brouillon, comme un mail neuf. Un dépôt raté ne supprime jamais le brouillon.

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/field";
import { Modal, ModalBody } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { BrouillonEdition } from "@/lib/domain/brouillon-edition";
import { NB_MAX_FICHIERS, TAILLE_MAX_FICHIER, TAILLE_MAX_TOTALE } from "@/lib/domain/piece-jointe-flux";
import { ouvrirBrouillonEditionAction, preparerEditionBrouillonAction } from "@/app/mes-emails/actions-brouillons";
import { finaliserCompositionAction } from "@/app/mes-emails/composer/actions";
import { ChampPersonnes, LigneExpediteur, adresses, type Personne } from "./compositeur";
import { BoutonJoindre, EditeurRiche } from "./editeur-riche";
import { LiensCopie, useLignesCopie, type LigneCopie } from "./lignes-copie";
import { deposerFichier } from "./deposer-fichier";

type FichierJoint = { nom: string; taille: number; fichier: File; progres?: number };
type Champ = "a" | "cc" | "cci";

const personne = (email: string): Personne => ({ cle: email.toLowerCase(), nom: email, emails: [email] });

function formatTaille(octets: number): string {
  if (octets >= 1_000_000) return `${(octets / 1_000_000).toFixed(1)} Mo`;
  if (octets >= 1000) return `${Math.round(octets / 1000)} Ko`;
  return `${octets} o`;
}

export function ModifierBrouillon({
  boite,
  id,
  onFermer,
  onEnvoye,
  onEnregistre,
}: {
  boite: string;
  id: string;
  onFermer: () => void;
  /** Le brouillon est parti : il sort de la liste. */
  onEnvoye: () => void;
  /** Le brouillon a été mis à jour (ou en partie) : la liste se relit. */
  onEnregistre: () => void;
}) {
  const [e, setE] = useState<BrouillonEdition | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    void ouvrirBrouillonEditionAction({ boite, id }).then((r) => {
      if (!actif) return;
      if (r.ok && r.donnees) setE(r.donnees);
      else setErreur(r.ok ? "Brouillon illisible." : r.erreur);
    });
    return () => {
      actif = false;
    };
  }, [boite, id]);

  return (
    <Modal titre="Modifier le brouillon" size="lg" onFermer={onFermer} saisieEnCours={Boolean(e)}>
      <ModalBody>
        {erreur ? (
          <Callout ton="warn">{erreur}</Callout>
        ) : !e ? (
          <p className="text-body text-ink-3">Ouverture du brouillon…</p>
        ) : (
          <Edition e={e} onFermer={onFermer} onEnvoye={onEnvoye} onEnregistre={onEnregistre} />
        )}
      </ModalBody>
    </Modal>
  );
}

function Edition({ e, onFermer, onEnvoye, onEnregistre }: { e: BrouillonEdition; onFermer: () => void; onEnvoye: () => void; onEnregistre: () => void }) {
  const toast = useToast();
  const [dest, setDest] = useState<Record<Champ, Personne[]>>({ a: e.a.map(personne), cc: e.cc.map(personne), cci: e.cci.map(personne) });
  const [objet, setObjet] = useState(e.objet);
  const [html, setHtml] = useState(e.corpsHtml);
  const [retirees, setRetirees] = useState<Set<string>>(new Set());
  const [fichiers, setFichiers] = useState<FichierJoint[]>([]);
  const [enCours, setEnCours] = useState(false);
  const lignes = useLignesCopie({ cc: dest.cc.length, cci: dest.cci.length });

  const majChamp = (champ: Champ) => (l: Personne[]) => setDest((d) => ({ ...d, [champ]: l }));
  function deplacer(depuis: string, cle: string, vers: Champ) {
    const source = dest[depuis as Champ];
    const p = source?.find((x) => x.cle === cle);
    if (!p || depuis === vers) return;
    setDest((d) => ({ ...d, [depuis]: d[depuis as Champ].filter((x) => x.cle !== cle), [vers]: d[vers].some((x) => x.cle === cle) ? d[vers] : [...d[vers], p] }));
  }

  // Mêmes limites que le nouveau mail : 25 Mo par fichier, 25 Mo de fichiers ajoutés, 10 fichiers.
  function ajouterFichiers(liste: FileList | null) {
    if (!liste?.length) return;
    const ajout: FichierJoint[] = [];
    let total = fichiers.reduce((t, f) => t + f.taille, 0);
    for (const f of Array.from(liste)) {
      if (f.size > TAILLE_MAX_FICHIER || total + f.size > TAILLE_MAX_TOTALE) {
        toast.warn(`« ${f.name} » ferait dépasser 25 Mo : à déposer sur SharePoint et à envoyer en lien.`);
        continue;
      }
      total += f.size;
      ajout.push({ nom: f.name, taille: f.size, fichier: f });
    }
    setFichiers((l) => [...l, ...ajout].slice(0, NB_MAX_FICHIERS));
  }
  const majProgres = (i: number | null, fraction: number) =>
    setFichiers((l) => l.map((f, k) => (i === null ? { nom: f.nom, taille: f.taille, fichier: f.fichier } : k === i ? { ...f, progres: fraction } : f)));

  const aDestinataire = Boolean(adresses(dest.a).length || adresses(dest.cc).length || adresses(dest.cci).length);
  const pretAEnvoyer = aDestinataire && Boolean(objet.trim());

  async function valider(brouillonSeul: boolean) {
    if (enCours) return;
    if (!brouillonSeul && !pretAEnvoyer) return void toast.err("Il manque un destinataire ou l'objet.");
    setEnCours(true);
    try {
      const prep = await preparerEditionBrouillonAction({
        boite: e.boite,
        id: e.id,
        objet: objet.trim(),
        a: adresses(dest.a),
        cc: adresses(dest.cc),
        cci: adresses(dest.cci),
        corpsHtml: html,
        retirer: [...retirees],
        fichiers: fichiers.map(({ nom, taille }) => ({ nom, taille })),
        brouillon: brouillonSeul,
      });
      if (!prep.ok) return void toast.err(prep.erreur);
      const p = prep.donnees;
      if (!p || p.simulation || !p.jeton) return void toast.ok("Aperçu vérifié : aucune boîte branchée ici, rien n'est écrit.");
      const jeton = p.jeton;
      for (const [i, f] of fichiers.entries()) {
        const d = await deposerFichier(jeton, f.fichier, (x) => majProgres(i, x));
        if (!d.ok) {
          majProgres(null, 0);
          // Le brouillon est déjà mis à jour : jamais supprimé, rien n'est parti.
          toast.err(`${d.erreur} Le brouillon est enregistré avec vos modifications, sans ce fichier ; rien n'est parti.`);
          onEnregistre();
          return;
        }
      }
      const r = await finaliserCompositionAction({ jetons: [jeton] });
      majProgres(null, 0);
      if (!r.ok) {
        toast.err(r.erreur);
        onEnregistre();
        return;
      }
      if (r.donnees?.envoye) {
        toast.ok(`« ${objet.trim() || "(sans objet)"} » est parti.`);
        onEnvoye();
      } else {
        toast.ok("Brouillon enregistré dans Outlook.");
        onEnregistre();
      }
      onFermer();
    } finally {
      setEnCours(false);
    }
  }

  const champ = (c: Champ, label: string, suffixe?: ReactNode) => (
    <ChampPersonnes
      champ={c}
      label={label}
      personnes={dest[c]}
      onChange={majChamp(c)}
      onDeplacer={(depuis, cle) => deplacer(depuis, cle, c)}
      placeholder="Nom ou adresse…"
      autoFocus={lignes.focus === c}
      {...(suffixe !== undefined ? { suffixe } : {})}
    />
  );
  const repliees = (["cc", "cci"] as LigneCopie[]).filter((l) => !lignes.visible(l));

  return (
    <div className="flex flex-col gap-4">
      <LigneExpediteur boite={e.boite} />
      {champ("a", "À", <LiensCopie lignes={repliees} onOuvrir={lignes.ouvrir} />)}
      {lignes.visible("cc") ? champ("cc", "Cc") : null}
      {lignes.visible("cci") ? champ("cci", "Cci") : null}
      <Input value={objet} onChange={(x) => setObjet(x.target.value)} placeholder="Objet du message" aria-label="Objet" />
      <div className="flex flex-col gap-1.5">
        <EditeurRiche html={html} onChange={setHtml} label="Message" hauteur="min-h-56" outils={<BoutonJoindre onFichiers={ajouterFichiers} desactive={enCours} />} />
        {e.pieces.length || fichiers.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {e.pieces.map((pj) => {
              const retiree = retirees.has(pj.id);
              return (
                <span key={pj.id} className={cn("inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full border border-line text-meta", retiree ? "text-ink-3 line-through" : "text-ink-2")}>
                  <span className="truncate max-w-[200px]">{pj.nom}</span>
                  <span className="text-ink-3">{formatTaille(pj.taille)}</span>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => setRetirees((s) => (s.has(pj.id) ? new Set([...s].filter((x) => x !== pj.id)) : new Set(s).add(pj.id)))}
                    title={retiree ? "Garder cette pièce" : "Retirer cette pièce du brouillon"}
                    className="px-1 text-ink-3 hover:text-ink no-underline"
                  >
                    {retiree ? "Garder" : <X strokeWidth={1.5} className="w-3 h-3" aria-label={`Retirer ${pj.nom}`} />}
                  </button>
                </span>
              );
            })}
            {fichiers.map((f, i) => (
              <span key={`${f.nom}-${i}`} className="relative inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full border border-line text-meta text-ink-2 overflow-hidden">
                {f.progres !== undefined ? (
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-green-50 transition-[width]" style={{ width: `${Math.round(f.progres * 100)}%` }} />
                ) : null}
                <span className="relative truncate max-w-[200px]">{f.nom}</span>
                <span className="relative text-ink-3">{f.progres !== undefined ? `${Math.round(f.progres * 100)} %` : formatTaille(f.taille)}</span>
                <button type="button" onClick={() => setFichiers((l) => l.filter((_, k) => k !== i))} disabled={enCours} aria-label={`Retirer ${f.nom}`} className="relative text-ink-3 hover:text-err-700">
                  <X strokeWidth={1.5} className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <p className="text-meta text-ink-3">
        {e.signature === "isolee" ? "Votre signature reste sous le texte, telle quelle." : e.signatureAjoutee ? "Votre signature sera ajoutée sous le texte." : null}
        {e.citation ? " L'historique de la conversation est gardé tel quel en dessous." : null}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-3">
        <Button type="button" variant="ghost" onClick={onFermer} disabled={enCours}>
          Annuler
        </Button>
        <Button type="button" variant="ghost" onClick={() => void valider(true)} disabled={enCours} title="Met à jour le brouillon dans Outlook, sans l'envoyer">
          Enregistrer
        </Button>
        <Button type="button" variant="primary" onClick={() => void valider(false)} disabled={enCours || !pretAEnvoyer} loading={enCours}>
          Envoyer
        </Button>
      </div>
    </div>
  );
}
