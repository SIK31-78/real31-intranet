// Squelette de chargement : garde le cadre du shell (rail + papier) pendant la lecture de
// la boite (plusieurs secondes quand Graph traine). Voir components/layout/squelette-page.
import { SquelettePage } from "@/components/layout/squelette-page";

export default function Loading() {
  return <SquelettePage largeur="travail" listes={[8]} />;
}
