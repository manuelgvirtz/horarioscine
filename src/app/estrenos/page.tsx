import { Suspense } from "react";
import { getMoviesSortedByRelease } from "@/lib/queries";
import { MovieCard } from "@/components/MovieCard";
import { DatePicker } from "@/components/DatePicker";
import { DatePickerSkeleton } from "@/components/Skeletons";
import { getToday, getCinemaWeek } from "@/lib/utils";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Estrenos — cartelera.ar",
  description: "Películas en cartelera ordenadas por fecha de estreno.",
};

export default async function EstrenosPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const date = searchParams.date || getToday();
  const { thisWeekStart, thisWeekEnd } = getCinemaWeek(date);
  const movies = await getMoviesSortedByRelease(thisWeekStart, thisWeekEnd);

  return (
    <>
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors font-semibold mb-4"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
        Cartelera
      </Link>

      <div className="md:hidden mb-4">
        <Suspense fallback={<DatePickerSkeleton />}>
          <DatePicker />
        </Suspense>
      </div>

      {movies.length > 0 && (
        <p className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest mb-2">
          {movies.length} {movies.length === 1 ? "estreno" : "estrenos"} · semana del {new Date(thisWeekStart + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
        </p>
      )}

      {movies.length === 0 ? (
        <div className="rounded-xl bg-surface-container px-8 py-12 text-center flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant" aria-hidden="true">
            movie_filter
          </span>
          <p className="text-on-surface-variant font-semibold">
            No hay funciones para esta fecha.
          </p>
        </div>
      ) : (
        <section aria-label="Estrenos" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
          {movies.map((movie, i) => (
            <MovieCard key={movie.id} movie={movie} priority={i < 4} />
          ))}
        </section>
      )}
    </>
  );
}
