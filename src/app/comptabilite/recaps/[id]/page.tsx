import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, Hammer, MessageSquareQuote, Receipt, Wallet } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estComptable, peutVoirComptabilite } from "@/lib/auth/roles";
import { getRecapRecu, type RecapRecuDetail } from "@/lib/services/compta/recaps-recus";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BoutonRecapTraite } from "@/components/compta/bouton-recap-traite";
import { formatEuros, formatHeures } from "@/lib/services/facturation/format";
import { formatDateLongue } from "@/lib/format-date";
import { Page, PageHeader } from "@/components/ui/page";

export const metadata: Metadata = { title: "Récap d'AG - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Vue LECTURE SEULE du recap, organisee autour de ce que le comptable doit FAIRE (saisir
// le budget vote, le fonds travaux, les appels de fonds des travaux votes, ouvrir le
// nouveau contrat) - pas comme un proces-verbal a lire.
//
// Route a part, VOLONTAIREMENT : /compta/[code__agDate] est le dossier de PREPARATION
// d'AVANT l'AG. Melanger les deux moments sur une meme page est exactement le flou de
// parcours qu'on retire.

/** Un booleen saisi (Oui / Non) ou jamais renseigne. */
function oui(v: boolean | undefined): string {
  return v === undefined ? "non renseigné" : v ? "Oui" : "Non";
}

function pourcent(v: number | undefined): string {
  return v === undefined ? "non renseigné" : `${String(v).replace(".", ",")} %`;
}

function euros(v: number | undefined): string {
  return v === undefined ? "non renseigné" : formatEuros(v);
}

function Champ({ libelle, valeur, fort }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-body text-ink-3">{libelle}</dt>
      <dd className={`text-body ${fort ? "font-semibold text-ink" : "text-ink"}`}>{valeur}</dd>
    </div>
  );
}

function Bloc({
  titre,
  icone,
  aide,
  children,
}: {
  titre: string;
  icone: React.ReactNode;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-0.5 sm:flex-row sm:items-center">
        <CardTitle className="flex items-center gap-2">
          {icone}
          {titre}
        </CardTitle>
        {aide && <span className="text-body text-ink-3">{aide}</span>}
      </CardHeader>
      <div className="px-4 py-3">{children}</div>
    </Card>
  );
}

function TableauTravaux({ recap }: { recap: RecapRecuDetail }) {
  return (
    // Tableau large : il scrolle DANS son conteneur, la page ne part jamais en travers.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-body">
        <thead>
          <tr className="text-body text-ink-3">
            <th className="py-1.5 pr-3 font-medium">Résolution</th>
            <th className="py-1.5 pr-3 font-medium">Travaux</th>
            <th className="py-1.5 pr-3 font-medium">Budget voté</th>
            <th className="py-1.5 pr-3 font-medium">Clé de répartition</th>
            <th className="py-1.5 font-medium">Appel de fonds</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {recap.travaux.map((t, i) => (
            <tr key={`${t.libelle}-${i}`} className="align-top">
              <td className="py-2 pr-3 font-mono text-body text-ink-2">
                {t.numeroResolution ?? "-"}
              </td>
              <td className="py-2 pr-3 text-ink">{t.libelle}</td>
              <td className="py-2 pr-3 whitespace-nowrap text-ink">
                {t.budget === undefined ? "-" : formatEuros(t.budget)}
              </td>
              <td className="py-2 pr-3 text-ink-2">{t.cleRepartition ?? "-"}</td>
              <td className="py-2 text-ink-2">{t.modalitesAppelFonds ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function RecapRecuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  // Le service applique le MEME cadrage que la file (agences du comptable / portefeuille
  // du gestionnaire) : un recap hors perimetre est introuvable, pas seulement invisible.
  const recap = await getRecapRecu(id, {
    managerId: g.id,
    email: g.email,
    estComptable: estComptable(g.email, g.role),
  });
  if (!recap) notFound();

  // Fermer la boucle est un geste du pole comptable ; le gestionnaire, lui, relit son
  // recap (meme page, sans le bouton). L'action reverifie ce role cote serveur.
  const peutMarquer = peutVoirComptabilite(g.email, g.role);

  return (
    <AppShell user={g} active="recaps-recus" breadcrumb={`Récap d'AG · ${recap.coproCode}`}>
      <Page largeur="lecture">
        <PageHeader
          eyebrow={
            <Link href="/comptabilite/recaps" className="inline-flex items-center gap-1 hover:text-ink">
              <ArrowLeft strokeWidth={1.5} className="h-3 w-3" /> Récaps d&apos;AG reçus
            </Link>
          }
          titre={recap.coproNom}
          code={recap.coproCode}
          meta={`AG tenue le ${formatDateLongue(recap.agDate)} · récap reçu le ${formatDateLongue(recap.creeLe.slice(0, 10))}${recap.par ? ` · ${recap.par}` : ""}`}
        />

        <div className="flex flex-wrap items-center gap-3">
          {recap.traiteLe ? (
            <Badge ton="ok" dot>
              Traité {recap.traitePar ? `par ${recap.traitePar} ` : ""}le{" "}
              {formatDateLongue(recap.traiteLe.slice(0, 10))}
            </Badge>
          ) : (
            <Badge ton="warn" dot>À traiter</Badge>
          )}
          {peutMarquer && <BoutonRecapTraite recapId={recap.id} traite={Boolean(recap.traiteLe)} />}
        </div>

        {/* Le message libre du gestionnaire : c'est ce qu'il a voulu DIRE au comptable,
            il passe avant les champs structures. */}
        {recap.infoComptable && (
          <Card className="border-info-500/30 bg-info-50">
            <div className="flex gap-2.5 px-4 py-3">
              <MessageSquareQuote
                strokeWidth={1.5}
                className="mt-0.5 h-4 w-4 shrink-0 text-info-700"
              />
              <div className="min-w-0">
                <p className="text-body font-semibold text-info-700">
                  Message du gestionnaire à la comptabilité
                </p>
                <p className="mt-1 whitespace-pre-wrap text-body text-ink">
                  {recap.infoComptable}
                </p>
              </div>
            </div>
          </Card>
        )}

        <Bloc
          titre="Budget et fonds travaux"
          aide="à saisir"
          icone={<Wallet strokeWidth={1.5} className="h-4 w-4 text-green-700" />}
        >
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Champ libelle="Budget voté" valeur={euros(recap.montantBudget)} fort />
            <Champ libelle="Évolution du budget" valeur={pourcent(recap.pourcentageBudget)} />
            <Champ
              libelle="Budget modifié en séance"
              valeur={oui(recap.budgetModifie)}
            />
            <Champ libelle="Fonds travaux (ALUR)" valeur={oui(recap.fondsTravaux)} fort />
            <Champ libelle="PPT voté" valeur={oui(recap.pptVote)} />
            <Champ libelle="Pourcentage PPT" valeur={pourcent(recap.pourcentagePpt)} />
            <Champ libelle="Montant PPT" valeur={euros(recap.montantPpt)} />
            <Champ libelle="Comptes approuvés" valeur={oui(recap.comptesApprouves)} />
            <Champ libelle="Réserves" valeur={recap.reserves ?? "aucune"} />
          </dl>
        </Bloc>

        <Bloc
          titre="Travaux votés"
          aide={
            recap.travaux.length > 0
              ? "appels de fonds à préparer, par résolution"
              : undefined
          }
          icone={<Hammer strokeWidth={1.5} className="h-4 w-4 text-green-700" />}
        >
          {recap.travaux.length === 0 ? (
            <p className="text-body text-ink-3">Aucun travaux voté à cette assemblée.</p>
          ) : (
            <TableauTravaux recap={recap} />
          )}
        </Bloc>

        <Bloc
          titre="Nouveau cycle de contrat"
          icone={<FileText strokeWidth={1.5} className="h-4 w-4 text-green-700" />}
        >
          <p className="text-body text-ink">
            {recap.suiviContratId
              ? "Un nouveau cycle de contrat a été ouvert à l'enregistrement du récap (honoraires et frais postaux sur le suivi des contrats)."
              : "Aucun cycle de contrat ouvert à la saisie du récap : à ouvrir si l'assemblée a renouvelé le mandat."}
          </p>
        </Bloc>

        {/* Le depassement est deja porte par la facturation : ici il n'est qu'un rappel,
            pour que le comptable sache si une facture existe sur cette AG. */}
        <Bloc
          titre="Dépassement horaire"
          aide="déjà traité par la facturation"
          icone={<Receipt strokeWidth={1.5} className="h-4 w-4 text-ink-3" />}
        >
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Champ
              libelle="Dépassement"
              valeur={
                recap.depassementHeures > 0 ? formatHeures(recap.depassementHeures) : "aucun"
              }
            />
            <Champ
              libelle="Montant TTC"
              valeur={recap.depassementTtc > 0 ? formatEuros(recap.depassementTtc) : "-"}
            />
            <Champ libelle="Facture" valeur={recap.factureId ? "émise" : "aucune"} />
          </dl>
        </Bloc>
      </Page>
    </AppShell>
  );
}
