/**
 * One-time import: Cine Lorca showtimes (April 2–8, 2026)
 * Usage: npx tsx scripts/import-lorca.ts
 */
import { db, closeDb } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { ilike } from "drizzle-orm";


// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const RAW_DATA = [
  {
    date: "02/04/2026",
    movies: [
      { title: "Calle Málaga", language: "sub", showtimes: ["13:45", "16:10", "18:20"] },
      { title: "Gioia Mia: Un verano en Sicilia", language: "sub", showtimes: ["15:50", "20:25"] },
      { title: "Nuremberg: el juicio del siglo", language: "sub", showtimes: ["17:30"] },
      { title: "La Grazia: la belleza de la duda", language: "sub", showtimes: ["13:50", "22:25"] },
      { title: "Un fantasma a su servicio", language: "sub", showtimes: ["20:05"] },
      { title: "El agente secreto", language: "sub", showtimes: ["22:05"] },
    ],
  },
  {
    date: "03/04/2026",
    movies: [
      { title: "Calle Málaga", language: "sub", showtimes: ["13:45", "16:10", "18:20"] },
      { title: "Gioia Mia: Un verano en Sicilia", language: "sub", showtimes: ["15:50", "20:25"] },
      { title: "Nuremberg: el juicio del siglo", language: "sub", showtimes: ["17:30"] },
      { title: "La Grazia: la belleza de la duda", language: "sub", showtimes: ["13:50", "22:25"] },
      { title: "Un fantasma a su servicio", language: "sub", showtimes: ["20:05"] },
      { title: "El agente secreto", language: "sub", showtimes: ["22:05"] },
    ],
  },
  {
    date: "04/04/2026",
    movies: [
      { title: "Calle Málaga", language: "sub", showtimes: ["13:45", "16:10", "18:20"] },
      { title: "Gioia Mia: Un verano en Sicilia", language: "sub", showtimes: ["15:50", "20:25"] },
      { title: "Nuremberg: el juicio del siglo", language: "sub", showtimes: ["17:30"] },
      { title: "La Grazia: la belleza de la duda", language: "sub", showtimes: ["13:50", "22:25"] },
      { title: "Un fantasma a su servicio", language: "sub", showtimes: ["20:05"] },
      { title: "El agente secreto", language: "sub", showtimes: ["22:05"] },
    ],
  },
  {
    date: "05/04/2026",
    movies: [
      { title: "Calle Málaga", language: "sub", showtimes: ["13:45", "16:10", "18:20"] },
      { title: "Gioia Mia: Un verano en Sicilia", language: "sub", showtimes: ["15:50", "20:25"] },
      { title: "Nuremberg: el juicio del siglo", language: "sub", showtimes: ["17:30"] },
      { title: "La Grazia: la belleza de la duda", language: "sub", showtimes: ["13:50", "22:25"] },
      { title: "Un fantasma a su servicio", language: "sub", showtimes: ["20:05"] },
      { title: "El agente secreto", language: "sub", showtimes: ["22:05"] },
    ],
  },
  {
    date: "06/04/2026",
    movies: [
      { title: "Calle Málaga", language: "sub", showtimes: ["13:45", "16:10", "18:20"] },
      { title: "Gioia Mia: Un verano en Sicilia", language: "sub", showtimes: ["15:50", "20:25"] },
      { title: "Nuremberg: el juicio del siglo", language: "sub", showtimes: ["17:30"] },
      { title: "La Grazia: la belleza de la duda", language: "sub", showtimes: ["13:50", "22:25"] },
      { title: "Un fantasma a su servicio", language: "sub", showtimes: ["20:05"] },
      { title: "El agente secreto", language: "sub", showtimes: ["22:05"] },
    ],
  },
  {
    date: "07/04/2026",
    movies: [
      { title: "Calle Málaga", language: "sub", showtimes: ["13:45", "16:10", "18:20"] },
      { title: "Gioia Mia: Un verano en Sicilia", language: "sub", showtimes: ["15:50", "20:25"] },
      { title: "Nuremberg: el juicio del siglo", language: "sub", showtimes: ["17:30"] },
      { title: "La Grazia: la belleza de la duda", language: "sub", showtimes: ["13:50", "22:25"] },
      { title: "Un fantasma a su servicio", language: "sub", showtimes: ["20:05"] },
      { title: "El agente secreto", language: "sub", showtimes: ["22:05"] },
    ],
  },
  {
    date: "08/04/2026",
    movies: [
      { title: "Calle Málaga", language: "sub", showtimes: ["13:45", "16:10", "18:20"] },
      { title: "Gioia Mia: Un verano en Sicilia", language: "sub", showtimes: ["15:50", "20:25"] },
      { title: "Nuremberg: el juicio del siglo", language: "sub", showtimes: ["17:30"] },
      { title: "La Grazia: la belleza de la duda", language: "sub", showtimes: ["13:50", "22:25"] },
      { title: "Un fantasma a su servicio", language: "sub", showtimes: ["20:05"] },
      { title: "El agente secreto", language: "sub", showtimes: ["22:05"] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIsoDate(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function makeSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Normalize for fuzzy matching: lowercase + strip accents + strip punctuation
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\nCine Lorca — import showtimes\n");

  // 1. Find Cine Lorca
  const [cinema] = await db
    .select({ id: cinemas.id, name: cinemas.name })
    .from(cinemas)
    .where(ilike(cinemas.name, "%lorca%"));

  if (!cinema) {
    throw new Error("Cine Lorca not found in cinemas table — run seed.ts first");
  }
  console.log(`✓ Cinema: ${cinema.name} (id=${cinema.id})`);

  // 2. Collect unique movie titles from input
  const uniqueTitles = [...new Set(RAW_DATA.flatMap((d) => d.movies.map((m) => m.title)))];

  // 3. Load all existing movies for matching
  const allMovies = await db.select({ id: movies.id, title: movies.title }).from(movies);
  const normalizedExisting = allMovies.map((m) => ({ ...m, norm: normalize(m.title) }));

  const movieIdMap = new Map<string, number>(); // input title → db id

  const toInsert: string[] = [];

  for (const title of uniqueTitles) {
    const norm = normalize(title);
    // Exact normalized match
    let match = normalizedExisting.find((m) => m.norm === norm);
    // Fallback: check if normalized existing starts with first 8 words of input
    if (!match) {
      const words = norm.split(" ").slice(0, 5).join(" ");
      match = normalizedExisting.find((m) => m.norm.startsWith(words));
    }
    if (match) {
      console.log(`  matched: "${title}" → "${match.title}" (id=${match.id})`);
      movieIdMap.set(title, match.id);
    } else {
      toInsert.push(title);
    }
  }

  // 4. Insert missing movies
  if (toInsert.length > 0) {
    console.log(`\nInserting ${toInsert.length} new movies...`);
    for (const title of toInsert) {
      const [inserted] = await db
        .insert(movies)
        .values({ title, slug: makeSlug(title) })
        .returning({ id: movies.id });
      movieIdMap.set(title, inserted.id);
      console.log(`  + "${title}" (id=${inserted.id})`);
    }
  }

  // 5. Collect dates to process
  const dates = RAW_DATA.map((d) => toIsoDate(d.date));

  // 6. Build and insert all showtimes (upsert — skip duplicates)
  const scrapedAt = new Date().toISOString();
  const rows: {
    movieId: number;
    cinemaId: number;
    date: string;
    time: string;
    format: string;
    language: string;
    scrapedAt: string;
  }[] = [];

  for (const day of RAW_DATA) {
    const isoDate = toIsoDate(day.date);
    for (const movie of day.movies) {
      const movieId = movieIdMap.get(movie.title);
      if (!movieId) throw new Error(`No id for movie "${movie.title}"`);
      for (const time of movie.showtimes) {
        rows.push({
          movieId,
          cinemaId: cinema.id,
          date: isoDate,
          time,
          format: "2D",
          language: movie.language,
          scrapedAt,
        });
      }
    }
  }

  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(showtimes).values(rows.slice(i, i + BATCH)).onConflictDoNothing();
  }
  console.log(`\n✓ Inserted ${rows.length} showtimes across ${dates.length} days (duplicates skipped)`);

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
