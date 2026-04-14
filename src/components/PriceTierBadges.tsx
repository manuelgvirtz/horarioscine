import { formatPrice } from "@/lib/utils";
import type { PriceTiers } from "@/types";

export function PriceTierBadges({ tiers }: { tiers: PriceTiers }) {
  const entries = [
    tiers.general    != null && { label: "General",    price: tiers.general,    suffix: ""     },
    tiers.jubilado   != null && { label: "Jubilado",   price: tiers.jubilado,   suffix: ""     },
    tiers.menor      != null && { label: "Menor",      price: tiers.menor,      suffix: ""     },
    tiers.estudiante != null && { label: "Estudiante", price: tiers.estudiante, suffix: ""     },
    tiers.dosxuno    != null && { label: "2×1",        price: tiers.dosxuno,    suffix: " c/u" },
  ].filter(Boolean) as { label: string; price: number; suffix: string }[];

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(({ label, price, suffix }) => (
        <span
          key={label}
          className="inline-flex items-baseline gap-1.5 px-2 py-0.5 bg-surface-container-highest border border-outline-variant/20 rounded"
        >
          <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant/60 leading-none">{label}</span>
          <span className="text-xs font-black font-headline text-on-surface tabular-nums leading-none">
            {formatPrice(price)}<span className="text-[9px] font-medium text-on-surface-variant/60">{suffix}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
