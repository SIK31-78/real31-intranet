import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant, estSuperAdmin } from "@/lib/auth/session";
import {
  boitesDe,
  coprosEchanges,
  rechercherEchanges,
  trouverEchange,
  utilisateurEchanges,
  type ResultatRecherche,
} from "@/lib/services/echanges/rechercher";
import type { CritereEchanges } from "@/lib/domain/echanges";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Callout } from "@/components/ui/callout";
import { Button } from "@/components/ui/button";
import { Choix, Field, Input } from "@/components/ui/field";
import { EchangesVue } from "@/components/echanges/echanges-vue";

export const metadata: Metadata = { title: "Échanges - REAL31 Intranet" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const un = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const plusieurs = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function EchangesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const u = await utilisateurEchanges(g, estSuperAdmin(g.email));
  const boites = u ? boitesDe(u) : [];
  if (!u || boites.length === 0) redirect("/accueil");

  const p = await searchParams;
  const critere: CritereEchanges = {
    ...(un(p.copro) ? { copro: un(p.copro)!.toUpperCase() } : {}),
    ...(un(p.qui) ? { correspondant: un(p.qui)! } : {}),
    ...(un(p.mots) ? { mots: un(p.mots)! } : {}),
    ...(un(p.du) ? { du: un(p.du)! } : {}),
    ...(un(p.au) ? { au: un(p.au)! } : {}),
  };
  // Boîtes cochées ; à la première visite, toutes celles qu'on a le droit de lire.
  const cochees = plusieurs(p.boite).map((b) => b.toLowerCase());
  const cibles = cochees.length ? cochees : boites.map((b) => b.adresse);
  const recherche = Object.keys(critere).length > 0;
  // Lien depuis un dossier : un mail précis, par son internetMessageId.
  const mid = un(p.mid);
  const boiteDuLien = cochees[0];

  const echec = (e: unknown): ResultatRecherche => ({
    echanges: [],
    erreurs: [e instanceof Error ? e.message : "La recherche n'a pas abouti."],
    adressesCopro: null,
    tronque: false,
  });
  const [copros, resultat] = await Promise.all([
    coprosEchanges().catch(() => []),
    mid && boiteDuLien
      ? trouverEchange(u, boiteDuLien, mid).then(
          (e): ResultatRecherche => ({
            echanges: e ? [e] : [],
            erreurs: e ? [] : ["Ce mail n'est plus dans la boîte (supprimé ou archivé ailleurs)."],
            adressesCopro: null,
            tronque: false,
          }),
          echec,
        )
      : recherche
        ? rechercherEchanges(u, critere, cibles).catch(echec)
        : null,
  ]);
  const coproChoisie = critere.copro ? copros.find((c) => c.reference.toUpperCase() === critere.copro) : undefined;

  return (
    <AppShell user={g} active="echanges" breadcrumb="Échanges">
      <Page largeur="travail">
        <PageHeader
          titre="Échanges"
          meta="Retrouver un mail reçu ou envoyé, par copropriété, correspondant, mot ou date."
          aide={
            <p className="max-w-[65ch] text-ink-2">
              La recherche porte sur toute la boîte : réception, dossiers des binômes et éléments envoyés. Par copropriété,
              elle retrouve les mails de toutes les adresses connues de la copropriété (copropriétaires, conseil syndical,
              locataires, d&apos;après ESTALE et Crypto) et ceux qui citent son code, même s&apos;ils n&apos;ont jamais été
              rangés. On voit la boîte commune de son agence et sa propre boîte.
            </p>
          }
        />

        <form method="get" className="rounded-lg border border-line bg-surface p-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Copropriété" htmlFor="copro">
              <Input id="copro" name="copro" list="copros-echanges" defaultValue={critere.copro ?? ""} placeholder="S247" autoComplete="off" />
            </Field>
            <Field label="Correspondant" htmlFor="qui">
              <Input id="qui" name="qui" defaultValue={critere.correspondant ?? ""} placeholder="Adresse ou nom" />
            </Field>
            <Field label="Mots" htmlFor="mots">
              <Input id="mots" name="mots" defaultValue={critere.mots ?? ""} placeholder="fuite, devis…" />
            </Field>
            <Field label="Du" htmlFor="du">
              <Input id="du" name="du" type="date" defaultValue={critere.du ?? ""} />
            </Field>
            <Field label="Au" htmlFor="au">
              <Input id="au" name="au" type="date" defaultValue={critere.au ?? ""} />
            </Field>
          </div>
          <datalist id="copros-echanges">
            {copros.map((c) => (
              <option key={c.reference} value={c.reference}>
                {c.nom}
              </option>
            ))}
          </datalist>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {boites.map((b) => (
              <Choix
                key={b.adresse}
                type="checkbox"
                name="boite"
                value={b.adresse}
                defaultChecked={cibles.includes(b.adresse)}
                label={b.nature === "commune" ? `${b.adresse} (commune)` : `${b.adresse} (ma boîte)`}
              />
            ))}
            <Button type="submit" variant="primary" size="sm" className="ml-auto">
              Chercher
            </Button>
          </div>
        </form>

        {!resultat && <p className="text-meta text-ink-2">Choisissez au moins un critère pour lancer la recherche.</p>}
        {resultat && (
          <>
            {resultat.erreurs.map((e) => (
              <Callout key={e} ton="warn">
                {e}
              </Callout>
            ))}
            <p className="text-meta text-ink-2">
              {resultat.echanges.length} échange{resultat.echanges.length > 1 ? "s" : ""}
              {coproChoisie && ` · ${coproChoisie.reference} ${coproChoisie.nom}`}
              {resultat.adressesCopro !== null && ` · ${resultat.adressesCopro} adresse${resultat.adressesCopro > 1 ? "s" : ""} connue${resultat.adressesCopro > 1 ? "s" : ""} pour la copropriété`}
              {resultat.tronque && " · affichage limité aux plus récents : affinez par date ou par mot"}
            </p>
            <EchangesVue echanges={resultat.echanges} plusieursBoites={cibles.length > 1} {...(critere.copro ? { coproParDefaut: critere.copro } : {})} />
          </>
        )}
      </Page>
    </AppShell>
  );
}
