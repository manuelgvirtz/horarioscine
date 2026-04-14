import { db, closeDb } from "./db";
import { showtimes, cinemas, movies } from "../src/db/schema";
import { eq, isNotNull } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      cinemaName: cinemas.name,
      movieTitle: movies.title,
      time: showtimes.time,
      bookingUrl: showtimes.bookingUrl,
    })
    .from(showtimes)
    .innerJoin(cinemas, eq(showtimes.cinemaId, cinemas.id))
    .innerJoin(movies, eq(showtimes.movieId, movies.id))
    .where(isNotNull(showtimes.bookingUrl))
    .limit(50);

  for (const row of rows) {
    console.log(`${row.cinemaName} | ${row.movieTitle} | ${row.time} | ${row.bookingUrl}`);
  }

  console.log(`\nTotal: ${rows.length} rows`);
  await closeDb();
}

main();
