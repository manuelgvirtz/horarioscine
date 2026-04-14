import { Suspense } from "react";
import dynamic from "next/dynamic";
import { getMovies } from "@/lib/queries";
import { MovieCard } from "@/components/MovieCard";
import { DatePicker } from "@/components/DatePicker";
import { DatePickerSkeleton, FilterBarSkeleton } from "@/components/Skeletons";

const FilterBar = dynamic(
  () => import("@/components/FilterBar").then((m) => ({ default: m.FilterBar })),
  { ssr: false, loading: () => <FilterBarSkeleton /> }
);
import { getToday, getNextDays, formatDateDisplay, getCurrentArgTime } from "@/lib/utils";
import Link from "next/link";
import type { FilterParams } from "@/types";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const date = (searchParams.date as string) || getToday();
  const params: FilterParams = {
    date,
    zona: searchParams.zona as string,
    cinema_id: searchParams.cinema_id as string,
    movie_id: searchParams.movie_id as string,
    format: searchParams.format as string,
    language: searchParams.language as string,
    type: searchParams.type as string,
    minTime: date === getToday() ? getCurrentArgTime() : undefined,
  };

  // Carry active filters over to movie pages (all except movie_id — that's implicit)
  const filterParamsStr = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([k, v]) => k !== "movie_id" && v)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString();

  const movies = await getMovies(params);

  // For empty state: build a "tomorrow" link preserving non-date filters
  const hasActiveFilters = !!(params.zona || params.cinema_id || params.movie_id || params.format || params.language || params.type);
  const tomorrow = getNextDays(2)[1]?.date;
  const tomorrowParams = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([k, v]) => k !== "movie_id" && v)
        .map(([k, v]) => [k, String(v)])
    )
  );
  if (tomorrow) tomorrowParams.set("date", tomorrow);
  const clearFiltersParams = new URLSearchParams();
  if (params.date) clearFiltersParams.set("date", params.date);

  return (
    <>
      <div className="md:hidden mb-4 flex flex-col gap-2">
        <Suspense fallback={<DatePickerSkeleton />}>
          <DatePicker />
        </Suspense>
        <div className="flex items-center gap-2">
          <Link
            href="/cines"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold text-on-surface-variant hover:text-on-surface bg-surface-container-low hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-base leading-none">theaters</span>
            Cines
          </Link>
          <Link
            href="/estrenos"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold text-on-surface-variant hover:text-on-surface bg-surface-container-low hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-base leading-none">fiber_new</span>
            Estrenos
          </Link>
        </div>
      </div>

      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBar />
      </Suspense>

      {movies.length > 0 && (
        <p className="text-xs font-medium text-on-surface-variant/60 tracking-wide mb-2 -mt-2">
          {movies.length} {movies.length === 1 ? "película" : "películas"} · {formatDateDisplay(params.date || getToday()).toLowerCase()}
        </p>
      )}

      {movies.length === 0 ? (
        <div className="rounded-xl bg-surface-container px-8 py-12 text-center flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant" aria-hidden="true">
            movie_filter
          </span>
          <p className="text-on-surface-variant font-semibold">
            No hay funciones para los filtros seleccionados.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mt-1">
            {tomorrow && (
              <Link
                href={`/?${tomorrowParams.toString()}`}
                className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface text-sm font-bold hover:bg-surface-bright transition-colors"
              >
                Ver mañana →
              </Link>
            )}
            {hasActiveFilters && (
              <Link
                href={`/?${clearFiltersParams.toString()}`}
                className="px-4 py-2 rounded-lg border border-outline-variant/40 text-on-surface-variant text-sm font-bold hover:text-on-surface hover:border-outline transition-colors"
              >
                Limpiar filtros
              </Link>
            )}
          </div>
        </div>
      ) : (
        <section aria-label="Cartelera" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
          {movies.map((movie, i) => (
            <MovieCard key={movie.id} movie={movie} filterParams={filterParamsStr} priority={i < 4} />
          ))}
        </section>
      )}
    </>
  );
}
