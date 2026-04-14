"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ZONES } from "@/types";
import { FilterDropdown } from "@/components/FilterDropdown";
import type { DropdownOption } from "@/components/FilterDropdown";

const TIPO_OPTIONS = [
  { value: "comercial", label: "Comercial" },
  { value: "independiente", label: "Independiente" },
];

function CinesFilterBarInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const zona = searchParams.get("zona") || "";
  const type = searchParams.get("type") || "";

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`/cines${params.toString() ? `?${params}` : ""}`, { scroll: false });
  };

  const zonaOptions: DropdownOption[] = [
    { value: "", label: "Todas" },
    ...ZONES.map((z) => ({ value: z, label: z })),
  ];

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <FilterDropdown
        label="Zona"
        selectedValue={zona}
        placeholder="Todas"
        options={zonaOptions}
        onChange={(v) => update("zona", v)}
        className="w-40 md:w-48"
      />

      <span className="w-px h-5 bg-outline-variant/30" aria-hidden="true" />

      <div className="flex items-center gap-1 bg-surface-container-highest rounded-full p-0.5 border border-outline-variant/30">
        {TIPO_OPTIONS.map((t) => (
          <button
            key={t.value}
            aria-pressed={type === t.value}
            onClick={() => update("type", type === t.value ? "" : t.value)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors min-h-[44px] md:min-h-0 flex items-center active:scale-95 ${
              type === t.value
                ? "bg-primary-container text-on-primary-container shadow-sm"
                : "text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CinesFilterBarSkeleton() {
  return (
    <div className="flex gap-3 items-center">
      <div className="h-10 w-36 rounded-xl bg-surface-container-high animate-pulse" />
      <div className="h-9 w-44 rounded-full bg-surface-container-high animate-pulse" />
    </div>
  );
}

export function CinesFilterBar() {
  return (
    <Suspense fallback={<CinesFilterBarSkeleton />}>
      <CinesFilterBarInner />
    </Suspense>
  );
}
