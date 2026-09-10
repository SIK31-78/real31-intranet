import type { ComponentType } from "react";
import {
  Send,
  CalendarClock,
  AlertTriangle,
  FileCheck,
  Mail,
  Banknote,
  Vote,
  FileText,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  CheckCircle,
  CircleHelp,
} from "lucide-react";
import { cn } from "@/lib/cn";

type IconComp = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

// Registre des icones referencees par nom (string) dans les donnees metier.
const MAP: Record<string, IconComp> = {
  send: Send,
  "calendar-clock": CalendarClock,
  "alert-triangle": AlertTriangle,
  "file-check": FileCheck,
  mail: Mail,
  banknote: Banknote,
  vote: Vote,
  "file-text": FileText,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "message-square": MessageSquare,
  "check-circle": CheckCircle,
  "circle-help": CircleHelp,
};

// Trois tailles : 14 (dans un bouton / une ligne), 16 (a cote d'un titre), 20 (etat vide).
const SIZES = { 14: "w-3.5 h-3.5", 16: "w-4 h-4", 20: "w-5 h-5" } as const;

export function Icon({
  name,
  size = 14,
  className,
  strokeWidth = 1.5,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
  strokeWidth?: number;
}) {
  const Comp = MAP[name] ?? FileText;
  return <Comp className={cn(SIZES[size], "shrink-0", className)} strokeWidth={strokeWidth} aria-hidden />;
}
