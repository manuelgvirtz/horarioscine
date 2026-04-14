/**
 * export-excel.ts
 * Exports showtimes + editable movie ratings to admin/showtimes.xlsx
 *
 * Sheets:
 *   Funciones  — editable showtimes (next N days)
 *   Películas  — editable movie ratings (IMDb, RT, Metacritic, Letterboxd)
 *   Cines      — reference only
 *
 * Usage:
 *   npm run export:excel            → next 7 days
 *   npm run export:excel -- --days 14
 *   npm run export:excel -- --from 2026-04-01 --to 2026-04-10
 */

import { db, closeDb } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import * as XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";

// ── Args ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };

const TZ = "America/Argentina/Buenos_Aires";

function localDate(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

const fromDate = getArg("--from") ?? localDate(0);
const toDate   = getArg("--to")   ?? localDate(Number(getArg("--days") ?? 7));

async function main() {
  // ── DB ─────────────────────────────────────────────────────────────────────────
  const showtimeRows = await db
    .select({
      id: showtimes.id, date: showtimes.date, time: showtimes.time,
      movie: movies.title, cinema: cinemas.name,
      format: showtimes.format, language: showtimes.language,
      booking_url: showtimes.bookingUrl,
    })
    .from(showtimes)
    .innerJoin(movies, eq(showtimes.movieId, movies.id))
    .innerJoin(cinemas, eq(showtimes.cinemaId, cinemas.id))
    .where(and(sql`${showtimes.date} >= ${fromDate}`, sql`${showtimes.date} < ${toDate}`))
    .orderBy(showtimes.date, cinemas.name, showtimes.time);

  const movieRows = await db.select().from(movies).orderBy(asc(movies.title));
  const cinemaRows = await db.select().from(cinemas).orderBy(asc(cinemas.zone), asc(cinemas.name));

  await closeDb();

  // ── Workbook ───────────────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Funciones ─────────────────────────────────────────────────────────
  const showtimeData = [
    ["ID", "Fecha", "Hora", "Película", "Cine", "Formato", "Idioma", "URL Compra"],
    ...showtimeRows.map(r => [
      r.id, r.date, r.time, r.movie, r.cinema,
      r.format, r.language, r.booking_url ?? "",
    ]),
  ];

  const wsShowtimes = XLSX.utils.aoa_to_sheet(showtimeData);
  wsShowtimes["!cols"] = [
    { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 38 },
    { wch: 30 }, { wch: 8 }, { wch: 8 }, { wch: 40 },
  ];
  wsShowtimes["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, wsShowtimes, "Funciones");

  // ── Sheet 2: Películas (editable ratings) ─────────────────────────────────────
  const movieSheetData = [
    ["ID", "Título", "IMDb", "RT Tomatómetro", "RT Audiencia", "Metacritic", "Letterboxd"],
    ...movieRows.map(r => [
      r.id, r.title,
      r.imdbScore ?? "", r.rtTomatometer ?? "",
      r.rtAudience ?? "", r.metacriticScore ?? "",
      r.letterboxdScore ?? "",
    ]),
  ];

  const wsMovies = XLSX.utils.aoa_to_sheet(movieSheetData);
  wsMovies["!cols"] = [
    { wch: 6 }, { wch: 38 }, { wch: 10 }, { wch: 16 },
    { wch: 14 }, { wch: 12 }, { wch: 12 },
  ];
  wsMovies["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, wsMovies, "Películas");

  // ── Sheet 3: Cines (reference) ─────────────────────────────────────────────────
  const cinemaData = [
    ["ID", "Nombre", "Cadena", "Zona", "Ciudad", "Dirección"],
    ...cinemaRows.map(r => [r.id, r.name, r.chain, r.zone, r.city, r.address ?? ""]),
  ];

  const wsCinemas = XLSX.utils.aoa_to_sheet(cinemaData);
  wsCinemas["!cols"] = [
    { wch: 6 }, { wch: 34 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCinemas, "Cines");

  // ── Write file ─────────────────────────────────────────────────────────────────
  const outDir = path.join(process.cwd(), "admin");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const outFile = path.join(outDir, "showtimes.xlsx");
  const tmpFile = outFile + ".tmp.xlsx";
  XLSX.writeFile(wb, tmpFile);

  // Retry rename in case OneDrive is briefly locking the file
  let renamed = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
      fs.renameSync(tmpFile, outFile);
      renamed = true;
      break;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  if (!renamed) {
    console.error(`\x1b[31m✗\x1b[0m El archivo está bloqueado. Cerrá Excel y desactivá la sync de OneDrive antes de exportar.`);
    process.exit(1);
  }

  const c = { green: "\x1b[32m", reset: "\x1b[0m", bold: "\x1b[1m", gray: "\x1b[90m" };
  console.log(`\n${c.green}${c.bold}✓ Exportado:${c.reset} admin/showtimes.xlsx`);
  console.log(`${c.gray}  Rango: ${fromDate} → ${toDate}`);
  console.log(`  ${showtimeRows.length} funciones · ${movieRows.length} películas · ${cinemaRows.length} cines${c.reset}\n`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
