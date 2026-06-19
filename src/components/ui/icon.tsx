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

type IconComp = ComponentType<{ className?: string; strokeWidth?: number }>;

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

export function Icon({
  name,
  className,
  strokeWidth = 1.5,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Comp = MAP[name] ?? FileText;
  return <Comp className={className} strokeWidth={strokeWidth} />;
}
