import Image from "next/image";
import Link from "next/link";
import { slugify, formatDuration } from "@/lib/utils";
import type { MovieWithShowtimeCount } from "@/types";

// Returns true when the title has no lowercase letters — scraper artifact (e.g. "SPIDER-MAN")
function isAllCaps(title: string): boolean {
  return /[A-Z]/.test(title) && !/[a-z]/.test(title);
}

function sentenceCase(title: string): string {
  if (!title) return title;
  return title
    .split(" ")
    .map((word, i) => {
      // Preserve ALL-CAPS tokens (≥2 chars) as acronyms — FBI, IMAX, BTS, ATP…
      if (word.length >= 2 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
      return i === 0
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : word.toLowerCase();
    })
    .join(" ");
}

const SURFACE_BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkyM+vBwAC8gF1pXj8HAAAAABJRU5ErkJggg==";

interface MovieCardProps {
  movie: MovieWithShowtimeCount;
  /** Serialized query string from the homepage (preserves active filters) */
  filterParams?: string;
  /** Preload this image (use for above-the-fold cards) */
  priority?: boolean;
}

export function MovieCard({ movie, filterParams, priority = false }: MovieCardProps) {
  const slug = slugify(movie.title);
  const displayTitle = isAllCaps(movie.title) ? sentenceCase(movie.title) : movie.title;
  const href = `/pelicula/${slug}${filterParams ? `?${filterParams}` : ""}`;

  return (
    <article className="flex flex-col gap-2 group">
      {/* Poster — aria-hidden so screen readers only encounter the title link below */}
      <Link href={href} tabIndex={-1} aria-hidden="true">
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
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-surface/90 via-surface/50 to-transparent px-2 pt-6 pb-2">
              <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
                {movie.ratings.imdb && (
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-black bg-[#f5c518] text-black px-1 rounded-sm leading-tight">IMDb</span>
                    <span className="text-[12px] font-bold text-on-surface leading-none">{Math.round(movie.ratings.imdb.score * 10)}%</span>
                  </div>
                )}
                {movie.ratings.rottenTomatoes && (
                  <div className="flex items-center gap-0.5">
                    <Image src="/rottentomatoes.svg" alt="RT" width={13} height={13} />
                    <span className="text-[12px] font-bold text-on-surface leading-none">{movie.ratings.rottenTomatoes.tomatometer}%</span>
                  </div>
                )}
                {movie.ratings.metacritic && (
                  <div className="flex items-center gap-1">
                    <Image src="/metacritic.svg" alt="MC" width={13} height={13} />
                    <span className="text-[12px] font-bold text-on-surface leading-none">{movie.ratings.metacritic.score}%</span>
                  </div>
                )}
                {movie.ratings.letterboxd && (
                  <div className="flex items-center gap-1">
                    <Image src="/letterboxd.svg" alt="LB" width={13} height={13} className="rounded-sm" />
                    <span className="text-[12px] font-bold text-on-surface leading-none">{Math.round(movie.ratings.letterboxd.score * 20)}%</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between items-start gap-2">
          <Link href={href}>
            <h2 className="text-sm font-black font-headline tracking-tight text-on-surface group-hover:text-primary transition-colors leading-tight">
              {displayTitle}
            </h2>
          </Link>
          {movie.rating && (
            <span className="bg-surface-container px-1.5 py-0.5 rounded-sm text-[9px] font-bold text-on-surface-variant border border-outline-variant/30 flex-shrink-0 uppercase tracking-wide">
              {movie.rating}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-medium">
          {movie.genres.length > 0 && <span>{movie.genres.slice(0, 1).join(" / ")}</span>}
          {movie.durationMinutes && (
            <>
              <span className="w-1 h-1 rounded-full bg-outline-variant/40" />
              <span>{formatDuration(movie.durationMinutes)}</span>
            </>
          )}
        </div>

        <p className="text-xs font-bold text-primary">
          {movie.showtimeCount} {Number(movie.showtimeCount) === 1 ? "función" : "funciones"}
        </p>
      </div>
    </article>
  );
}
