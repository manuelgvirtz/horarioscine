import { cache } from "react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getMovieBySlug, getShowtimesGroupedByCinema, getPricesByFormat } from "@/lib/queries";
import { formatDuration, getToday, formatDateDisplay, getCurrentArgTime } from "@/lib/utils";
import Image from "next/image";
import { RatingsHero } from "@/components/RatingsHero";
import { MovieDetails } from "@/components/MovieDetails";
import { ShowtimeCinemaCard } from "@/components/ShowtimeCinemaCard";
import dynamic from "next/dynamic";
import { DatePicker } from "@/components/DatePicker";
import { DatePickerSkeleton, MovieFilterBarSkeleton } from "@/components/Skeletons";

const MovieFilterBar = dynamic(
  () => import("@/components/MovieFilterBar").then((m) => ({ default: m.MovieFilterBar })),
  { ssr: false, loading: () => <MovieFilterBarSkeleton /> }
);
import Link from "next/link";
import type { Metadata } from "next";
import type { CastMember, PricesByFormat } from "@/types";

// Deduplicate DB call between generateMetadata and the page component
const getMovie = cache((slug: string) => getMovieBySlug(slug));

interface Props {
  params: { slug: string };
  searchParams: { date?: string; zona?: string; cinema_id?: string; format?: string; language?: string; type?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const movie = await getMovie(params.slug);
  if (!movie) return { title: "Película no encontrada" };
  return {
    title: `${movie.title} — Horarios | cartelera.ar`,
    description: movie.synopsis || `Horarios de ${movie.title} en cines argentinos`,
  };
}

export default async function MoviePage({ params, searchParams }: Props) {
  const movie = await getMovie(params.slug);
  if (!movie) notFound();

  const date = searchParams.date || getToday();
  const minTime = date === getToday() ? getCurrentArgTime() : undefined;
  const grouped = await getShowtimesGroupedByCinema(movie.id, date, {
    zona: searchParams.zona,
    cinema_id: searchParams.cinema_id,
    format: searchParams.format,
    language: searchParams.language,
    type: searchParams.type,
    minTime,
  });

  const CHAINS_WITHOUT_PRICES = new Set<string>();

  // Fetch prices per unique cinema (prefers cinema-specific, falls back to chain-wide)
  const uniqueCinemas = Array.from(
    new Map(grouped.map((g) => [g.cinema.id, g.cinema])).values()
  );
  const pricesByCinema: Record<number, PricesByFormat> = {};
  await Promise.all(
    uniqueCinemas.map(async (cinema) => {
      if (CHAINS_WITHOUT_PRICES.has(cinema.chain)) return;
      pricesByCinema[cinema.id] = await getPricesByFormat(cinema.chain, date, cinema.id);
    })
  );

  // Build "back to cartelera" URL preserving active filters
  const backParams = new URLSearchParams(
    Object.fromEntries(
      Object.entries(searchParams).filter(([, v]) => v).map(([k, v]) => [k, String(v)])
    )
  ).toString();

  const todayLabel = formatDateDisplay(date);

  // Tomorrow date string for empty state CTA
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + 1);
  const tomorrowStr = d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

  const hasActiveFilters = !!(searchParams.format || searchParams.language || searchParams.zona || searchParams.cinema_id);

  // Parse cast members: prefer structured castJson, fall back to comma-separated cast string
  const castMembers: CastMember[] = movie.castJson
    ? (JSON.parse(movie.castJson) as CastMember[])
    : (movie.cast?.split(",").map((name) => ({ name: name.trim(), profileUrl: null })) ?? []);

  return (
    <>
      {/* Back navigation — above hero */}
      <div className="mb-3">
        <Link
          href={backParams ? `/?${backParams}` : "/"}
          className="inline-flex items-center gap-1.5 py-3 text-on-surface hover:text-primary text-sm font-bold transition-colors"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_back</span>
          Cartelera
        </Link>
      </div>

      <section className="relative w-full overflow-hidden rounded-2xl">
        {/* Blurred backdrop — always present */}
        <div className="absolute inset-0 z-0">
          {movie.posterUrl && (
            <Image
              src={movie.posterUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              quality={30}
              className="object-cover blur-2xl opacity-40 scale-110"
              priority
            />
          )}
          <div className="absolute inset-0 hero-gradient" />
        </div>

        {/* Mobile-only: full-bleed poster fill with bottom gradient */}
        {movie.posterUrl && (
          <div className="md:hidden absolute inset-0 z-0">
            <Image
              src={movie.posterUrl}
              alt=""
              fill
              sizes="100vw"
              className="object-cover object-top"
              priority
            />
            <div className="hero-gradient-mobile absolute inset-0" />
          </div>
        )}

        {/* Single content container — responsive layout eliminates DOM duplication */}
        <div className="relative z-10 flex min-h-[520px] md:min-h-0 md:mx-auto md:px-8 md:py-10 md:max-w-6xl md:gap-10 md:items-stretch">

          {/* Info column — single instance, responsive positioning */}
          <div className="mt-auto md:mt-0 px-4 md:px-0 pb-6 md:pb-0 pt-8 md:pt-0 flex flex-col gap-3 md:gap-4 min-w-0 flex-1 md:justify-center">
            <div className="space-y-2">
              <h1 className="font-headline font-black tracking-tighter text-on-surface leading-none text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
                {movie.title}
              </h1>
              {movie.originalTitle && movie.originalTitle !== movie.title && (
                <p className="text-sm italic text-primary/80">
                  {movie.originalTitle}
                  {movie.releaseDate && ` (${movie.releaseDate.split("-")[0]})`}
                </p>
              )}
              <div className="flex flex-wrap gap-2 items-center pt-1">
                {movie.rating && (
                  <span className="bg-tertiary-container text-on-tertiary-container px-2 py-0.5 rounded-full text-xs font-bold tracking-wider">
                    {movie.rating}
                  </span>
                )}
                <span className="text-on-surface-variant/60 font-body text-xs uppercase tracking-widest">
                  {movie.genres.join(" • ")}
                </span>
                {movie.durationMinutes && (
                  <span className="text-on-surface-variant font-body text-xs">
                    {formatDuration(movie.durationMinutes)}
                  </span>
                )}
              </div>
            </div>

            <RatingsHero ratings={movie.ratings} />

            <MovieDetails
              synopsis={movie.synopsis}
              director={movie.director}
              castMembers={castMembers}
            />
          </div>

          {/* Desktop-only poster column — right side, natural proportions */}
          {movie.posterUrl && (
            <div className="hidden md:flex shrink-0 w-52 lg:w-64 items-center justify-center self-stretch">
              <Image
                src={movie.posterUrl}
                alt={movie.title}
                width={256}
                height={384}
                sizes="(max-width: 1024px) 208px, 256px"
                className="rounded-xl shadow-[0_8px_40px_rgba(0,0,0,0.7)] object-contain w-full h-auto"
                priority
              />
            </div>
          )}
        </div>
      </section>

      {/* Amber editorial rule — visual bridge from hero to listing */}
      <div className="my-8 md:my-10 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" aria-hidden="true" />

      <section id="funciones" aria-label="Funciones" className="max-w-6xl mx-auto pb-8 md:pb-14">
        <div className="flex items-center justify-between mb-4 md:mb-8">
          <h2 className="text-4xl md:text-5xl font-headline font-black tracking-tighter">
            Funciones de <span className="text-primary">{todayLabel.toLowerCase()}</span>
          </h2>
        </div>

        <div className="mb-6">
          <Suspense fallback={<DatePickerSkeleton />}>
            <DatePicker />
          </Suspense>
        </div>

        <Suspense fallback={<MovieFilterBarSkeleton />}>
          <MovieFilterBar movieId={movie.id} date={date} />
        </Suspense>

        {grouped.length === 0 ? (
          <div className="bg-surface-container-low rounded-2xl p-12 text-center space-y-4">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant block" aria-hidden="true">
              event_busy
            </span>
            <div className="space-y-3">
              <p className="text-on-surface-variant font-semibold text-lg">
                No hay funciones para esta fecha.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                {hasActiveFilters && (
                  <Link
                    href={`/pelicula/${params.slug}?date=${date}`}
                    className="inline-flex items-center gap-1.5 bg-surface-container-high border border-outline-variant/20 text-on-surface px-4 py-2 rounded-lg text-sm font-bold hover:bg-surface-bright transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">filter_alt_off</span>
                    Limpiar filtros
                  </Link>
                )}
                <Link
                  href={`/pelicula/${params.slug}?date=${tomorrowStr}`}
                  className="inline-flex items-center gap-1.5 bg-primary-container text-on-primary-container px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  Ver funciones de mañana
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_forward</span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(({ cinema, showtimes }) => (
              <ShowtimeCinemaCard
                key={cinema.id}
                cinema={cinema}
                showtimes={showtimes}
                pricesByFormat={pricesByCinema[cinema.id]}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
