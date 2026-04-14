import Image from "next/image";
import Link from "next/link";
import { slugify, formatDuration, formatGroupLabel, formatPrice } from "@/lib/utils";
import type { Movie, ShowtimeItem, PricesByFormat } from "@/types";

function isSpecialFormat(format: string): boolean {
  return ["IMAX", "4DX", "XD", "DBOX"].includes(format);
}

const SURFACE_BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkyM+vBwAC8gF1pXj8HAAAAABJRU5ErkJggg==";

export function CinemaMovieCard({
  movie,
  showtimes,
  pricesByFormat,
  priority = false,
}: {
  movie: Movie;
  showtimes: ShowtimeItem[];
  pricesByFormat?: PricesByFormat;
  priority?: boolean;
}) {
  const slug = slugify(movie.title);

  const groups = new Map<string, ShowtimeItem[]>();
  for (const st of showtimes) {
    const key = `${st.format}|${st.language}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(st);
  }

  return (
    <article className="flex flex-col gap-2 group">
      {/* Poster — aria-hidden so screen readers only encounter the title link below */}
      <Link href={`/pelicula/${slug}`} tabIndex={-1} aria-hidden="true">
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg shadow-xl transition-transform duration-200 group-hover:scale-[1.04] will-change-transform">
          {movie.posterUrl ? (
            <Image
              src={movie.posterUrl}
              alt={movie.title}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
              priority={priority}
              placeholder="blur"
              blurDataURL={SURFACE_BLUR_DATA_URL}
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-surface-container-high flex items-center justify-center text-on-surface-variant text-sm">
              Sin poster
            </div>
          )}
          {movie.ratings && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-surface-container-lowest/90 via-surface-container-lowest/50 to-transparent px-2 pt-6 pb-2">
              <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                {movie.ratings.imdb && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-black bg-[#f5c518] text-black px-1 rounded-sm leading-tight">IMDb</span>
                    <span className="text-xs font-bold text-on-surface leading-none">{movie.ratings.imdb.score.toFixed(1)}</span>
                  </div>
                )}
                {movie.ratings.rottenTomatoes && (
                  <div className="flex items-center gap-0.5">
                    <Image src="/rottentomatoes.svg" alt="Rotten Tomatoes" width={13} height={13} />
                    <span className="text-xs font-bold text-on-surface leading-none">{movie.ratings.rottenTomatoes.tomatometer}%</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Link>

      {/* Title + meta */}
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between items-start gap-2">
          <Link href={`/pelicula/${slug}`}>
            <h3 className="text-sm font-black font-headline tracking-tight text-on-surface group-hover:text-primary transition-colors leading-tight">
              {movie.title}
            </h3>
          </Link>
          {movie.rating && (
            <span className="bg-surface-container px-1.5 py-0.5 rounded-sm text-[9px] font-bold text-on-surface-variant border border-outline-variant/30 flex-shrink-0 uppercase tracking-wide">
              {movie.rating}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-on-surface-variant font-medium">
          {movie.genres.length > 0 && <span>{movie.genres[0]}</span>}
          {movie.durationMinutes && (
            <>
              <span className="w-1 h-1 rounded-full bg-outline-variant/40" />
              <span>{formatDuration(movie.durationMinutes)}</span>
            </>
          )}
        </div>
      </div>

      {/* Showtimes */}
      <div className="space-y-2">
        {Array.from(groups.entries()).map(([key, items]) => {
          const [format, language] = key.split("|");
          const special = isSpecialFormat(format);
          const allNonBookable = items.every((st) => !st.bookingUrl);
          const tiers = pricesByFormat?.[format];

          return (
            <div key={key} className="space-y-1">
              {/* Badge row */}
              <span
                className={`inline-block px-2 py-0.5 text-[10px] font-bold tracking-wide rounded ${
                  special
                    ? "bg-tertiary text-on-tertiary"
                    : language === "sub"
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-surface-container-highest text-on-surface-variant border border-outline-variant/20"
                }`}
              >
                {formatGroupLabel(format, language)}
              </span>

              {/* Price row */}
              {(tiers?.general != null || tiers?.dosxuno != null) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {tiers.general != null && (
                    <span className="text-[11px] font-bold text-on-surface/80 tabular-nums">
                      {tiers.general === 0 ? "Gratis" : formatPrice(tiers.general)}
                    </span>
                  )}
                  {tiers.dosxuno != null && (
                    <span className="text-[11px] font-bold text-on-surface/80 tabular-nums">
                      2x1 {formatPrice(tiers.dosxuno)}{" "}
                      <span className="text-[9px] font-semibold text-primary/80 uppercase tracking-wide">c/u</span>
                    </span>
                  )}
                  {tiers.jubilado != null && (
                    <span className="text-[10px] text-on-surface-variant/60 tabular-nums">
                      Jub. {formatPrice(tiers.jubilado)}
                    </span>
                  )}
                  {tiers.menor != null && (
                    <span className="text-[10px] text-on-surface-variant/60 tabular-nums">
                      Men. {formatPrice(tiers.menor)}
                    </span>
                  )}
                </div>
              )}

              {/* Time buttons */}
              <div className="flex flex-wrap gap-1">
                {items.map((st) =>
                  st.bookingUrl ? (
                    <a
                      key={st.id}
                      href={st.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Comprar entrada — ${st.time}`}
                      className="px-2.5 py-1.5 rounded-full border border-primary/30 hover:bg-primary-container transition-colors min-h-[44px] md:min-h-[36px] flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                    >
                      <span className="text-xs font-headline font-bold hover:text-on-primary-container">
                        {st.time}
                      </span>
                    </a>
                  ) : (
                    <span
                      key={st.id}
                      className="px-2.5 py-1.5 rounded-full border border-outline-variant/20 min-h-[44px] md:min-h-[36px] flex items-center justify-center select-none"
                    >
                      <span className="text-xs font-headline font-bold text-outline">
                        {st.time}
                      </span>
                    </span>
                  )
                )}
              </div>
              {allNonBookable && (
                <p className="text-[10px] text-on-surface-variant/50 mt-0.5 leading-none">Sin reserva online</p>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
