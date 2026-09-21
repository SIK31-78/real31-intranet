"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cloturerDelegationAction } from "./actions";

export function RetirerDelegation({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        demarrer(async () => {
          const res = await cloturerDelegationAction(id);
          if (!res.ok) return toast.err(res.erreur);
          toast.ok("Délégation retirée.");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <X strokeWidth={1.5} />} Retirer
    </Button>
  );
}
