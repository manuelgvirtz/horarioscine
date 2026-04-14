// --- Literal Union Types ---

export type Zone =
  | "CABA"
  | "GBA Norte"
  | "GBA Sur"
  | "GBA Oeste"
  | "Córdoba"
  | "Rosario"
  | "Mendoza"
  | "Salta"
  | "Tucumán"
  | "Neuquén"
  | "Santa Fe"
  | "La Plata"
  | "San Juan";

export const ZONES: Zone[] = [
  "CABA",
  "GBA Norte",
  "GBA Sur",
  "GBA Oeste",
  "Córdoba",
  "Rosario",
  "Mendoza",
  "Salta",
  "Tucumán",
  "Neuquén",
  "Santa Fe",
  "La Plata",
  "San Juan",
];

export type Chain = "cinemark" | "cinepolis" | "showcase" | "atlas" | "multiplex" | "cinemacenter" | "independiente";

export const CHAINS: { value: Chain; label: string }[] = [
  { value: "cinemark", label: "Cinemark Hoyts" },
  { value: "cinepolis", label: "Cinépolis" },
  { value: "showcase", label: "Showcase" },
  { value: "atlas", label: "Atlas Cines" },
  { value: "multiplex", label: "Multiplex" },
  { value: "cinemacenter", label: "Cinemacenter" },
  { value: "independiente", label: "Cine Independiente" },
];

export type Format = "2D" | "3D" | "IMAX" | "4DX" | "XD" | "DBOX";

export const FORMATS: Format[] = ["2D", "3D", "IMAX", "4DX"];

export type Language = "cas" | "sub" | "vos";

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "cas", label: "Doblada" },
  { value: "sub", label: "Subtitulada" },
];

// --- Core Interfaces ---

export type CinemaType = "comercial" | "independiente";

export interface Cinema {
  id: number;
  name: string;
  slug?: string;
  chain: Chain;
  zone: Zone;
  city: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
  type: CinemaType | null;
}

export interface MovieRatings {
  imdb?: {
    score: number;
    votes?: number;
    url: string;
  };
  rottenTomatoes?: {
    tomatometer: number;
    audience?: number;
  };
  metacritic?: {
    score: number;
  };
  letterboxd?: {
    score: number;
  };
}

export interface CastMember {
  name: string;
  profileUrl: string | null;
}

export interface Movie {
  id: number;
  title: string;
  originalTitle: string | null;
  tmdbId: number | null;
  posterUrl: string | null;
  synopsis: string | null;
  durationMinutes: number | null;
  rating: string | null;
  genres: string[];
  releaseDate: string | null;
  imdbId: string | null;
  director: string | null;
  cast: string | null;       // comma-separated top-3 actors
  castJson: string | null;   // JSON: CastMember[]
  ratings?: MovieRatings;
}

export interface Showtime {
  id: number;
  movieId: number;
  cinemaId: number;
  date: string;
  time: string;
  format: Format;
  language: Language;
  bookingUrl: string | null;
  priceCents: number | null;
  scrapedAt: string;
}

// --- Derived Types ---

export interface MovieWithShowtimeCount extends Movie {
  showtimeCount: number;
}

export interface CinemaWithShowtimeCount extends Cinema {
  showtimeCount: number;
}

export interface ShowtimeWithDetails extends Showtime {
  movie: Movie;
  cinema: Cinema;
}

export interface PriceTiers {
  general?: number;
  jubilado?: number;
  menor?: number;
  estudiante?: number;
  dosxuno?: number;
}

export type PricesByFormat = Record<string, PriceTiers>;

export interface ShowtimeItem {
  id: number;
  time: string;
  format: string;
  language: string;
  bookingUrl: string | null;
  priceCents: number | null;
}

export interface FilterParams {
  zona?: string;
  cinema_id?: string;
  movie_id?: string;
  date?: string;
  format?: string;
  language?: string;
  type?: string;
  q?: string;
  minTime?: string;
}
