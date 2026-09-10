// Squelette de chargement : garde le cadre du shell (rail + papier) pour que la
// navigation ne clignote pas. Voir components/layout/squelette-page.
import { SquelettePage } from "@/components/layout/squelette-page";

export default function Loading() {
  return <SquelettePage largeur="lecture" listes={[8]} />;
}
