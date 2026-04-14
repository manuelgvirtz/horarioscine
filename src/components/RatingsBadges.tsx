import Image from "next/image";
import { metacriticInlineStyle } from "@/lib/utils";
import type { MovieRatings } from "@/types";

/** Brand colors for third-party rating services */
export const RATING_COLORS = {
  imdb:       "#F5C518",
  rt:         "#FA320A",
  letterboxd: "#00e054",
} as const;

/**
 * RatingsBadges — canonical ratings display primitive.
 *
 * Renders IMDb, Rotten Tomatoes, Metacritic, and Letterboxd scores
 * as tinted badge pills. Use this wherever ratings appear in a row
 * (e.g. cinema listing cards, search results).
 *
 * For the movie hero, use <RatingsHero> (logo + large score layout).
 * For the poster overlay, inline badges are used directly in MovieCard
 * (layout is too constrained to share).
 */
export function RatingsBadges({ ratings }: { ratings?: MovieRatings }) {
  if (!ratings) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ratings.imdb && (
        <span
          className="px-2.5 py-1 rounded-md text-xs font-bold"
          style={{
            background: `${RATING_COLORS.imdb}1a`,
            color: RATING_COLORS.imdb,
            border: `1px solid ${RATING_COLORS.imdb}33`,
          }}
        >
          IMDb {Math.round(ratings.imdb.score * 10)}%
        </span>
      )}

      {ratings.rottenTomatoes && (
        <span
          className="px-2.5 py-1 rounded-md text-xs font-bold"
          style={{
            background: `${RATING_COLORS.rt}1a`,
            color: RATING_COLORS.rt,
            border: `1px solid ${RATING_COLORS.rt}33`,
          }}
        >
          RT {ratings.rottenTomatoes.tomatometer}%
        </span>
      )}

      {ratings.metacritic && (
        <span
          className="px-2.5 py-1 rounded-md text-xs font-bold"
          style={metacriticInlineStyle(ratings.metacritic.score)}
        >
          MC {ratings.metacritic.score}%
        </span>
      )}

      {ratings.letterboxd && (
        <span
          className="px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5"
          style={{
            background: `${RATING_COLORS.letterboxd}1a`,
            border: `1px solid ${RATING_COLORS.letterboxd}33`,
            color: RATING_COLORS.letterboxd,
          }}
        >
          <Image
            src="/letterboxd.svg"
            alt="Letterboxd"
            width={14}
            height={14}
            className="rounded-sm"
          />
          {Math.round(ratings.letterboxd.score * 20)}%
        </span>
      )}
    </div>
  );
}
