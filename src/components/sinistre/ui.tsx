'use client';

/** Petits composants UI réutilisables (sobres, accessibles AA). */

import type { ReactNode } from 'react';
import { Glose } from './Glossaire';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-line bg-surface p-5 shadow-1 ${className}`}>
      {children}
    </div>
  );
}

export function References({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <p className="mt-3 text-xs text-ink-4">
      Références : {items.join(' · ')}
    </p>
  );
}

/** Encadré d'alerte visuellement distinct (étapes). */
export function AlertBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="note"
      className="mt-3 flex gap-2 rounded-md border-l-4 border-warn-500 bg-warn-50 p-3 text-sm text-warn-700"
    >
      <span>{typeof children === 'string' ? <Glose>{children}</Glose> : children}</span>
    </div>
  );
}

/** Liste à puces dont chaque item peut être glosé. */
export function GlosedList({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <ul className={`list-disc space-y-1 pl-5 text-sm text-ink-2 ${className}`}>
      {items.map((it, i) => (
        <li key={i}>
          <Glose>{it}</Glose>
        </li>
      ))}
    </ul>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-3">{children}</h3>;
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  title?: string;
  className?: string;
  'aria-label'?: string;
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  title,
  className = '',
  'aria-label': ariaLabel,
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-green-700 disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary: 'bg-green-700 text-white hover:bg-green-700',
    secondary: 'border border-line-2 bg-surface text-ink hover:bg-surface-2',
    ghost: 'text-green-700 hover:bg-green-50',
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}