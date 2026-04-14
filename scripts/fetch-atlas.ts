/**
 * fetch-atlas.ts
 * Obtiene los horarios de todos los cines Atlas y los importa directamente
 * a la base de datos (sin pasar por CSV).
 *
 * API flow (nuevo esquema):
 *  1. GetPeliculasPorComplejo?codComplejo=X     → lista de películas en el cine
 *  2. GetFechasDisponibles?codComplejo=X&codPelicula=Y  → fechas disponibles
 *  3. GetCacheFuncionesComplejoPeliculaFecha?complejoId=X&codPelicula=Y&fecha=D → horarios
 *
 * Uso:
 *   npx tsx scripts/fetch-atlas.ts
 */

import { db, closeDb, getCurrentDebutWeek } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { eq, and, inArray, sql, gte } from "drizzle-orm";

// ── Colores ───────────────────────────────────────────────────────────
const c = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", gray: "\x1b[90m" };
const ok   = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const err  = `${c.red}✗${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── Complejos ─────────────────────────────────────────────────────────
const COMPLEXES: Record<number, { name: string; zone: string; city: string; address: string; lat: number; lng: number }> = {
  191: { name: "Atlas Caballito",      zone: "CABA",      city: "Buenos Aires", address: "Rivadavia 5071, Caballito",                        lat: -34.6183, lng: -58.4402 },
  192: { name: "Atlas Catan",          zone: "GBA Sur",   city: "La Matanza",   address: "Camino de Cintura 2727, Shopping Catan",           lat: -34.7397, lng: -58.6263 },
  194: { name: "Atlas Alcorta",        zone: "CABA",      city: "Buenos Aires", address: "Jerónimo Salguero 3172, Alcorta Shopping",         lat: -34.5806, lng: -58.4080 },
  195: { name: "Atlas Patio Bullrich", zone: "CABA",      city: "Buenos Aires", address: "Av. del Libertador 750, Patio Bullrich",           lat: -34.5771, lng: -58.3940 },
  196: { name: "Atlas Nordelta",       zone: "GBA Norte", city: "Tigre",        address: "Av. de los Lagos 7008, Nordelta Centro Comercial", lat: -34.4072, lng: -58.6505 },
  197: { name: "Atlas Flores",         zone: "CABA",      city: "Buenos Aires", address: "Rivera Indarte 44, Flores",                       lat: -34.6282, lng: -58.4635 },
  198: { name: "Atlas Liniers",        zone: "CABA",      city: "Buenos Aires", address: "Av. Rivadavia 11177, Liniers",                    lat: -34.6378, lng: -58.5231 },
};

// ── Mapeos ────────────────────────────────────────────────────────────
const FORMAT_MAP: Record<string, string> = {
  "2D": "2D", "3D": "3D", "4D": "4DX", "4DX": "4DX", "IMAX": "IMAX",
  "2D PREMIER": "2D", "3D PREMIER": "3D",
};

// ── Timezone ──────────────────────────────────────────────────────────
const TZ = "America/Argentina/Buenos_Aires";
function localToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

// ── Texto ─────────────────────────────────────────────────────────────
function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function capitalize(s: string): string {
  return s.toLowerCase().replace(/:([^\s])/g, ": $1").replace(/-([^\s])/g, "- $1")
    .split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── API helpers ───────────────────────────────────────────────────────
const BASE = "https://www.atlascines.com";

async function getMoviesForComplex(complexId: number): Promise<{ codPelicula: number; titulo: string; duracion: number }[]> {
  const res = await fetch(`${BASE}/Funciones/GetPeliculasPorComplejo?codComplejo=${complexId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: any[] = await res.json();
  // deduplicate by codPelicula
  const seen = new Set<number>();
  return data
    .filter(item => item.cachePeliculas?.codPelicula)
    .map(item => item.cachePeliculas)
    .filter(p => { if (seen.has(p.codPelicula)) return false; seen.add(p.codPelicula); return true; });
}

async function getAvailableDates(complexId: number, codPelicula: number): Promise<string[]> {
  const res = await fetch(`${BASE}/Peliculas/GetFechasDisponibles?codComplejo=${complexId}&codPelicula=${codPelicula}`);
  if (!res.ok) return [];
  const dates: string[] = await res.json();
  return dates.map(d => d.slice(0, 10));
}

interface ShowtimeGroup {
  tecnologiaNombre: string;
  idioma: string;
  funciones: { horaComienzoOriginal: string; subtitulada: boolean; doblada: boolean; codTecnologia: number }[];
}

async function getShowtimesForDate(complexId: number, codPelicula: number, fecha: string): Promise<ShowtimeGroup[]> {
  const res = await fetch(`${BASE}/Peliculas/GetCacheFuncionesComplejoPeliculaFecha?complejoId=${complexId}&codPelicula=${codPelicula}&fecha=${fecha}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function getLanguage(group: ShowtimeGroup, slot: { subtitulada: boolean; doblada: boolean }): string {
  if (slot.subtitulada) return "sub";
  if (slot.doblada)     return "cas";
  return "vos";
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const from = localToday();
  const to   = addDays(from, 14);

  console.log(`\n${c.bold}Atlas Cines — Importador directo a DB${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Rango: ${c.cyan}${from}${c.reset} → ${c.cyan}${to}${c.reset}\n`);

  const scrapedAt = new Date().toISOString();

  const dbCinemas = await db.select().from(cinemas);
  const dbMovies  = await db.select().from(movies);
  const cinemaByName = new Map(dbCinemas.map(cinema => [normalize(cinema.name), cinema]));
  const movieByTitle = new Map(dbMovies.map(movie => [normalize(movie.title), movie]));

  const toInsert: Array<{
    movieId: number; cinemaId: number; date: string; time: string;
    format: string; language: string; bookingUrl: string | null; scrapedAt: string;
  }> = [];

  const atlasComplexIds = Object.keys(COMPLEXES).map(Number);

  // ── Step 0: collect global movie list across all complexes ────────
  // GetPeliculasPorComplejo only returns movies with a showtime at query time.
  // By querying all complexes and taking the union we get a complete list.
  console.log(`${info} Obteniendo catálogo global de películas...`);
  const globalMovieMap = new Map<number, { codPelicula: number; titulo: string; duracion: number }>();
  await Promise.all(
    atlasComplexIds.map(async id => {
      try {
        const list = await getMoviesForComplex(id);
        for (const m of list) globalMovieMap.set(m.codPelicula, m);
      } catch { /* ignore per-complex errors in discovery pass */ }
    })
  );
  const globalMovies = [...globalMovieMap.values()];
  console.log(`${ok} ${globalMovies.length} películas encontradas en el catálogo\n`);

  for (const complexId of atlasComplexIds) {
    const complexInfo = COMPLEXES[complexId];
    let count = 0;

    try {
      // ── Ensure cinema exists ──────────────────────────────────────
      let cinema = cinemaByName.get(normalize(complexInfo.name));
      if (!cinema) {
        console.log(`  ${warn} Cine nuevo, creando: ${c.yellow}${complexInfo.name}${c.reset}`);
        const [inserted] = await db.insert(cinemas).values({
          name: complexInfo.name, chain: "atlas", zone: complexInfo.zone,
          city: complexInfo.city, address: complexInfo.address,
          lat: complexInfo.lat, lng: complexInfo.lng, url: BASE,
        }).returning();
        cinema = inserted;
        cinemaByName.set(normalize(cinema.name), cinema);
      }

      // ── Iterate over global movie list for this complex ───────────
      for (const apiMovie of globalMovies) {
        const title     = capitalize(apiMovie.titulo);
        const titleNorm = normalize(title);

        // ── Step 1: get available dates (skip if none) ──────────
        const dates = (await getAvailableDates(complexId, apiMovie.codPelicula))
          .filter(d => d >= from && d < to);
        if (dates.length === 0) continue;

        // ── Ensure movie exists ─────────────────────────────────
        let movie = movieByTitle.get(titleNorm);

        // Prefix fallback: "La Grazia" → "La Grazia: La Belleza De La Duda"
        if (!movie) {
          for (const [k, v] of movieByTitle) {
            if (k === titleNorm || (k.startsWith(titleNorm) && !/[a-z0-9]/.test(k[titleNorm.length]))) {
              movie = v; break;
            }
          }
        }

        if (!movie) {
          console.log(`  ${warn} Película nueva, creando: ${c.yellow}${title}${c.reset}`);
          const [inserted] = await db.insert(movies).values({
            title, durationMinutes: apiMovie.duracion || null, genres: "", debutWeek: getCurrentDebutWeek(),
          }).returning();
          movie = inserted;
          movieByTitle.set(normalize(movie.title), movie);
        }

        const bookingUrl = `${BASE}/Peliculas?codPelicula=${apiMovie.codPelicula}&codComplejo=${complexId}`;

        // ── Step 2: get showtimes per date (parallel) ───────────
        const dateResults = await Promise.all(
          dates.map(async date => ({ date, groups: await getShowtimesForDate(complexId, apiMovie.codPelicula, date) }))
        );

        for (const { date, groups } of dateResults) {
          for (const group of groups) {
            const format = FORMAT_MAP[group.tecnologiaNombre] ?? group.tecnologiaNombre ?? "2D";
            for (const slot of group.funciones) {
              const time = slot.horaComienzoOriginal.slice(0, 5);
              if (!time.match(/^\d{2}:\d{2}$/)) continue;
              toInsert.push({
                movieId:   movie!.id,
                cinemaId:  cinema!.id,
                date, time, format,
                language:  getLanguage(group, slot),
                bookingUrl,
                scrapedAt,
              });
              count++;
            }
          }
        }
      }

      console.log(`  ${ok} ${complexInfo.name}: ${c.green}${count}${c.reset} funciones`);
    } catch (e: any) {
      console.error(`  ${err} ${complexInfo.name}: ${e.message}`);
    }
  }

  if (toInsert.length === 0) {
    console.log(`\n${warn} No se encontraron horarios para importar.`);
    await closeDb();
    return;
  }

  // ── Purge stale Atlas showtimes for date >= today ─────────────────
  // onConflictDoNothing dedupes identical rows but never removes rows whose
  // source session has since been cancelled or rescheduled. Without this
  // DELETE, phantom showtimes accumulate forever.
  console.log(`\n${info} Limpiando horarios obsoletos de Atlas (desde ${from})…`);
  await db.delete(showtimes).where(
    and(
      gte(showtimes.date, from),
      sql`${showtimes.cinemaId} IN (SELECT id FROM cinemas WHERE chain = 'atlas')`,
    )
  );

  // ── Insert in batches (upsert — skip duplicates) ─────────────────
  const BATCH = 200;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await db.insert(showtimes).values(toInsert.slice(i, i + BATCH)).onConflictDoNothing();
  }

  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(showtimes);
  console.log(`\n${c.green}${c.bold}✓ ${toInsert.length} horarios importados${c.reset}`);
  console.log(`${c.gray}Total en DB: ${total} horarios${c.reset}\n`);

  await closeDb();
}

main().catch(e => {
  console.error(`\n${err} Error:`, e.message);
  process.exit(1);
});
