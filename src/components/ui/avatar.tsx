import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

// Avatars sans photo : initiales sur fond teinte. Meme formule oklch, seul le hue change
// par gestionnaire (EL vert / SK bleu / FA orange...). Fallback = vert brand.
const HUES: Record<string, number> = { el: 155, sk: 245, fa: 60 };

function hueStyle(hue: number): CSSProperties {
  return {
    background: `oklch(0.93 0.04 ${hue})`,
    color: `oklch(0.34 0.06 ${hue})`,
    borderColor: `oklch(0.85 0.06 ${hue})`,
  };
}

type AvatarProps = {
  initiales: string;
  /** Cle de teinte ; sinon derivee des initiales en minuscules. */
  hue?: string;
  size?: "md" | "lg";
  title?: string;
  className?: string;
};

export function Avatar({ initiales, hue, size = "md", title, className }: AvatarProps) {
  const key = (hue ?? initiales).toLowerCase();
  const h = HUES[key] ?? 155;
  return (
    <span
      title={title}
      style={hueStyle(h)}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold border tracking-[0.02em] shrink-0",
        size === "lg" ? "w-8 h-8 text-[12px]" : "w-6 h-6 text-[11px]",
        className,
      )}
    >
      {initiales}
    </span>
  );
}
