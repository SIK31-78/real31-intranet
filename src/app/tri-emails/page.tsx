import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { droitsTri } from "@/lib/auth/roles";
import { boitesTri } from "@/lib/domain/mail-gate";
import { boiteTriAccessible } from "@/lib/services/tri-emails/acces";
import { lireFileATrier, type FileATrier } from "@/lib/services/tri-emails/lire-file";
import { MAX_REPLI } from "@/lib/services/tri-emails/synchroniser-reception";
import { destinationsDeBascule } from "@/lib/services/tri-emails/basculer";
import { diagnosticAnnuaire } from "@/lib/services/synchro/surveiller-annuaire";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { TriEmailsVue } from "@/components/tri-emails/tri-emails-vue";

export const metadata: Metadata = { title: "Tri des e-mails - REAL31 Intranet" };

// La file est la boite de reception lue en direct : jamais de rendu statique.
export const dynamic = "force-dynamic";
// Lecture de la boite, du referentiel et du journal : plus que les 10 s par defaut d'une
// fonction Vercel quand Graph traine (27/10/2026).
export const maxDuration = 60;

/** « il y a 3 min » : l'age de la derniere lecture de la boite. */
function ilYA(iso: string, maintenant: number = Date.now()): string {
  const min = Math.floor((maintenant - Date.parse(iso)) / 60_000);
  if (Number.isNaN(min)) return "";
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.floor(h / 24)} j`;
}

/**
 * Index de la reception (REA-419, 27/10/2026) : « 220 mails à trier · à jour il y a 3 min ».
 * Repli (index absent) : « 12 mails dans la boîte de réception », et quand la lecture directe
 * est bornee, d'ou vient la borne.
 */
function metaFile(file: FileATrier): string {
  const n = file.mails.length;
  if (file.source === "index") {
    const base = `${n} ${n > 1 ? "mails" : "mail"} à trier`;
    return file.synchroniseLe ? `${base} · à jour ${ilYA(file.synchroniseLe)}` : base;
  }
  const base = `${n} ${n > 1 ? "mails" : "mail"} dans la boîte de réception`;
  if (!file.tronquee) return base;
  return file.totalReception !== null
    ? `${base} (les ${MAX_REPLI} plus récents, la boîte en contient ${file.totalReception} depuis la mise en service)`
    : `${base} (les ${MAX_REPLI} plus récents seulement)`;
}

/** Super-admin et plusieurs boites : un lien par boite, la boite affichee en premier plan. */
function ChoixBoite({ boites, active }: { boites: string[]; active: string }) {
  return (
    <nav aria-label="Boîte triée" className="flex flex-wrap items-center gap-1.5 text-meta">
      {boites.map((b) =>
        b === active ? (
          <span key={b} aria-current="page" className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-ink">
            {b}
          </span>
        ) : (
          <Link key={b} href={`/tri-emails?boite=${encodeURIComponent(b)}`} className="rounded-md px-2 py-0.5 font-mono text-ink-3 underline hover:text-ink">
            {b}
          </Link>
        ),
      )}
    </nav>
  );
}

export default async function TriEmailsPage({ searchParams }: { searchParams: Promise<{ boite?: string | string[] }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  // V2 (27/10/2026) : l'equipe syndic trie la boite de son agence (config MAIL_TRI_BOITES) ;
  // un super-admin choisit la boite par ?boite= (validee contre la config, defaut = la
  // premiere). Une boite demandee qui n'est pas la sienne : retour a l'accueil.
  const droits = droitsTri(g);
  const demandee = (await searchParams).boite;
  const config = await boiteTriAccessible(g, droits, typeof demandee === "string" ? demandee : null);
  if (!config) redirect("/accueil");
  const [file, annuaire] = await Promise.all([lireFileATrier(config), diagnosticAnnuaire()]);
  const autresBoites = droits.superAdmin ? boitesTri().map((b) => b.boite) : [];
  // Boîtes vers lesquelles un mail peut basculer (ADR-050) : vide tant que l'écriture est coupée.
  const bascules = destinationsDeBascule(file.boite);

  return (
    <AppShell user={g} active="tri-emails" breadcrumb="Tri des e-mails">
      <Page largeur="travail">
        <PageHeader
          titre="Tri des e-mails"
          badge={<Badge ton="outline">{file.boite === "echantillon" ? "Échantillon fictif" : file.boite}</Badge>}
          meta={metaFile(file)}
          {...(autresBoites.length > 1 ? { actions: <ChoixBoite boites={autresBoites} active={file.boite} /> } : {})}
          aide={
            <p className="max-w-[65ch] text-ink-2">
              La file, c&apos;est la boîte de réception de la boîte partagée de l&apos;agence. Pour chaque mail, l&apos;intranet propose
              une copropriété, ESTALE ou Crypto ; en le rangeant, le mail part dans le dossier du binôme (ou dans
              Comptabilité / Divers), où l&apos;équipe le traite et y répond depuis Outlook. L&apos;onglet « Rangés
              sur 7 jours » sert à la revue du vendredi : chaque rangement y montre le signal qui l&apos;a proposé.
            </p>
          }
        />
        {file.simulation && (
          <Callout ton="info" titre="Mode simulation.">
            {" "}Les rangements sont notés au journal, mais aucun mail ne bouge dans la boîte.
          </Callout>
        )}
        {file.erreur && <Callout ton="warn">{file.erreur}</Callout>}
        {annuaire.alerte && (
          <Callout ton="warn" titre="Annuaire des expéditeurs Crypto pas à jour.">
            {" "}{annuaire.raisons.join(" ")} Pour relancer : double-clic sur{" "}
            <code>scripts\sync-annuaire-crypto.cmd</code>, sur le PC qui synchronise l&apos;export Crypto.
          </Callout>
        )}
        <TriEmailsVue file={file} binomesModifiables={droits.superAdmin} bascules={bascules} />
      </Page>
    </AppShell>
  );
}
