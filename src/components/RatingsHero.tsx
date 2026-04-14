import Image from "next/image";
import type { MovieRatings } from "@/types";

export function RatingsHero({ ratings }: { ratings?: MovieRatings }) {
  if (!ratings) return null;

  return (
    <div className="flex flex-wrap gap-3 md:gap-6 items-center">
      {ratings.imdb && (
        <div className="flex items-center gap-1.5 md:gap-2">
          <div className="bg-[#F5C518] text-black px-1.5 py-0.5 rounded text-[10px] md:text-xs font-black leading-none tracking-wide">IMDb</div>
          <span className="text-xl md:text-2xl font-black font-headline text-on-surface leading-none">{Math.round(ratings.imdb.score * 10)}%</span>
        </div>
      )}
      {ratings.rottenTomatoes && (
        <div className="flex items-center gap-1.5 md:gap-2">
          <Image src="/rottentomatoes.svg" alt="Rotten Tomatoes" width={20} height={20} className="md:w-7 md:h-7" />
          <span className="text-xl md:text-2xl font-black font-headline text-on-surface leading-none">{ratings.rottenTomatoes.tomatometer}%</span>
        </div>
      )}
      {ratings.metacritic && (
        <div className="flex items-center gap-1.5 md:gap-2">
          <Image src="/metacritic.svg" alt="Metacritic" width={20} height={20} className="md:w-7 md:h-7" />
          <span className="text-xl md:text-2xl font-black font-headline text-on-surface leading-none">{ratings.metacritic.score}%</span>
        </div>
      )}
      {ratings.letterboxd && (
        <div className="flex items-center gap-1.5 md:gap-2">
          <Image src="/letterboxd.svg" alt="Letterboxd" width={20} height={20} className="md:w-7 md:h-7 rounded-sm" />
          <span className="text-xl md:text-2xl font-black font-headline text-on-surface leading-none">{Math.round(ratings.letterboxd.score * 20)}%</span>
        </div>
      )}
    </div>
  );
}
