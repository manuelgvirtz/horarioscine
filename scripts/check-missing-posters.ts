import { db, closeDb } from "./db";
import { movies } from "../src/db/schema";
import { isNull } from "drizzle-orm";

async function main() {
  const rows = await db.select({
    id: movies.id,
    title: movies.title,
    tmdbId: movies.tmdbId,
    posterUrl: movies.posterUrl,
    imdbId: movies.imdbId,
    originalTitle: movies.originalTitle,
  }).from(movies).where(isNull(movies.posterUrl));

  console.log(`\nMovies missing poster_url (${rows.length}):\n`);
  for (const r of rows) {
    console.log(`  id=${r.id} tmdb=${r.tmdbId ?? "null"} imdb=${r.imdbId ?? "null"}`);
    console.log(`    title: "${r.title}"`);
    if (r.originalTitle) console.log(`    original: "${r.originalTitle}"`);
  }
  await closeDb();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
