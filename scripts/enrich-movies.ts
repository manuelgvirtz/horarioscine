/**
 * enrich-movies.ts
 * Enriquece películas con metadata, ratings y trailers.
 *
 * Fuentes:
 *  - TMDB API  (TMDB_API_KEY): poster, synopsis, genres, trailer de YouTube,
 *              duración, fecha de estreno, título original
 *  - OMDB API  (OMDB_API_KEY): IMDb score/votes, Rotten Tomatoes, Metacritic
 *
 * Comportamiento:
 *  - Sin claves: solo aplica el catálogo manual KNOWN_MOVIES
 *  - Con TMDB_API_KEY: enriquece películas sin poster o sin tmdb_id
 *  - Con OMDB_API_KEY: actualiza ratings de toda película con imdb_id
 *
 * Uso:
 *   npx tsx scripts/enrich-movies.ts
 *   TMDB_API_KEY=xxx OMDB_API_KEY=yyy npx tsx scripts/enrich-movies.ts
 */

import { db, closeDb } from "./db";
import { movies } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m" };
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── Tipos ─────────────────────────────────────────────────────────────
interface MovieData {
  tmdbId?:          number;
  originalTitle?:   string;
  posterUrl?:       string;
  synopsis?:        string;
  genres?:          string;
  releaseDate?:     string;
  durationMinutes?: number;
  rating?:          string | null;
  trailerUrl?:      string | null;
  director?:        string | null;
  cast?:            string | null;   // comma-separated top-3 actors
  castJson?:        string | null;   // JSON: [{name, profileUrl}]
  imdbId?:          string;
  imdbScore?:       number | null;
  imdbVotes?:       number | null;
  rtTomatometer?:   number | null;
  rtAudience?:      number | null;
  metacriticScore?: number | null;
  letterboxdScore?: number | null;
}

// ── Catálogo manual ───────────────────────────────────────────────────
// Clave: título normalizado. Se aplica siempre, prevalece sobre APIs.
// Usá esto para overrides específicos (rating INCAA, datos incorrectos en TMDB, etc.)
const KNOWN_MOVIES: Record<string, MovieData> = {
  // ── Argentine productions without TMDB coverage ───────────────────
  "un fantasma a su servicio": {
    posterUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSyNbqXOp0AIhHrCWMp-ycG5AaR7D0qrblL6w&s",
  },
  "malvinas legado de sangre": {
    tmdbId: 1659190,
    posterUrl: "https://pbs.twimg.com/media/GneNNnqXYAAd7Zn?format=jpg&name=large",
  },
  "madres jovenes": {
    posterUrl: "https://pics.filmaffinity.com/jeunes_meres-817786357-mmed.jpg",
  },
  "dos pianos": {
    posterUrl: "https://m.media-amazon.com/images/M/MV5BOWU5OGJhYWMtNjk1MC00NWYxLTkwM2UtODE0MTQ5ZmIzM2YyXkEyXkFqcGc@._V1_.jpg",
  },
  "maya dame un titulo": {
    posterUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTNArgMlTzG7s2Au78xleJ5xMyNmjDiD0H0hbb8vEOPXw&s",
  },
  "festival internacional camara corporizada mundos posibles": {
    posterUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDNHBh79d4au1Xar29kcMuc-x-ZRi02KKjYQ&s",
  },
  "festival internacional camara corporizada lo que permanece": {
    posterUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRDNHBh79d4au1Xar29kcMuc-x-ZRi02KKjYQ&s",
  },
  "teniente linyera": {
    tmdbId: 1559265,
    posterUrl: "https://agendadecine.ar/wp-content/uploads/2026/03/TenienteLinyera_Po%E2%95%A0uster-1-713x1024.png",
  },

  "hamnet": {
    tmdbId: 858024, originalTitle: "Hamnet",
    posterUrl: "https://image.tmdb.org/t/p/w500/qXF968t2LfHZJ8Zrq2NgMGNomnE.jpg",
    synopsis: "La historia de Agnes, la esposa de William Shakespeare, en su lucha por superar la tragedia familiar que irrumpe en su vida y que inspira la creación de Hamlet.",
    genres: "Drama,Romance,Historia", releaseDate: "2025-11-26", rating: "+13",
    imdbId: "tt14905854", imdbScore: 7.9, imdbVotes: 91000,
    rtTomatometer: 87, rtAudience: 93, metacriticScore: 84, letterboxdScore: 4.19,
  },
  "super mario galaxy la pelicula": {
    tmdbId: 1226863, originalTitle: "The Super Mario Galaxy Movie",
    posterUrl: "https://image.tmdb.org/t/p/w500/eEfzkiW28Y3BaHjjgFNkFERNKiK.jpg",
    synopsis: "Mario, Luigi y la princesa Peach emprenden una aventura hasta los confines del espacio y a través de la galaxia.",
    genres: "Aventura,Animación,Comedia,Familiar,Fantasía", releaseDate: "2026-04-02", rating: "ATP",
    imdbId: "tt28650488", imdbScore: null, imdbVotes: null,
    rtTomatometer: 43, rtAudience: 92, metacriticScore: 37, letterboxdScore: 3.16,
  },
  "pensamiento lateral": {
    tmdbId: 946743, originalTitle: "Pensamiento Lateral",
    posterUrl: "https://image.tmdb.org/t/p/w500/1iSv7Zha5QsrvIa8S7y5vNicAfv.jpg",
    synopsis: "Un thriller psicológico de Mariano Hueter.",
    genres: "Suspense", releaseDate: "2026-03-26", rating: "+16",
    imdbId: "tt23577180", imdbScore: 6.7,
  },
  "76 89 23": {
    tmdbId: 1387477, originalTitle: "76 89 23",
    posterUrl: "https://image.tmdb.org/t/p/w500/9H18EdRZaPE1QQK4pHqMn9tlHgF.jpg",
    synopsis: "Documental que propone deconstruir el pasado y el presente desde un punto de vista sociopolítico, cultural y económico a través de momentos claves en la historia Argentina.",
    genres: "Documental", releaseDate: "2025-04-03",
    imdbId: "tt36341290", imdbScore: 7.2,
  },
  "instinto implacable": {
    tmdbId: 1383731, originalTitle: "Protector",
    posterUrl: "https://image.tmdb.org/t/p/w500/Awvlydvag364audeksfRFldVslq.jpg",
    synopsis: "La vida pacífica de Nikki, una exheroína de guerra, se ve destrozada cuando su hija es secuestrada. Debe luchar para rescatarla en el submundo criminal.",
    genres: "Acción,Suspense", releaseDate: "2026-03-26", rating: "+16",
    imdbId: "tt34471850", imdbScore: 7.1,
    rtTomatometer: 21, rtAudience: 75, metacriticScore: 41, letterboxdScore: 2.36,
  },
  "millennium actress": {
    tmdbId: 33320, originalTitle: "千年女優",
    posterUrl: "https://image.tmdb.org/t/p/w500/zE9dDm7ImMKazPDKXiWElOqki0m.jpg",
    synopsis: "Hace treinta años, Chiyoko Fujiwara fue la estrella más importante del cine japonés, pero de repente desapareció. Un realizador de documentales viaja hasta su retiro de montaña para entrevistarla.",
    genres: "Drama,Animación,Romance,Fantasía", releaseDate: "2002-09-14",
    imdbId: "tt0291350", imdbScore: 7.8,
    rtTomatometer: 93, rtAudience: 90, metacriticScore: 70, letterboxdScore: 4.23,
  },
  "jugada maestra": {
    tmdbId: 467905, originalTitle: "How to Make a Killing",
    posterUrl: "https://image.tmdb.org/t/p/w500/kI6OIy47E7hr9OOESV1DUDuBkqT.jpg",
    synopsis: "Un potencial heredero de una gran fortuna ocupa el octavo lugar en la línea de sucesión. La solución obvia: eliminar a todos los que están por delante.",
    genres: "Comedia,Suspense", releaseDate: "2026-02-04",
    imdbId: "tt4357198", imdbScore: 6.6,
    rtTomatometer: 44, rtAudience: 77, metacriticScore: 51, letterboxdScore: 3.18,
  },
  "una batalla tras otra": {
    tmdbId: 1054867, originalTitle: "One Battle After Another",
    posterUrl: "https://image.tmdb.org/t/p/w500/iZ1499F6hYxDxiqioy8oSUaxipG.jpg",
    synopsis: "Un ex revolucionario, tras años apartado de la lucha, se ve obligado a volver a la acción para enfrentar a viejos enemigos en un ambiente cargado de tensión política y violencia.",
    genres: "Suspense,Crimen,Comedia", releaseDate: "2025-09-25", rating: "+16",
    imdbId: "tt30144839", imdbScore: 7.7,
    rtTomatometer: 94, rtAudience: 85, metacriticScore: 95, letterboxdScore: 4.16,
  },
  "valor sentimental": {
    tmdbId: 1124566, originalTitle: "Affeksjonsverdi",
    posterUrl: "https://image.tmdb.org/t/p/w500/32XrK8WxrUg3xYQXEXXe7Fv3jl9.jpg",
    synopsis: "Una exploración íntima y conmovedora de la familia, los recuerdos y el poder reconciliador del arte.",
    genres: "Drama", releaseDate: "2025-12-25", rating: "+13",
    imdbId: "tt27714581", imdbScore: 7.8,
    rtTomatometer: 95, rtAudience: 94, metacriticScore: 86, letterboxdScore: 4.16,
  },
  "calle malaga": {
    tmdbId: 1399462, originalTitle: "Calle Málaga",
    posterUrl: "https://image.tmdb.org/t/p/w500/fWagBXNDk44UaupYtwQOAvDwGiT.jpg",
    synopsis: "María Ángeles, de 79 años, vive sola en Tánger. Cuando su hija llega desde Madrid para vender el apartamento familiar, ella se resiste a perder su hogar y sus recuerdos.",
    genres: "Drama", releaseDate: "2025-10-31", rating: "+13",
    imdbId: "tt32429174", imdbScore: 7.1,
    rtTomatometer: 97, letterboxdScore: 3.69,
  },
  "gioia mia un verano en sicilia": {
    tmdbId: 1510325, originalTitle: "Gioia mia",
    posterUrl: "https://image.tmdb.org/t/p/w500/7N4QlTDnw0NfF9B6kKfG1O9zU35.jpg",
    synopsis: "Un verano reluctante juntos se transforma en una aventura cuando un niño descubre que la misteriosa casa siciliana de su tía esconde secretos y espíritus ancestrales.",
    genres: "Drama", releaseDate: "2025-12-11",
    imdbId: "tt36454256", imdbScore: 7.3, letterboxdScore: 3.48,
  },
  "pinocho": {
    tmdbId: 1248723, originalTitle: "Буратино",
    posterUrl: "https://image.tmdb.org/t/p/w500/An3iR7yPP6GKQi2SDscWlEMFXAC.jpg",
    synopsis: "La historia del héroe favorito de todos, Pinocho, su papá Carlo y sus amigos, contada con la ayuda de la tecnología moderna.",
    genres: "Familiar,Drama,Aventura,Fantasía", releaseDate: "2026-03-19", rating: "ATP",
    imdbId: "tt32118517", letterboxdScore: 2.64,
  },
  "playa de lobos": {
    tmdbId: 1383519, originalTitle: "Playa de lobos",
    posterUrl: "https://image.tmdb.org/t/p/w500/reAySL0tYNgI842A8hQlbFJf1Yc.jpg",
    synopsis: "Manu trabaja en un chiringuito de playa. Klaus es un turista que no quiere irse. Lo que parece un encuentro casual toma un giro oscuro cuando Manu sospecha que Klaus no es quien dice ser.",
    genres: "Comedia,Suspense", releaseDate: "2025-10-24", rating: "+13",
    imdbId: "tt34431927", imdbScore: 6.0, imdbVotes: 90,
    rtTomatometer: 67, letterboxdScore: 3.01,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── TMDB API ──────────────────────────────────────────────────────────

interface TmdbMovieData {
  tmdbId:          number;
  originalTitle:   string;
  englishTitle:    string;   // title in en-US — used for Letterboxd slug
  posterUrl:       string | null;
  synopsis:        string;
  genres:          string;
  releaseDate:     string;
  durationMinutes: number;
  imdbId:          string | null;
  trailerUrl:      string | null;
}

interface CastMember {
  name:       string;
  profileUrl: string | null;
}

async function tmdbFetch(path: string, apiKey: string, language = "es-AR"): Promise<any> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://api.themoviedb.org/3${path}${sep}api_key=${apiKey}&language=${language}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// Search TMDB by title → returns full movie data including trailer
async function tmdbSearch(title: string, apiKey: string): Promise<TmdbMovieData | null> {
  try {
    const search = await tmdbFetch(`/search/movie?query=${encodeURIComponent(title)}`, apiKey);
    const hit = search?.results?.[0];
    if (!hit) return null;
    return tmdbById(hit.id, apiKey);
  } catch {
    return null;
  }
}

// Fetch by known TMDB ID → returns full movie data including trailer
async function tmdbById(tmdbId: number, apiKey: string): Promise<TmdbMovieData | null> {
  try {
    const [detail, detail_en, videos] = await Promise.all([
      tmdbFetch(`/movie/${tmdbId}`, apiKey),
      tmdbFetch(`/movie/${tmdbId}`, apiKey, "en-US"),
      tmdbFetch(`/movie/${tmdbId}/videos`, apiKey),
    ]);
    if (!detail) return null;

    // Pick best trailer: official YouTube trailer first, then any trailer
    const trailerKey = pickTrailer(videos?.results ?? []);

    return {
      tmdbId:          detail.id,
      originalTitle:   detail.original_title ?? "",
      englishTitle:    detail_en?.title ?? detail.original_title ?? "",
      posterUrl:       detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
      synopsis:        detail.overview ?? "",
      genres:          detail.genres?.map((g: { name: string }) => g.name).join(",") ?? "",
      releaseDate:     detail.release_date ?? "",
      durationMinutes: detail.runtime ?? 0,
      imdbId:          detail.imdb_id || null,
      trailerUrl:      trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : null,
    };
  } catch {
    return null;
  }
}

// Fetch top-3 cast with profile photos for a given TMDB movie ID
async function tmdbCredits(tmdbId: number, apiKey: string): Promise<CastMember[]> {
  try {
    const data = await tmdbFetch(`/movie/${tmdbId}/credits`, apiKey);
    if (!data?.cast) return [];
    return (data.cast as Array<{ name: string; profile_path: string | null; order: number }>)
      .sort((a, b) => a.order - b.order)
      .slice(0, 3)
      .map(({ name, profile_path }) => ({
        name,
        profileUrl: profile_path ? `https://image.tmdb.org/t/p/w185${profile_path}` : null,
      }));
  } catch {
    return [];
  }
}

function pickTrailer(videos: Array<{ type: string; site: string; key: string; official?: boolean }>): string | null {
  const trailers = videos.filter(v => v.site === "YouTube" && v.type === "Trailer");
  if (!trailers.length) return null;
  // Prefer official trailers
  const official = trailers.find(v => v.official);
  return (official ?? trailers[0]).key;
}

// ── Letterboxd scraper ───────────────────────────────────────────────

function letterboxdSlug(title: string): string {
  return title
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function letterboxdRating(originalTitle: string, releaseYear?: string, englishTitle?: string): Promise<number | null> {
  // Build unique ordered list of title candidates: original first, then English if different
  const titles = [...new Set([originalTitle, englishTitle].filter(Boolean) as string[])];

  for (const title of titles) {
    const slug = letterboxdSlug(title);
    const slugsToTry = releaseYear ? [slug, `${slug}-${releaseYear}`] : [slug];

    for (const s of slugsToTry) {
      try {
        const res = await fetch(`https://letterboxd.com/film/${s}/`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
        });
        if (!res.ok) continue;
        const html = await res.text();
        const m = html.match(/name="twitter:data2"\s+content="([\d.]+)\s+out of 5"/);
        if (m) return parseFloat(m[1]);
        const j = html.match(/"ratingValue":([\d.]+)/);
        if (j) return parseFloat(j[1]);
      } catch { /* skip */ }
    }
  }
  return null;
}

// ── IMDb direct scrape (fallback when OMDB has no score) ──────────────

async function imdbDirectScore(imdbId: string): Promise<{ score: number; votes: number } | null> {
  try {
    const res = await fetch(`https://www.imdb.com/title/${imdbId}/`, {
      headers: {
        "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
        "Accept": "text/html",
        "Accept-Language": "en-US",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Try __NEXT_DATA__ JSON (current IMDb)
    const nd = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nd) {
      const data = JSON.parse(nd[1]);
      const rating = data?.props?.pageProps?.aboveTheFoldData?.ratingsSummary?.aggregateRating;
      const votes  = data?.props?.pageProps?.aboveTheFoldData?.ratingsSummary?.voteCount;
      if (rating) return { score: parseFloat(rating), votes: parseInt(votes) || 0 };
    }

    // Fallback: inline JSON-LD
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (ld) {
      const d = JSON.parse(ld[1]);
      if (d?.aggregateRating?.ratingValue)
        return { score: parseFloat(d.aggregateRating.ratingValue), votes: parseInt(d.aggregateRating.ratingCount) || 0 };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Rotten Tomatoes direct scrape ────────────────────────────────────

function rtSlug(title: string): string {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "_");
}

async function rtDirectScore(titles: string[], year?: string): Promise<number | null> {
  const slugs = [...new Set(titles.map(rtSlug))];
  const candidates: string[] = [];
  for (const s of slugs) {
    candidates.push(s);
    if (year) candidates.push(`${s}_${year}`);
  }
  for (const slug of candidates) {
    try {
      const res = await fetch(`https://www.rottentomatoes.com/m/${slug}`, {
        headers: { "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", "Accept": "text/html" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (ld) {
        const d = JSON.parse(ld[1]);
        const val = d?.aggregateRating?.ratingValue;
        if (val != null) return parseInt(String(val), 10);
      }
    } catch { /* skip */ }
    await sleep(300);
  }
  return null;
}

// ── Metacritic direct scrape ──────────────────────────────────────────

function mcSlug(title: string): string {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "-");
}

async function metacriticDirectScore(titles: string[], year?: string): Promise<number | null> {
  const slugs = [...new Set(titles.map(mcSlug))];
  const candidates: string[] = [];
  for (const s of slugs) {
    candidates.push(s);
    if (year) candidates.push(`${s}-${year}`);
  }
  for (const slug of candidates) {
    try {
      const res = await fetch(`https://www.metacritic.com/movie/${slug}/`, {
        headers: { "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)", "Accept": "text/html" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (ld) {
        const d = JSON.parse(ld[1]);
        const val = d?.aggregateRating?.ratingValue;
        if (val != null) return parseInt(String(val), 10);
      }
    } catch { /* skip */ }
    await sleep(300);
  }
  return null;
}

// ── OMDB API ──────────────────────────────────────────────────────────

interface OmdbData {
  imdbScore:       number | null;
  imdbVotes:       number | null;
  rtTomatometer:   number | null;
  metacriticScore: number | null;
  director:        string | null;
  cast:            string | null;   // top-3 actors, comma-separated
}

async function omdbFetch(imdbId: string, apiKey: string): Promise<OmdbData | null> {
  try {
    const url = `https://www.omdbapi.com/?apikey=${apiKey}&i=${imdbId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    if (d.Response === "False") return null;

    const imdbScore  = d.imdbRating && d.imdbRating !== "N/A" ? parseFloat(d.imdbRating) : null;
    const imdbVotes  = d.imdbVotes  && d.imdbVotes  !== "N/A"
      ? parseInt(d.imdbVotes.replace(/,/g, ""), 10) : null;

    const rtEntry    = d.Ratings?.find((r: { Source: string }) => r.Source === "Rotten Tomatoes");
    const rtTomato   = rtEntry ? parseInt(rtEntry.Value) : null;
    const metacritic = d.Metascore && d.Metascore !== "N/A" ? parseInt(d.Metascore) : null;

    const director   = d.Director && d.Director !== "N/A" ? d.Director : null;
    // OMDB returns up to ~4 actors comma-separated; keep only the first 3
    const cast       = d.Actors   && d.Actors   !== "N/A"
      ? d.Actors.split(",").slice(0, 3).map((a: string) => a.trim()).join(", ")
      : null;

    return { imdbScore, imdbVotes, rtTomatometer: rtTomato, metacriticScore: metacritic, director, cast };
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const tmdbKey = process.env.TMDB_API_KEY;
  const omdbKey = process.env.OMDB_API_KEY;
  const now = new Date().toISOString();

  console.log(`\n${c.bold}horariosdeloscines — Enriquecimiento de películas${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  if (tmdbKey) console.log(`${ok} TMDB key  → poster, trailer, metadata`);
  else         console.log(`${warn} Sin TMDB_API_KEY`);
  if (omdbKey) console.log(`${ok} OMDB key  → IMDb score, Rotten Tomatoes, Metacritic`);
  else         console.log(`${warn} Sin OMDB_API_KEY`);
  console.log();

  // Ensure cast_json column exists (idempotent — check information_schema first)
  const colCheck = await db.execute(
    sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'movies' AND column_name = 'cast_json'`
  );
  if (colCheck.rows.length === 0) {
    await db.execute(sql`ALTER TABLE movies ADD COLUMN cast_json TEXT`);
    console.log(`  ${ok} Added cast_json column`);
  }

  const allMovies = await db.select().from(movies);
  // Track which tmdb_ids are already in use so we don't violate the unique constraint,
  // and map each one to its canonical movie id for auto-merging duplicates.
  const usedTmdbIds = new Set(allMovies.map(m => m.tmdbId).filter(Boolean));
  const tmdbIdToMovieId = new Map<number, number>();
  for (const m of allMovies) if (m.tmdbId) tmdbIdToMovieId.set(m.tmdbId, m.id);
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let merged = 0;

  // Merge helper: move showtimes from `fromId` to `toId`, dropping collisions,
  // then delete the source movie row. Safe to call mid-loop.
  async function mergeMovie(fromId: number, toId: number, title: string) {
    // Delete showtimes from `fromId` that would collide with existing `toId` showtimes
    await db.execute(sql`
      DELETE FROM showtimes s_from
      WHERE s_from.movie_id = ${fromId}
        AND EXISTS (
          SELECT 1 FROM showtimes s_to
          WHERE s_to.movie_id = ${toId}
            AND s_to.cinema_id = s_from.cinema_id
            AND s_to.date = s_from.date
            AND s_to.time = s_from.time
            AND s_to.format = s_from.format
            AND s_to.language = s_from.language
        )
    `);
    await db.execute(sql`UPDATE showtimes SET movie_id = ${toId} WHERE movie_id = ${fromId}`);
    await db.delete(movies).where(eq(movies.id, fromId));
    console.log(`  ${info} Merged duplicate ${c.cyan}${title}${c.reset} → id=${toId}`);
  }

  for (const movie of allMovies) {
    try {
    // Skip movies that already have the core enrichment fields.
    // New movies (from scrapers) have these fields null and will be processed.
    const hasCore =
      !!movie.posterUrl &&
      !!movie.synopsis &&
      !!movie.tmdbId &&
      !!(movie as any).castJson &&
      !!movie.genres;
    if (hasCore) {
      skipped++;
      continue;
    }

    const key = normalize(movie.title);
    const known = KNOWN_MOVIES[key];

    // Patch with manual overrides (always applied first)
    const patch: Partial<typeof movie> = {};
    if (known) {
      if (known.tmdbId          !== undefined) patch.tmdbId          = known.tmdbId;
      if (known.originalTitle   !== undefined) patch.originalTitle   = known.originalTitle;
      if (known.posterUrl       !== undefined) patch.posterUrl       = known.posterUrl;
      if (known.synopsis        !== undefined) patch.synopsis        = known.synopsis;
      if (known.genres          !== undefined) patch.genres          = known.genres;
      if (known.releaseDate     !== undefined) patch.releaseDate     = known.releaseDate;
      if (known.rating          !== undefined) patch.rating          = known.rating;
      if (known.trailerUrl      !== undefined) patch.trailerUrl      = known.trailerUrl;
      if (known.imdbId          !== undefined) patch.imdbId          = known.imdbId;
      if (known.imdbScore       !== undefined) patch.imdbScore       = known.imdbScore;
      if (known.imdbVotes       !== undefined) patch.imdbVotes       = known.imdbVotes;
      if (known.rtTomatometer   !== undefined) patch.rtTomatometer   = known.rtTomatometer;
      if (known.rtAudience      !== undefined) patch.rtAudience      = known.rtAudience;
      if (known.metacriticScore !== undefined) patch.metacriticScore = known.metacriticScore;
      if (known.letterboxdScore !== undefined) patch.letterboxdScore = known.letterboxdScore;
      if (known.director        !== undefined) patch.director        = known.director;
      if (known.cast            !== undefined) patch.cast            = known.cast;
      if (known.castJson        !== undefined) patch.castJson        = known.castJson;
    }

    // Auto-merge: if KNOWN_MOVIES forced a tmdb_id that already belongs to
    // another row, merge this one into the canonical row instead of updating.
    if (patch.tmdbId && patch.tmdbId !== movie.tmdbId && usedTmdbIds.has(patch.tmdbId)) {
      const canonicalId = tmdbIdToMovieId.get(patch.tmdbId);
      if (canonicalId && canonicalId !== movie.id) {
        await mergeMovie(movie.id, canonicalId, movie.title);
        merged++;
        continue;
      }
    }

    // ── TMDB enrichment ──────────────────────────────────────────
    const needsTmdb = tmdbKey && (!movie.posterUrl && !patch.posterUrl || !movie.trailerUrl && !patch.trailerUrl);
    let tmdbEnglishTitle: string | undefined;
    if (needsTmdb || (tmdbKey && (patch.tmdbId ?? movie.tmdbId) && patch.letterboxdScore == null)) {
      const existingTmdbId = patch.tmdbId ?? movie.tmdbId;
      let tmdbData: TmdbMovieData | null = null;

      if (existingTmdbId) {
        tmdbData = await tmdbById(existingTmdbId, tmdbKey!);
      } else if (needsTmdb) {
        console.log(`  ${info} TMDB search: ${c.cyan}${movie.title}${c.reset}`);
        tmdbData = await tmdbSearch(movie.title, tmdbKey!);
      }

      if (tmdbData) {
        tmdbEnglishTitle = tmdbData.englishTitle || undefined;
        if (needsTmdb) {
          const newTmdbId = tmdbData.tmdbId;
          // Auto-merge: TMDB matched a movie that already exists under another id.
          if (!patch.tmdbId && newTmdbId && usedTmdbIds.has(newTmdbId)) {
            const canonicalId = tmdbIdToMovieId.get(newTmdbId);
            if (canonicalId && canonicalId !== movie.id) {
              await mergeMovie(movie.id, canonicalId, movie.title);
              merged++;
              continue;
            }
          }
          if (!patch.tmdbId && newTmdbId && !usedTmdbIds.has(newTmdbId)) {
            patch.tmdbId = newTmdbId;
            usedTmdbIds.add(newTmdbId);
            tmdbIdToMovieId.set(newTmdbId, movie.id);
          }
          if (!patch.originalTitle   && tmdbData.originalTitle)   patch.originalTitle   = tmdbData.originalTitle;
          if (!patch.posterUrl       && tmdbData.posterUrl)       patch.posterUrl       = tmdbData.posterUrl;
          if (!patch.synopsis        && tmdbData.synopsis)        patch.synopsis        = tmdbData.synopsis;
          if (!patch.genres          && tmdbData.genres)          patch.genres          = tmdbData.genres;
          if (!patch.releaseDate     && tmdbData.releaseDate)     patch.releaseDate     = tmdbData.releaseDate;
          if (!patch.trailerUrl      && tmdbData.trailerUrl)      patch.trailerUrl      = tmdbData.trailerUrl;
          if (!patch.imdbId          && tmdbData.imdbId)          patch.imdbId          = tmdbData.imdbId;
          if (!movie.durationMinutes && tmdbData.durationMinutes) patch.durationMinutes = tmdbData.durationMinutes;
        }
      }
      await sleep(250); // ~4 req/s, well within TMDB limits
    }

    // ── OMDB ratings + cast ───────────────────────────────────────
    const imdbId = patch.imdbId ?? movie.imdbId;
    if (omdbKey && imdbId) {
      const omdb = await omdbFetch(imdbId, omdbKey);
      if (omdb) {
        // Always refresh ratings from OMDB unless manually overridden in KNOWN_MOVIES
        if (omdb.imdbScore       !== null && patch.imdbScore       == null) patch.imdbScore       = omdb.imdbScore;
        if (omdb.imdbVotes       !== null && patch.imdbVotes       == null) patch.imdbVotes       = omdb.imdbVotes;
        if (omdb.rtTomatometer   !== null && patch.rtTomatometer   == null) patch.rtTomatometer   = omdb.rtTomatometer;
        if (omdb.metacriticScore !== null && patch.metacriticScore == null) patch.metacriticScore = omdb.metacriticScore;
        // Director/cast: set if not already in DB
        if (omdb.director !== null && !movie.director && patch.director == null) patch.director = omdb.director;
        if (omdb.cast     !== null && !movie.cast     && patch.cast     == null) patch.cast     = omdb.cast;
      }
      // Fallback: scrape IMDb directly if OMDB had no score
      if ((patch.imdbScore == null) && (movie.imdbScore == null) && imdbId) {
        const direct = await imdbDirectScore(imdbId);
        if (direct) {
          patch.imdbScore = direct.score;
          if (direct.votes > 0) patch.imdbVotes = direct.votes;
        }
        await sleep(300);
      }
      await sleep(150);
    }

    // ── TMDB cast photos ─────────────────────────────────────────
    const tmdbIdForCredits = patch.tmdbId ?? movie.tmdbId;
    const hasCastJson = patch.castJson != null || (movie as any).castJson != null;
    if (tmdbKey && tmdbIdForCredits && !hasCastJson) {
      const castMembers = await tmdbCredits(tmdbIdForCredits, tmdbKey);
      if (castMembers.length > 0) patch.castJson = JSON.stringify(castMembers);
      await sleep(250);
    }

    // ── RT + Metacritic direct scrape (fallback when OMDB had no data) ──
    const needsRT = (patch.rtTomatometer   == null) && (movie.rtTomatometer   == null);
    const needsMC = (patch.metacriticScore == null) && (movie.metacriticScore == null);
    if (needsRT || needsMC) {
      const origTitle  = patch.originalTitle ?? movie.originalTitle;
      const releaseYear = (patch.releaseDate ?? movie.releaseDate ?? "").slice(0, 4) || undefined;
      const titleList  = [...new Set([tmdbEnglishTitle, origTitle, movie.title].filter(Boolean) as string[])];
      if (titleList.length > 0) {
        if (needsRT) {
          const rt = await rtDirectScore(titleList, releaseYear);
          if (rt !== null) patch.rtTomatometer = rt;
          await sleep(400);
        }
        if (needsMC) {
          const mc = await metacriticDirectScore(titleList, releaseYear);
          if (mc !== null) patch.metacriticScore = mc;
          await sleep(400);
        }
      }
    }

    // ── Letterboxd rating ─────────────────────────────────────────
    // Always re-scrape unless KNOWN_MOVIES provided a manual override
    if (patch.letterboxdScore == null) {
      const origTitle = patch.originalTitle ?? movie.originalTitle;
      if (origTitle) {
        const releaseYear = (patch.releaseDate ?? movie.releaseDate ?? "").slice(0, 4) || undefined;
        const score = await letterboxdRating(origTitle, releaseYear, tmdbEnglishTitle);
        if (score !== null) patch.letterboxdScore = score;
        await sleep(800);
      }
    }

    if (Object.keys(patch).length > 0) {
      await db.update(movies).set({ ...patch, ratingsUpdatedAt: now })
        .where(eq(movies.id, movie.id));
      const trailer = patch.trailerUrl ?? movie.trailerUrl;
      const poster  = patch.posterUrl  ?? movie.posterUrl;
      const icons = [poster ? "🖼" : "", trailer ? "▶" : ""].filter(Boolean).join(" ");
      console.log(`  ${ok} ${movie.title} ${c.gray}${icons}${c.reset}`);
      updated++;
    } else {
      skipped++;
    }
    } catch (e: any) {
      failed++;
      console.log(`  ${warn} ${movie.title} ${c.red}(skipped: ${e.message?.slice(0, 80) || 'unknown error'})${c.reset}`);
    }
  }

  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(movies);
  console.log(`\n${c.green}${c.bold}✓ ${updated} películas actualizadas${c.reset}  ${c.gray}(${skipped} sin cambios, ${merged} fusionadas, ${failed} fallidas, ${total} total)${c.reset}\n`);
  await closeDb();
}

main().catch(e => { console.error(`\x1b[31m✗\x1b[0m Error:`, e.message); process.exit(1); });
