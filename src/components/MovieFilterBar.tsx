"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { ZONES, FORMATS, LANGUAGES } from "@/types";
import type { Cinema } from "@/types";
import { FilterDropdown } from "./FilterDropdown";
import type { DropdownOption } from "./FilterDropdown";

export function MovieFilterBar({ movieId, date: initialDate }: { movieId: number; date: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [availableFormats, setAvailableFormats]   = useState<Set<string> | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<Set<string> | null>(null);

  const zona     = searchParams.get("zona")      || "";
  const cinemaId = searchParams.get("cinema_id") || "";
  const format   = searchParams.get("format")    || "";
  const language = searchParams.get("language")  || "";
  const date     = searchParams.get("date")      || initialDate;

  useEffect(() => {
    const controller = new AbortController();
    const url = zona ? `/api/cinemas?zona=${encodeURIComponent(zona)}` : "/api/cinemas";
    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then(setCinemas)
      .catch((e) => { if (e.name !== "AbortError") console.error(e); });
    return () => controller.abort();
  }, [zona]);

  useEffect(() => {
    const controller = new AbortController();
    const p = new URLSearchParams({ movie_id: String(movieId), date });
    if (zona) p.set("zona", zona);
    if (cinemaId) p.set("cinema_id", cinemaId);
    fetch(`/api/showtimes?${p}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { format: string; language: string }[]) => {
        setAvailableFormats(new Set(data.map((s) => s.format)));
        setAvailableLanguages(new Set(data.map((s) => s.language)));
      })
      .catch((e) => { if (e.name !== "AbortError") console.error(e); });
    return () => controller.abort();
  }, [movieId, date, zona, cinemaId]);

  const selectedCinemaName = cinemas.find((c) => String(c.id) === cinemaId)?.name ?? "";

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value); else params.delete(key);
      if (key === "zona") params.delete("cinema_id");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const zonaOptions: DropdownOption[] = [
    { value: "", label: "Todas" },
    ...ZONES.map((z) => ({ value: z, label: z })),
  ];

  const cinemaOptions: DropdownOption[] = [
    { value: "", label: "Todos" },
    ...cinemas.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const pillClass = (active: boolean, special?: boolean) =>
    `px-3 py-3 md:py-1.5 rounded-full text-[11px] md:text-xs font-bold transition-colors min-h-[44px] md:min-h-0 flex items-center ${
      active
        ? special
          ? "bg-tertiary-container text-on-tertiary-container font-black tracking-widest"
          : "bg-primary-container text-on-primary-container"
        : special
          ? "border border-outline-variant/20 text-on-surface-variant/50 hover:bg-tertiary-container hover:text-on-tertiary-container hover:border-transparent"
          : "border border-outline-variant/40 text-on-surface-variant hover:bg-primary-container hover:text-on-primary-container hover:border-transparent"
    }`;

  return (
    <div className="flex flex-wrap gap-2 md:gap-3 items-center mb-6">
      <div className="grid grid-cols-2 gap-2 w-full md:contents">
        <FilterDropdown
          label="Zona"
          selectedValue={zona}
          placeholder="Todas"
          options={zonaOptions}
          onChange={(v) => updateParam("zona", v)}
          className="md:min-w-[280px]"
        />

        <FilterDropdown
          label="Cine"
          selectedValue={cinemaId}
          displayValue={selectedCinemaName}
          placeholder="Todos"
          options={cinemaOptions}
          onChange={(v) => updateParam("cinema_id", v)}
          className="md:min-w-[280px]"
        />
      </div>

      <span className="w-px h-5 bg-outline-variant/30 hidden md:block" aria-hidden="true" />

      {FORMATS
        .filter((f) => availableFormats === null || availableFormats.has(f))
        .map((f) => (
          <button
            key={f}
            aria-pressed={format === f}
            onClick={() => updateParam("format", format === f ? "" : f)}
            className={pillClass(format === f, ["IMAX", "4DX"].includes(f))}
          >
            {f}
          </button>
        ))}

      <span className="w-px h-5 bg-outline-variant/30 hidden md:block" aria-hidden="true" />

      {LANGUAGES
        .filter(({ value }) => availableLanguages === null || availableLanguages.has(value))
        .map(({ value, label }) => (
          <button
            key={value}
            aria-pressed={language === value}
            onClick={() => updateParam("language", language === value ? "" : value)}
            className={pillClass(language === value)}
          >
            {label}
          </button>
        ))}
    </div>
  );
}
