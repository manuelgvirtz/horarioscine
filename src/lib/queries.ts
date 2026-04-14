import { db } from "@/db";
import { cinemas, movies, showtimes, prices } from "@/db/schema";
import { eq, and, sql, desc, asc, isNull, or, lte, gte } from "drizzle-orm";
import { slugify, parseGenres, getToday, getDayType } from "./utils";
import type { Movie, Cinema, MovieRatings, FilterParams, PricesByFormat } from "@/types";

function buildMovieRatings(row: typeof movies.$inferSelect): MovieRatings | undefined {
  const ratings: MovieRatings = {};
  if (row.imdbScore != null) {
    ratings.imdb = {
      score: row.imdbScore,
      votes: row.imdbVotes ?? undefined,
      url: row.imdbId ? `https://www.imdb.com/title/${row.imdbId}` : "",
    };
  }
  if (row.rtTomatometer != null) {
    ratings.rottenTomatoes = {
      tomatometer: row.rtTomatometer,
      audience: row.rtAudience ?? undefined,
    };
  }
  if (row.metacriticScore != null) {
    ratings.metacritic = { score: row.metacriticScore };
  }
  if (row.letterboxdScore != null) {
    ratings.letterboxd = { score: row.letterboxdScore };
  }
  return Object.keys(ratings).length > 0 ? ratings : undefined;
}

function toMovie(row: typeof movies.$inferSelect): Movie {
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.originalTitle,
    tmdbId: row.tmdbId,
    posterUrl: row.posterUrl,
    synopsis: row.synopsis,
    durationMinutes: row.durationMinutes,
    rating: row.rating,
    genres: parseGenres(row.genres),
    releaseDate: row.releaseDate,
    imdbId: row.imdbId,
    director: row.director,
    cast: row.cast,
    castJson: row.castJson ?? null,
    ratings: buildMovieRatings(row),
  };
}

function toCinema(row: typeof cinemas.$inferSelect): Cinema {
  return row as Cinema;
}

export async function getMovies(params: FilterParams = {}) {
  const date = params.date || getToday();
  // Only get movies that have showtimes on the given date
  const movieIdsWithShowtimes = db
    .select({ movieId: showtimes.movieId })
    .from(showtimes)
    .where(
      and(
        eq(showtimes.date, date),
        params.zona
          ? sql`${showtimes.cinemaId} IN (SELECT id FROM cinemas WHERE zone = ${params.zona})`
          : undefined,
        params.type
          ? sql`${showtimes.cinemaId} IN (SELECT id FROM cinemas WHERE type = ${params.type})`
          : undefined,
        params.cinema_id ? eq(showtimes.cinemaId, Number(params.cinema_id)) : undefined,
        params.format ? eq(showtimes.format, params.format) : undefined,
        params.language ? eq(showtimes.language, params.language) : undefined,
        params.minTime ? gte(showtimes.time, params.minTime) : undefined
      )
    )
    .groupBy(showtimes.movieId);

  const rows = await db
    .select({
      movie: movies,
      showtimeCount: sql<number>`(
        SELECT COUNT(*) FROM showtimes
        WHERE showtimes.movie_id = movies.id
        AND showtimes.date = ${date}
        ${params.zona ? sql`AND showtimes.cinema_id IN (SELECT id FROM cinemas WHERE zone = ${params.zona})` : sql``}
        ${params.type ? sql`AND showtimes.cinema_id IN (SELECT id FROM cinemas WHERE type = ${params.type})` : sql``}
        ${params.cinema_id ? sql`AND showtimes.cinema_id = ${Number(params.cinema_id)}` : sql``}
        ${params.format ? sql`AND showtimes.format = ${params.format}` : sql``}
        ${params.language ? sql`AND showtimes.language = ${params.language}` : sql``}
        ${params.minTime ? sql`AND showtimes.time >= ${params.minTime}` : sql``}
      )`.as("showtime_count"),
    })
    .from(movies)
    .where(
      and(
        sql`${movies.id} IN (${movieIdsWithShowtimes})`,
        params.movie_id ? sql`${movies.id} = ${Number(params.movie_id)}` : undefined
      )
    )
    .orderBy(desc(sql`showtime_count`));

  return rows.map((r) => ({
    ...toMovie(r.movie),
    showtimeCount: r.showtimeCount,
  }));
}

export async function getMovieBySlug(slug: string) {
  // Fast path: indexed slug column (populated on insert)
  const [bySlug] = await db.select().from(movies).where(eq(movies.slug, slug)).limit(1);
  if (bySlug) return toMovie(bySlug);

  // Fallback for rows without a slug yet — full scan + lazy backfill
  const allMovies = await db.select().from(movies);
  const row = allMovies.find((m) => slugify(m.title) === slug);
  if (!row) return null;
  // Backfill slug
  try { await db.update(movies).set({ slug }).where(eq(movies.id, row.id)); } catch { /* ignore */ }
  return toMovie(row);
}

export async function getCinemas(params: FilterParams = {}) {
  const conditions = [];
  if (params.zona) conditions.push(eq(cinemas.zone, params.zona));
  if (params.type) conditions.push(eq(cinemas.type, params.type));
  if (params.cinema_id) conditions.push(eq(cinemas.id, Number(params.cinema_id)));

  const rows = await db
    .select()
    .from(cinemas)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(cinemas.name));

  return rows.map(toCinema);
}

export async function getCinemaBySlug(slug: string) {
  // Fast path: indexed slug column
  const [bySlug] = await db.select().from(cinemas).where(eq(cinemas.slug, slug)).limit(1);
  if (bySlug) return toCinema(bySlug);

  // Fallback for rows without a slug yet — full scan + lazy backfill
  const allCinemas = await db.select().from(cinemas);
  const row = allCinemas.find((c) => slugify(c.name) === slug);
  if (!row) return null;
  // Backfill slug
  try { await db.update(cinemas).set({ slug }).where(eq(cinemas.id, row.id)); } catch { /* ignore */ }
  return toCinema(row);
}

export async function getShowtimes(params: FilterParams = {}) {
  const date = params.date || getToday();
  const conditions = [eq(showtimes.date, date)];

  if (params.cinema_id) conditions.push(eq(showtimes.cinemaId, Number(params.cinema_id)));
  if (params.movie_id) conditions.push(eq(showtimes.movieId, Number(params.movie_id)));
  if (params.format) conditions.push(eq(showtimes.format, params.format));
  if (params.language) conditions.push(eq(showtimes.language, params.language));

  if (params.zona) {
    conditions.push(
      sql`${showtimes.cinemaId} IN (SELECT id FROM cinemas WHERE zone = ${params.zona})`
    );
  }

  if (params.type) {
    conditions.push(
      sql`${showtimes.cinemaId} IN (SELECT id FROM cinemas WHERE type = ${params.type})`
    );
  }

  if (params.minTime) {
    conditions.push(gte(showtimes.time, params.minTime));
  }

  const rows = await db
    .select({
      showtime: showtimes,
      movie: movies,
      cinema: cinemas,
    })
    .from(showtimes)
    .innerJoin(movies, eq(showtimes.movieId, movies.id))
    .innerJoin(cinemas, eq(showtimes.cinemaId, cinemas.id))
    .where(and(...conditions))
    .orderBy(showtimes.time);

  return rows.map((r) => ({
    ...r.showtime,
    movie: toMovie(r.movie),
    cinema: toCinema(r.cinema),
  }));
}

export async function getShowtimesGroupedByCinema(
  movieId: number,
  date: string,
  extra: Pick<FilterParams, "zona" | "cinema_id" | "format" | "language" | "type" | "minTime"> = {}
) {
  const rows = await getShowtimes({ movie_id: String(movieId), date, ...extra });
  const grouped = new Map<number, { cinema: Cinema; showtimes: typeof rows }>();

  for (const row of rows) {
    if (!grouped.has(row.cinema.id)) {
      grouped.set(row.cinema.id, { cinema: row.cinema, showtimes: [] });
    }
    grouped.get(row.cinema.id)!.showtimes.push(row);
  }

  return Array.from(grouped.values());
}

export async function getCinemasWithShowtimeCounts(date: string) {
  const rows = await db
    .select({
      cinema: cinemas,
      showtimeCount: sql<number>`(
        SELECT COUNT(DISTINCT movie_id) FROM showtimes
        WHERE showtimes.cinema_id = cinemas.id
        AND showtimes.date = ${date}
      )`.as("showtime_count"),
    })
    .from(cinemas)
    .orderBy(asc(cinemas.zone), asc(cinemas.name));

  return rows.map((r) => ({ ...toCinema(r.cinema), showtimeCount: r.showtimeCount }));
}

export async function getMoviesSortedByRelease(
  thisWeekStart: string,
  thisWeekEnd: string,
) {
  const rows = await db
    .select({
      movie: movies,
      showtimeCount: sql<number>`(
        SELECT COUNT(*) FROM showtimes
        WHERE showtimes.movie_id = movies.id
        AND showtimes.date >= ${thisWeekStart}
        AND showtimes.date <= ${thisWeekEnd}
      )`.as("showtime_count"),
    })
    .from(movies)
    .where(sql`${movies.id} IN (SELECT id FROM movies WHERE debut_week = ${thisWeekStart})`)
    .orderBy(desc(movies.releaseDate), desc(sql`showtime_count`));

  return rows.map((r) => ({ ...toMovie(r.movie), showtimeCount: r.showtimeCount }));
}

export async function getShowtimesGroupedByMovie(cinemaId: number, date: string) {
  const rows = await getShowtimes({ cinema_id: String(cinemaId), date });
  const grouped = new Map<number, { movie: Movie; showtimes: typeof rows }>();

  for (const row of rows) {
    if (!grouped.has(row.movie.id)) {
      grouped.set(row.movie.id, { movie: row.movie, showtimes: [] });
    }
    grouped.get(row.movie.id)!.showtimes.push(row);
  }

  return Array.from(grouped.values());
}

/**
 * Returns all current prices for a chain on a given date, grouped by format.
 * e.g. { "2D": { general: 860000, jubilado: 570000, menor: 570000 }, "IMAX": { ... } }
 *
 * When cinemaId is provided, cinema-specific prices take precedence over
 * chain-wide prices (cinemaId IS NULL). This lets the scraper store per-cinema
 * prices while the seed script provides chain-wide fallbacks.
 */
export async function getPricesByFormat(chain: string, date: string, cinemaId?: number): Promise<PricesByFormat> {
  const today = new Date().toISOString().slice(0, 10);
  const dayType = getDayType(date);

  const rows = await db
    .select()
    .from(prices)
    .where(
      and(
        eq(prices.chain, chain),
        // Fetch both cinema-specific rows (if cinemaId given) and chain-wide rows
        cinemaId
          ? or(eq(prices.cinemaId, cinemaId), isNull(prices.cinemaId))
          : isNull(prices.cinemaId),
        eq(prices.dayType, dayType),
        lte(prices.validFrom, today),
        or(isNull(prices.validUntil), gte(prices.validUntil, today))
      )
    );

  const result: PricesByFormat = {};

  // First pass: cinema-specific rows win
  for (const row of rows.filter(r => r.cinemaId != null)) {
    if (!result[row.format]) result[row.format] = {};
    (result[row.format] as Record<string, number>)[row.audienceType] = row.amountCents;
  }
  // Second pass: chain-wide rows fill in any gaps
  for (const row of rows.filter(r => r.cinemaId == null)) {
    if (!result[row.format]) result[row.format] = {};
    const tier = result[row.format] as Record<string, number>;
    if (tier[row.audienceType] == null) {
      tier[row.audienceType] = row.amountCents;
    }
  }

  return result;
}
