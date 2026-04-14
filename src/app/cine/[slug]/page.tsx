import { cache } from "react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCinemaBySlug, getShowtimesGroupedByMovie, getPricesByFormat } from "@/lib/queries";
import { getToday, formatDateDisplay, getNextDays } from "@/lib/utils";
import { CinemaMovieCard } from "@/components/CinemaMovieCard";
import { PriceTierBadges } from "@/components/PriceTierBadges";
import { DatePicker } from "@/components/DatePicker";
import { DatePickerSkeleton } from "@/components/Skeletons";
import { CHAINS } from "@/types";

const CHAINS_WITHOUT_PRICES = new Set<string>();
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

// Deduplicate DB call between generateMetadata and the page component
const getCinema = cache((slug: string) => getCinemaBySlug(slug));

interface Props {
  params: { slug: string };
  searchParams: { date?: string; from?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cinema = await getCinema(params.slug);
  if (!cinema) return { title: "Cine no encontrado" };
  return {
    title: `${cinema.name} — Cartelera | cartelera.ar`,
    description: `Cartelera de ${cinema.name} en ${cinema.city}`,
  };
}

export default async function CinemaPage({ params, searchParams }: Props) {
  const cinema = await getCinema(params.slug);
  if (!cinema) notFound();

  const date = searchParams.date || getToday();
  const [grouped, pricesByFormat] = await Promise.all([
    getShowtimesGroupedByMovie(cinema.id, date),
    getPricesByFormat(cinema.chain, date, cinema.id),
  ]);
  const chainLabel = CHAINS.find((c) => c.value === cinema.chain)?.label ?? cinema.chain;

  const todayLabel = formatDateDisplay(date);

  const backHref = searchParams.from === "cines"
    ? "/cines"
    : searchParams.date ? `/?date=${searchParams.date}` : "/";

  const backdropPoster = grouped[0]?.movie.posterUrl ?? null;
  const tomorrowDate = getNextDays(2)[1]?.date ?? null;

  return (
    <div>
      {/* ── Hero with blurred poster backdrop ── */}
      <div className="relative rounded-2xl overflow-hidden mb-10 md:mb-14">
        {/* Blurred poster backdrop — unique per cinema's current schedule */}
        {backdropPoster && (
          <div className="absolute inset-0">
            <Image
              src={backdropPoster}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              quality={20}
              className="object-cover scale-110 blur-2xl opacity-30"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-br from-surface-container-lowest via-surface-container-lowest/80 to-surface-container-lowest/60" />
          </div>
        )}
        {/* Fallback surface when no poster */}
        {!backdropPoster && (
          <div className="absolute inset-0 bg-surface-container-low" />
        )}

        {/* Content */}
        <div className="relative z-10 px-5 pt-4 pb-6 md:px-10 md:pt-8 md:pb-12 space-y-3 md:space-y-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 py-3 text-sm text-on-surface-variant hover:text-primary focus-visible:text-primary transition-colors font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
            {searchParams.from === "cines" ? "Cines" : "Cartelera"}
          </Link>

          <div>
            <p className="text-xs font-bold text-primary tracking-widest mb-1">{chainLabel}</p>
            <h1 className="text-4xl md:text-7xl lg:text-8xl font-headline font-black tracking-tighter text-on-surface leading-none">
              {cinema.name}
            </h1>
            {grouped.length > 0 && (
              <p className="text-sm text-on-surface-variant font-body mt-1">
                {grouped.length} {grouped.length === 1 ? "película" : "películas"} en cartelera
              </p>
            )}
          </div>

          {/* Meta info + utility links — dense compound row */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-on-surface-variant">
              <span className="bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-wide shrink-0">
                {cinema.zone}
              </span>
              {cinema.address && (
                <div className="flex items-center gap-1 min-w-0">
                  <span className="material-symbols-outlined text-[14px] shrink-0" aria-hidden="true">location_on</span>
                  <span className="text-xs font-medium truncate">{cinema.address}</span>
                </div>
              )}
              {cinema.phone && (
                <a
                  href={`tel:${cinema.phone}`}
                  className="flex items-center gap-1 hover:text-primary focus-visible:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px] shrink-0" aria-hidden="true">call</span>
                  <span className="text-xs font-medium">{cinema.phone}</span>
                </a>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {cinema.lat && cinema.lng && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${cinema.lat},${cinema.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2.5 md:py-1.5 rounded-lg border border-outline-variant/50 text-on-surface-variant text-xs font-bold hover:bg-surface-container-high hover:text-on-surface hover:border-outline-variant/70 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]" aria-hidden="true">map</span>
                  Ver en mapa
                </a>
              )}
              {cinema.url && (
                <a
                  href={cinema.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2.5 md:py-1.5 rounded-lg border border-outline-variant/50 text-on-surface-variant text-xs font-bold hover:bg-surface-container-high hover:text-on-surface hover:border-outline-variant/70 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]" aria-hidden="true">language</span>
                  Sitio web
                </a>
              )}
            </div>
          </div>

          {/* Prices by format — hidden for chains with unreliable data */}
          {!CHAINS_WITHOUT_PRICES.has(cinema.chain) && Object.keys(pricesByFormat).length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">Precios</p>
              <div className="flex flex-col gap-2">
                {Object.entries(pricesByFormat).map(([format, tiers]) => (
                  <div key={format} className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/50 w-8 shrink-0">{format}</span>
                    <PriceTierBadges tiers={tiers} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <section aria-label="Cartelera del cine" className="space-y-5">
        {/* Heading + DatePicker in the same header row */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-4">
          <h2 className="text-2xl md:text-4xl font-headline font-black tracking-tight text-on-surface-variant">
            Cartelera de <span className="text-primary">{todayLabel.toLowerCase()}</span>
          </h2>
          <Suspense fallback={<DatePickerSkeleton />}>
            <DatePicker />
          </Suspense>
        </div>

        {grouped.length === 0 ? (
          <div className="bg-surface-container-low rounded-2xl p-10 text-center flex flex-col items-center gap-4">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/40" aria-hidden="true">
              event_busy
            </span>
            <div className="space-y-1">
              <p className="text-on-surface font-semibold">
                Sin funciones para esta fecha
              </p>
              <p className="text-sm text-on-surface-variant">
                El cine puede no tener funciones programadas o la información aún no está disponible.
              </p>
            </div>
            {tomorrowDate && date !== tomorrowDate && (
              <Link
                href={`?date=${tomorrowDate}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-outline-variant/30 text-on-surface-variant text-sm font-semibold hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                Ver mañana
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
            {grouped.map(({ movie, showtimes }, i) => (
              <CinemaMovieCard
                key={movie.id}
                movie={movie}
                showtimes={showtimes}
                pricesByFormat={pricesByFormat}
                priority={i < 4}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
