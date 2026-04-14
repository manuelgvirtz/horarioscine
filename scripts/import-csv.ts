/**
 * import-csv.ts
 * Importa horarios desde un archivo CSV a la base de datos.
 *
 * Uso:
 *   npm run import:csv                     ← usa data/horarios.csv por defecto
 *   npm run import:csv -- data/otro.csv    ← archivo personalizado
 *   npm run import:csv -- --ayuda          ← muestra esta ayuda
 *
 * Comportamiento:
 *   - Lee el CSV y detecta qué fechas están incluidas.
 *   - Borra SOLO los horarios de esas fechas antes de insertar.
 *   - El resto de la base de datos no se toca.
 *   - Se puede correr varias veces sin problema (idempotente).
 *
 * Formato del CSV:
 *   Separador: punto y coma (;)
 *   Líneas con # son comentarios y se ignoran.
 *   Líneas vacías se ignoran.
 *   Cabecera obligatoria: cine;pelicula;fecha;hora;formato;idioma;url_compra
 *
 * Ejemplo de fila:
 *   Cinemark Palermo;Proyecto Fin del Mundo;2026-03-30;14:30;2D;cas;https://...
 */

import { db, closeDb } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// ── Colores para la terminal ──────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  blue: "\x1b[34m",
};
const ok = `${c.green}✓${c.reset}`;
const warn = `${c.yellow}⚠${c.reset}`;
const err = `${c.red}✗${c.reset}`;
const info = `${c.cyan}→${c.reset}`;

// ── Formatos e idiomas válidos ────────────────────────────────────────
const FORMATOS_VALIDOS = new Set(["2D", "3D", "IMAX", "4DX", "XD", "DBOX"]);
const IDIOMAS_VALIDOS = new Set(["cas", "sub", "vos"]);
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HORA_REGEX = /^\d{2}:\d{2}$/;

// ── Normalización de texto para comparación ──────────────────────────
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ── Parseo del CSV ────────────────────────────────────────────────────
interface FilaCSV {
  cine: string;
  pelicula: string;
  fecha: string;
  hora: string;
  formato: string;
  idioma: string;
  urlCompra: string;
  lineaOriginal: number;
}

function parsearCSV(rutaArchivo: string): FilaCSV[] {
  const contenido = fs.readFileSync(rutaArchivo, "utf-8");
  const lineas = contenido.split(/\r?\n/);
  const filas: FilaCSV[] = [];
  let tieneEncabezado = false;

  for (let i = 0; i < lineas.length; i++) {
    const lineaNum = i + 1;
    const linea = lineas[i].trim();

    // Ignorar comentarios y vacíos
    if (!linea || linea.startsWith("#")) continue;

    const cols = linea.split(";").map((c) => c.trim());

    // Detectar encabezado
    if (!tieneEncabezado) {
      const esEncabezado =
        normalizar(cols[0]) === "cine" && normalizar(cols[1]) === "pelicula";
      if (esEncabezado) {
        tieneEncabezado = true;
        continue;
      }
    }

    if (cols.length < 6) {
      console.warn(
        `  ${warn} Línea ${lineaNum}: columnas insuficientes (${cols.length}/6) — ignorada`
      );
      continue;
    }

    filas.push({
      cine: cols[0],
      pelicula: cols[1],
      fecha: cols[2],
      hora: cols[3],
      formato: cols[4].toUpperCase(),
      idioma: cols[5].toLowerCase(),
      urlCompra: cols[6] || "",
      lineaOriginal: lineaNum,
    });
  }

  return filas;
}

// ── Validación de filas ───────────────────────────────────────────────
function validarFila(fila: FilaCSV): string[] {
  const errores: string[] = [];
  if (!fila.cine) errores.push("cine vacío");
  if (!fila.pelicula) errores.push("pelicula vacía");
  if (!FECHA_REGEX.test(fila.fecha)) errores.push(`fecha inválida "${fila.fecha}" (usar YYYY-MM-DD)`);
  if (!HORA_REGEX.test(fila.hora)) errores.push(`hora inválida "${fila.hora}" (usar HH:MM)`);
  if (!FORMATOS_VALIDOS.has(fila.formato)) errores.push(`formato inválido "${fila.formato}" (válidos: ${[...FORMATOS_VALIDOS].join(", ")})`);
  if (!IDIOMAS_VALIDOS.has(fila.idioma)) errores.push(`idioma inválido "${fila.idioma}" (válidos: cas, sub, vos)`);
  return errores;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--ayuda") || args.includes("--help")) {
    console.log(`
${c.bold}import-csv${c.reset} — Importador de horarios para horariosdeloscines

${c.bold}Uso:${c.reset}
  npm run import:csv
  npm run import:csv -- ruta/al/archivo.csv

${c.bold}Formato CSV:${c.reset}
  Separador : punto y coma (;)
  Comentarios: líneas que empiezan con #

${c.bold}Columnas:${c.reset}
  cine       : nombre exacto del cine (ej: Cinemark Palermo)
  pelicula   : título de la película  (ej: Proyecto Fin del Mundo)
  fecha      : YYYY-MM-DD             (ej: 2026-03-30)
  hora       : HH:MM                  (ej: 14:30)
  formato    : 2D | 3D | IMAX | 4DX | XD | DBOX
  idioma     : cas | sub | vos
  url_compra : URL o vacío

${c.bold}Comportamiento:${c.reset}
  Solo borra y reemplaza los horarios de las fechas presentes en el CSV.
  El resto de la base de datos no se modifica.
`);
    process.exit(0);
  }

  // Ruta del archivo CSV
  const rutaArg = args.find((a) => !a.startsWith("--"));
  const rutaCSV = rutaArg
    ? path.resolve(rutaArg)
    : path.resolve("data/horarios.csv");

  console.log(`\n${c.bold}horariosdeloscines — Importador CSV${c.reset}`);
  console.log(`${c.gray}${"─".repeat(50)}${c.reset}`);
  console.log(`${info} Archivo: ${c.cyan}${rutaCSV}${c.reset}\n`);

  // Verificar que el archivo existe
  if (!fs.existsSync(rutaCSV)) {
    console.error(`${err} No se encontró el archivo: ${rutaCSV}`);
    console.error(`   Creá el archivo o pasá la ruta como argumento.`);
    process.exit(1);
  }

  // ── Parsear CSV ────────────────────────────────────────────────────
  console.log(`Leyendo CSV...`);
  const filas = parsearCSV(rutaCSV);
  console.log(`${ok} ${filas.length} filas de datos encontradas`);

  // ── Validar filas ──────────────────────────────────────────────────
  let filasBuenas: FilaCSV[] = [];
  let erroresTotal = 0;

  for (const fila of filas) {
    const erroresFila = validarFila(fila);
    if (erroresFila.length > 0) {
      console.warn(`  ${warn} Línea ${fila.lineaOriginal}: ${erroresFila.join(", ")} — ignorada`);
      erroresTotal++;
    } else {
      filasBuenas.push(fila);
    }
  }

  if (erroresTotal > 0) {
    console.log(`${warn} ${erroresTotal} fila(s) con errores ignoradas`);
  }
  console.log(`${ok} ${filasBuenas.length} filas válidas para procesar`);

  if (filasBuenas.length === 0) {
    console.error(`\n${err} No hay filas válidas para importar.`);
    process.exit(1);
  }

  // ── Conectar a la base de datos ────────────────────────────────────
  // ── Cargar cines y películas ───────────────────────────────────────
  console.log(`\nCargando cines y películas de la base de datos...`);
  const todosCines = await db.select().from(cinemas);
  const todasPeliculas = await db.select().from(movies);

  // Índice normalizado
  const indiceCines = new Map<string, typeof todosCines[0]>();
  for (const cine of todosCines) {
    indiceCines.set(normalizar(cine.name), cine);
  }

  const indicePeliculas = new Map<string, typeof todasPeliculas[0]>();
  for (const pelicula of todasPeliculas) {
    indicePeliculas.set(normalizar(pelicula.title), pelicula);
  }

  console.log(`${ok} ${todosCines.length} cines disponibles`);
  console.log(`${ok} ${todasPeliculas.length} películas disponibles`);

  // ── Resolver referencias ───────────────────────────────────────────
  console.log(`\nResolviend cines y películas...`);

  interface FilaResuelta {
    cinemaId: number;
    movieId: number;
    date: string;
    time: string;
    format: string;
    language: string;
    bookingUrl: string | null;
    scrapedAt: string;
  }

  const filasResueltas: FilaResuelta[] = [];
  const cinesNoEncontrados = new Set<string>();
  const peliculasNoEncontradas = new Set<string>();
  const fechas = new Set<string>();

  const ahora = new Date().toISOString();

  for (const fila of filasBuenas) {
    const cineNorm = normalizar(fila.cine);
    const peliculaNorm = normalizar(fila.pelicula);

    const cine = indiceCines.get(cineNorm);
    const pelicula = indicePeliculas.get(peliculaNorm);

    if (!cine) {
      cinesNoEncontrados.add(fila.cine);
      continue;
    }
    if (!pelicula) {
      peliculasNoEncontradas.add(fila.pelicula);
      continue;
    }

    fechas.add(fila.fecha);
    filasResueltas.push({
      cinemaId: cine.id,
      movieId: pelicula.id,
      date: fila.fecha,
      time: fila.hora,
      format: fila.formato,
      language: fila.idioma,
      bookingUrl: fila.urlCompra || null,
      scrapedAt: ahora,
    });
  }

  // Mostrar advertencias de no encontrados
  if (cinesNoEncontrados.size > 0) {
    console.log(`\n${warn} ${c.yellow}Cines no encontrados en la base de datos:${c.reset}`);
    for (const nombre of cinesNoEncontrados) {
      console.log(`   • "${nombre}"`);
    }
    console.log(`   ${c.gray}(verificá que el nombre sea exactamente igual al de la DB)${c.reset}`);
    console.log(`   ${c.gray}Nombres disponibles: npm run db:studio${c.reset}`);
  }

  if (peliculasNoEncontradas.size > 0) {
    console.log(`\n${warn} ${c.yellow}Películas no encontradas en la base de datos:${c.reset}`);
    for (const titulo of peliculasNoEncontradas) {
      console.log(`   • "${titulo}"`);
    }
    console.log(`   ${c.gray}(verificá el título exacto o agregála al seed)${c.reset}`);
  }

  if (filasResueltas.length === 0) {
    console.error(`\n${err} No se pudo resolver ningún horario. Nada para importar.`);
    await closeDb();
    process.exit(1);
  }

  // ── Resumen antes de confirmar ─────────────────────────────────────
  const fechasOrdenadas = [...fechas].sort();
  console.log(`\n${c.bold}Resumen de la importación:${c.reset}`);
  console.log(`  Fechas a reemplazar : ${fechasOrdenadas.join(", ")}`);
  console.log(`  Horarios a insertar : ${c.green}${c.bold}${filasResueltas.length}${c.reset}`);
  if (filasResueltas.length < filasBuenas.length) {
    console.log(`  Filas ignoradas     : ${c.yellow}${filasBuenas.length - filasResueltas.length}${c.reset} (cine o película no encontrada)`);
  }

  // ── Ejecutar importación ───────────────────────────────────────────
  console.log(`\n${info} Importando...`);

  // Borrar SOLO los horarios de los cines presentes en este CSV (por fecha).
  // Los cines con scrapers propios (Malba, York, Munro, Cacodelphia, etc.)
  // no se tocan aunque sus fechas estén en el rango del CSV.
  const csvCinemaIds = [...new Set(filasResueltas.map(r => r.cinemaId))];
  for (const fecha of fechas) {
    await db.delete(showtimes).where(
      and(eq(showtimes.date, fecha), inArray(showtimes.cinemaId, csvCinemaIds))
    );
  }

  // Insertar nuevos horarios en lotes
  const BATCH_SIZE = 200;
  for (let i = 0; i < filasResueltas.length; i += BATCH_SIZE) {
    await db.insert(showtimes).values(filasResueltas.slice(i, i + BATCH_SIZE)).onConflictDoNothing();
  }

  console.log(`${ok} ${c.green}${c.bold}${filasResueltas.length} horario(s) importados correctamente${c.reset}`);

  // ── Verificación rápida ────────────────────────────────────────────
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(showtimes);
  console.log(`\n${c.gray}Total de horarios en la base de datos: ${total}${c.reset}`);

  console.log(`\n${c.green}${c.bold}¡Listo!${c.reset} Reiniciá el servidor para ver los cambios.\n`);

  await closeDb();
}

main().catch((e) => {
  console.error(`\n${err} Error inesperado:`, e.message);
  process.exit(1);
});
