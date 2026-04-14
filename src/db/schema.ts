export const cinemas = pgTable("cinemas", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug"),
  chain: text("chain").notNull(),
  zone: text("zone").notNull(),
  city: text("city").notNull(),
  address: text("address"),
  phone: text("phone"),
  lat: real("lat"),
  lng: real("lng"),
  url: text("url"),
  type: text("type"), // "comercial" | "independiente"
});

export const movies = pgTable("movies", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug"),
  originalTitle: text("original_title"),
  tmdbId: integer("tmdb_id").unique(),
  posterUrl: text("poster_url"),
  synopsis: text("synopsis"),
  durationMinutes: integer("duration_minutes"),
  rating: text("rating"),
  genres: text("genres"),
  releaseDate: text("release_date"),
  trailerUrl: text("trailer_url"),
  // Cast & crew
  director: text("director"),         // e.g. "Christopher Nolan"
  cast: text("cast"),                 // comma-separated top-3 actors
  // Ratings
  imdbId: text("imdb_id"),
  imdbScore: real("imdb_score"),
  imdbVotes: integer("imdb_votes"),
  rtTomatometer: integer("rt_tomatometer"),
  rtAudience: integer("rt_audience"),
  metacriticScore: integer("metacritic_score"),
  letterboxdScore: real("letterboxd_score"),
  ratingsUpdatedAt: text("ratings_updated_at"),
  castJson: text("cast_json"),  // JSON: [{name, profileUrl}]
  debutWeek: text("debut_week"), // Thursday date (YYYY-MM-DD) of the week this movie first appeared
});

export const showtimes = pgTable(
  "showtimes",
  {
    id: serial("id").primaryKey(),
    movieId: integer("movie_id")
      .notNull()
      .references(() => movies.id),
    cinemaId: integer("cinema_id")
      .notNull()
      .references(() => cinemas.id),
    date: text("date").notNull(),
    time: text("time").notNull(),
    format: text("format").notNull(),
    language: text("language").notNull(),
    bookingUrl: text("booking_url"),
    priceCents: integer("price_cents"),
    scrapedAt: text("scraped_at").notNull(),
  },
  (table) => ({
    dateCinemaIdx: index("idx_showtimes_date_cinema").on(table.date, table.cinemaId),
    dateMovieIdx: index("idx_showtimes_date_movie").on(table.date, table.movieId),
    uniqueShowtime: uniqueIndex("idx_showtimes_unique").on(
      table.movieId, table.cinemaId, table.date, table.time, table.format, table.language
    ),
  })
);

export const prices = pgTable(
  "prices",
  {
    id: serial("id").primaryKey(),
    chain: text("chain").notNull(),
    cinemaId: integer("cinema_id").references(() => cinemas.id),
    format: text("format").notNull(),
    dayType: text("day_type").notNull(),       // "weekday" | "wednesday" | "weekend"
    audienceType: text("audience_type").notNull(), // "general" | "jubilado" | "menor" | "estudiante"
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").default("ARS"),
    validFrom: text("valid_from").notNull(),
    validUntil: text("valid_until"),
    source: text("source"),
    scrapedAt: text("scraped_at").notNull(),
  },
  (table) => ({
    uniquePrice: uniqueIndex("idx_prices_unique").on(
      table.chain, table.cinemaId, table.format, table.dayType, table.audienceType, table.validFrom
    ),
  })
);
