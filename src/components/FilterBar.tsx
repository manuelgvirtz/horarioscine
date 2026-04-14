"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { ZONES, FORMATS, LANGUAGES } from "@/types";
import type { Cinema, Movie } from "@/types";
import { FilterDropdown } from "./FilterDropdown";
import type { DropdownOption } from "./FilterDropdown";

const TIPO_OPTIONS: { value: "" | "comercial" | "independiente"; label: string }[] = [
  { value: "comercial", label: "Comercial" },
  { value: "independiente", label: "Independiente" },
];

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const zona     = searchParams.get("zona")     || "";
  const cinemaId = searchParams.get("cinema_id") || "";
  const movieId  = searchParams.get("movie_id")  || "";
  const format   = searchParams.get("format")    || "";
  const language = searchParams.get("language")  || "";
  const type     = searchParams.get("type")      || "";
  const date     = searchParams.get("date")      || "";

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
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (cinemaId) params.set("cinema_id", cinemaId);
    fetch(`/api/movies${params.toString() ? `?${params}` : ""}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: Movie[]) => setMovies([...data].sort((a, b) => a.title.localeCompare(b.title, "es"))))
      .catch((e) => { if (e.name !== "AbortError") console.error(e); });
    return () => controller.abort();
  }, [date, cinemaId]);

  const selectedCinemaName = cinemas.find((c) => String(c.id) === cinemaId)?.name ?? "";
  const selectedMovieTitle = movies.find((m) => String(m.id) === movieId)?.title  ?? "";

  const activeChipsCount = [format, language, type].filter(Boolean).length;
  const showChips = showMoreFilters || activeChipsCount > 0;

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value); else params.delete(key);
      if (key === "zona") params.delete("cinema_id");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // ── Option lists ──────────────────────────────────────────────────
  const zonaOptions: DropdownOption[] = [
    { value: "", label: "Todas" },
    ...ZONES.map((z) => ({ value: z, label: z })),
  ];

  const cinemaOptions: DropdownOption[] = [
    { value: "", label: "Todos" },
    ...cinemas.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const movieOptions: DropdownOption[] = [
    { value: "", label: "Todas" },
    ...movies.map((m) => ({ value: String(m.id), label: m.title })),
  ];

  return (
    <section aria-label="Filtros" className="mb-6 md:mb-12">
      {/* ── Row 1: dropdowns ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
        <FilterDropdown
          label="Zona"
          selectedValue={zona}
          placeholder="Todas"
          options={zonaOptions}
          onChange={(v) => updateParam("zona", v)}
        />

        <FilterDropdown
          label="Cine"
          selectedValue={cinemaId}
          displayValue={selectedCinemaName}
          placeholder="Todos"
          options={cinemaOptions}
          onChange={(v) => updateParam("cinema_id", v)}
        />

        <FilterDropdown
          label="Película"
          shortLabel="Peli"
          selectedValue={movieId}
          displayValue={selectedMovieTitle}
          placeholder="Todas"
          options={movieOptions}
          onChange={(v) => updateParam("movie_id", v)}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* ── Mobile toggle for chip filters ── */}
      <div className="md:hidden mb-3">
        <button
          onClick={() => setShowMoreFilters((s) => !s)}
          aria-expanded={showChips}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
            activeChipsCount > 0
              ? "border border-primary/30 text-primary bg-primary/10"
              : "border border-outline-variant/30 text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">tune</span>
          {activeChipsCount > 0
            ? `Filtros · ${activeChipsCount} activo${activeChipsCount > 1 ? "s" : ""}`
            : showMoreFilters
            ? "Ocultar filtros"
            : "Más filtros"}
        </button>
      </div>

      {/* ── Row 2: chips — always visible md+, toggle on mobile ── */}
      <div className={`flex-wrap gap-3 items-center ${showChips ? "flex" : "hidden md:flex"}`}>
        {/* Tipo */}
        <div className="flex items-center gap-1 bg-surface-container-highest rounded-full p-0.5 border border-outline-variant/30">
          {TIPO_OPTIONS.map((t) => (
            <button
              key={t.value}
              aria-pressed={type === t.value}
              onClick={() => updateParam("type", type === t.value ? "" : t.value)}
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

        <span className="w-px h-5 bg-outline-variant/30" aria-hidden="true" />

        {/* Formato */}
        {FORMATS.map((f) => (
          <button
            key={f}
            aria-pressed={format === f}
            onClick={() => updateParam("format", format === f ? "" : f)}
            className={`px-4 py-3 md:py-1.5 rounded-full text-xs font-bold transition-colors min-h-[44px] md:min-h-0 flex items-center ${
              format === f
                ? f === "IMAX"
                  ? "bg-tertiary-container text-on-tertiary-container font-black tracking-widest"
                  : "bg-primary-container text-on-primary-container"
                : "text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface"
            }`}
          >
            {f}
          </button>
        ))}

        <span className="w-px h-5 bg-outline-variant/30" aria-hidden="true" />

        {/* Idioma */}
        {LANGUAGES.map(({ value, label }) => (
          <button
            key={value}
            aria-pressed={language === value}
            onClick={() => updateParam("language", language === value ? "" : value)}
            className={`px-4 py-3 md:py-1.5 rounded-full text-xs font-bold transition-colors min-h-[44px] md:min-h-0 flex items-center ${
              language === value
                ? "bg-primary-container text-on-primary-container"
                : "text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
