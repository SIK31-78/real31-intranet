'use client';

// Frontière client de la section Sinistre : fournit le contexte du dossier
// (DossierProvider) sous l'AppShell (Server Component async). La sous-nav et le
// contenu vivent à l'intérieur pour partager le même état de dossier.

import type { ReactNode } from 'react';
import { DossierProvider } from '@/lib/domain/sinistre/state/store';
import { SinistreNav } from '@/components/sinistre/SinistreNav';

export function SinistreProviders({ children }: { children: ReactNode }) {
  return (
    <DossierProvider>
      <SinistreNav />
      {children}
    </DossierProvider>
  );
}
