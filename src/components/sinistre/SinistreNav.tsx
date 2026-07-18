'use client';

// Sous-nav de la section Sinistre : barre d'onglets discrète (style natif
// intranet), rendue DANS le conteneur sous l'AppShell (qui fournit topbar +
// sidebar). next/link + usePathname pour l'onglet actif. Le bouton
// "+ Nouveau sinistre" repart du parcours guidé.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useDossier, nouveauDossier, purgerBrouillon, brouillonEntame } from '@/lib/domain/sinistre/state/store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/sinistre', label: 'Accueil', exact: true },
  { href: '/sinistre/wizard', label: 'Parcours guidé' },
  { href: '/sinistre/courriers', label: 'Courriers' },
];

export function SinistreNav() {
  const { state, dispatch } = useDossier();
  const router = useRouter();
  const pathname = usePathname();

  // « + Nouveau sinistre » n'est l'action PRINCIPALE que sur l'Accueil (par quoi
  // commencer). Ailleurs - et surtout dans le parcours - c'est une sortie
  // destructrice qui ne doit pas dominer « Continuer » : contour.
  const surAccueil = pathname === '/sinistre';

  function nouveau() {
    // Confirmation seulement s'il y a quelque chose à perdre : un clic accidentel
    // sur ce bouton (le plus voyant de l'écran) ne doit pas jeter une saisie en
    // cours. Un parcours vierge se remplace sans friction.
    if (brouillonEntame(state) &&
        !window.confirm('Démarrer un nouveau sinistre ? Le brouillon en cours sera effacé.')) {
      return;
    }
    purgerBrouillon();
    dispatch({ type: 'CHARGER', state: nouveauDossier() });
    router.push('/sinistre/wizard');
  }

  function estActif(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <div className="no-print mb-6 flex items-end justify-between gap-4 border-b border-line">
      <nav className="flex flex-wrap gap-1 text-[13px]">
        {NAV.map((n) => {
          const actif = estActif(n.href, n.exact);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'px-3 py-2 -mb-px border-b-2 transition-colors',
                actif
                  ? 'border-green-700 font-medium text-ink'
                  : 'border-transparent text-ink-3 hover:text-ink hover:border-line-2',
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <Button
        variant={surAccueil ? 'primary' : 'secondary'}
        size="sm"
        onClick={nouveau}
        className="mb-1.5 shrink-0"
      >
        + Nouveau sinistre
      </Button>
    </div>
  );
}
