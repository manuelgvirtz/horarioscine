import { db, closeDb } from "./db";
import { cinemas, movies, showtimes } from "../src/db/schema";

function today() {
  return new Date().toISOString().split("T")[0];
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function dayAfterTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().split("T")[0];
}

async function seed() {
  console.log("Seeding database...");


  // =====================
  // CINEMAS (real data)
  // =====================
  const cinemaData = [
    // --- CINEMARK HOYTS ---
    { name: "Cinemark Palermo", chain: "cinemark", zone: "CABA", city: "Buenos Aires", address: "Beruti 3399, Palermo", phone: "011 5777-1000", lat: -34.5882, lng: -58.4098, url: "https://www.cinemark.com.ar/cines/cinemark-palermo" },
    { name: "Hoyts Abasto", chain: "cinemark", zone: "CABA", city: "Buenos Aires", address: "Av. Corrientes 3247, Abasto Shopping", phone: "011 5777-1000", lat: -34.6037, lng: -58.4107, url: "https://www.cinemark.com.ar/cines/hoyts-abasto" },
    { name: "Cinemark Puerto Madero", chain: "cinemark", zone: "CABA", city: "Buenos Aires", address: "Av. Alicia Moreau de Justo 1920", phone: "011 5777-1000", lat: -34.6163, lng: -58.3654, url: "https://www.cinemark.com.ar/cines/cinemark-puerto-madero" },
    { name: "Hoyts Dot Baires", chain: "cinemark", zone: "CABA", city: "Buenos Aires", address: "Vedia 3626, Dot Baires Mall, Saavedra", phone: "011 5777-1000", lat: -34.5454, lng: -58.4892, url: "https://www.cinemark.com.ar/cines/hoyts-dot-baires" },
    { name: "Cinemark Caballito", chain: "cinemark", zone: "CABA", city: "Buenos Aires", address: "Av. La Plata 96, Caballito", phone: "011 5777-1000", lat: -34.6195, lng: -58.4337, url: "https://www.cinemark.com.ar/cines/cinemark-caballito" },
    { name: "Hoyts Unicenter", chain: "cinemark", zone: "GBA Norte", city: "Martínez", address: "Paraná 3745, Unicenter Shopping", phone: "011 5777-1000", lat: -34.5105, lng: -58.5265, url: "https://www.cinemark.com.ar/cines/hoyts-unicenter" },
    { name: "Hoyts Morón", chain: "cinemark", zone: "GBA Oeste", city: "Morón", address: "J.M. de Rosas 658, Plaza Oeste Shopping", phone: "011 5777-1000", lat: -34.6505, lng: -58.6197, url: "https://www.cinemark.com.ar/cines/hoyts-moron" },
    { name: "Hoyts Temperley", chain: "cinemark", zone: "GBA Sur", city: "Temperley", address: "Av. Hipólito Yrigoyen 10.700", phone: "011 5777-1000", lat: -34.7693, lng: -58.3970, url: "https://www.cinemark.com.ar/cines/hoyts-temperley" },
    { name: "Cinemark Avellaneda", chain: "cinemark", zone: "GBA Sur", city: "Avellaneda", address: "Güemes 897, Alto Avellaneda Shopping", phone: "011 5777-1000", lat: -34.6623, lng: -58.3660, url: "https://www.cinemark.com.ar/cines/cinemark-avellaneda" },
    { name: "Hoyts Moreno", chain: "cinemark", zone: "GBA Oeste", city: "Moreno", address: "Av. Victorica 1128, Nine Shopping", phone: "011 5777-1000", lat: -34.6475, lng: -58.7918, url: "https://www.cinemark.com.ar/cines/hoyts-moreno" },
    { name: "Cinemark San Justo", chain: "cinemark", zone: "GBA Oeste", city: "San Justo", address: "Av. Brigadier Juan M. de Rosas 3910", phone: "011 5777-1000", lat: -34.6847, lng: -58.5591, url: "https://www.cinemark.com.ar/cines/cinemark-san-justo" },
    { name: "Hoyts Quilmes", chain: "cinemark", zone: "GBA Sur", city: "Quilmes", address: "Av. Calchaquí 3950", phone: "011 5777-1000", lat: -34.7244, lng: -58.2630, url: "https://www.cinemark.com.ar/cines/hoyts-quilmes" },
    { name: "Cinemark Soleil", chain: "cinemark", zone: "GBA Norte", city: "El Palomar", address: "Av. Brig. Juan M. de Rosas 658, Soleil Premium", phone: "011 5777-1000", lat: -34.6091, lng: -58.5991, url: "https://www.cinemark.com.ar/cines/cinemark-soleil" },
    { name: "Hoyts San Miguel", chain: "cinemark", zone: "GBA Oeste", city: "San Miguel", address: "Paunero 1085", phone: "011 5777-1000", lat: -34.5438, lng: -58.7131, url: "https://www.cinemark.com.ar/cines/hoyts-san-miguel" },
    { name: "Cinemark Córdoba", chain: "cinemark", zone: "Córdoba", city: "Córdoba", address: "Duarte Quirós 1400, Patio Olmos", phone: "0351 570-1000", lat: -31.4189, lng: -64.1922, url: "https://www.cinemark.com.ar/cines/cinemark-cordoba" },
    { name: "Cinemark Mendoza", chain: "cinemark", zone: "Mendoza", city: "Mendoza", address: "Acceso Este Km 3.5, Palmares Open Mall", phone: "0261 439-1000", lat: -32.8990, lng: -68.7879, url: "https://www.cinemark.com.ar/cines/cinemark-mendoza" },
    { name: "Cinemark Salta", chain: "cinemark", zone: "Salta", city: "Salta", address: "Virrey Toledo 702", phone: "0387 432-1000", lat: -24.7859, lng: -65.4117, url: "https://www.cinemark.com.ar/cines/cinemark-salta" },
    { name: "Cinemark Rosario", chain: "cinemark", zone: "Rosario", city: "Rosario", address: "Junín 501, Portal Rosario Shopping", phone: "0341 410-1000", lat: -32.9468, lng: -60.6393, url: "https://www.cinemark.com.ar/cines/cinemark-rosario" },
    { name: "Hoyts Santa Fe", chain: "cinemark", zone: "Santa Fe", city: "Santa Fe", address: "Rivadavia 3202, Nuevo Centro Shopping", phone: "0342 456-1000", lat: -31.6333, lng: -60.7000, url: "https://www.cinemark.com.ar/cines/hoyts-santa-fe" },
    { name: "Cinemark Neuquén", chain: "cinemark", zone: "Neuquén", city: "Neuquén", address: "Av. Olascoaga 2599", phone: "0299 449-1000", lat: -38.9516, lng: -68.0591, url: "https://www.cinemark.com.ar/cines/cinemark-neuquen" },

    // --- CINÉPOLIS (ex-Village) ---
    { name: "Cinépolis Recoleta", chain: "cinepolis", zone: "CABA", city: "Buenos Aires", address: "Vicente López 2050, Recoleta", phone: "011 2222-2222", lat: -34.5891, lng: -58.3932, url: "https://www.cinepolis.com.ar/cines/cinepolis-recoleta" },
    { name: "Cinépolis Avellaneda", chain: "cinepolis", zone: "GBA Sur", city: "Avellaneda", address: "Av. Mitre 2702, Avellaneda", phone: "011 2222-2222", lat: -34.6612, lng: -58.3657, url: "https://www.cinepolis.com.ar/cines/cinepolis-avellaneda" },
    { name: "Cinépolis Pilar", chain: "cinepolis", zone: "GBA Norte", city: "Pilar", address: "Panamericana Km. 50, Pilar", phone: "011 2222-2222", lat: -34.4425, lng: -58.9155, url: "https://www.cinepolis.com.ar/cines/cinepolis-pilar" },
    { name: "Cinépolis Rosario", chain: "cinepolis", zone: "Rosario", city: "Rosario", address: "Perón 5856, Rosario", phone: "0341 555-2222", lat: -32.9200, lng: -60.6800, url: "https://www.cinepolis.com.ar/cines/cinepolis-rosario" },
    { name: "Cinépolis Neuquén", chain: "cinepolis", zone: "Neuquén", city: "Neuquén", address: "Av. Antártida Argentina 1111", phone: "0299 555-2222", lat: -38.9500, lng: -68.0600, url: "https://www.cinepolis.com.ar/cines/cinepolis-neuquen" },
    { name: "Cinépolis Mendoza", chain: "cinepolis", zone: "Mendoza", city: "Guaymallén", address: "Lateral de Acceso Este 3280, Mendoza Plaza Shopping", phone: "0261 555-2222", lat: -32.8950, lng: -68.7850, url: "https://www.cinepolis.com.ar/cines/cinepolis-mendoza" },
    { name: "Cinépolis Merlo", chain: "cinepolis", zone: "GBA Oeste", city: "Merlo", address: "Av. Juan Domingo Perón 24098", phone: "011 2222-2222", lat: -34.6642, lng: -58.7279, url: "https://www.cinepolis.com.ar/cines/cinepolis-merlo" },
    { name: "Cinépolis San Antonio de Padua", chain: "cinepolis", zone: "GBA Oeste", city: "San Antonio de Padua", address: "Av. Gobernador Vergara 3502", phone: "011 2222-2222", lat: -34.6708, lng: -58.7018, url: "https://www.cinepolis.com.ar/cines/cinepolis-padua" },

    // --- SHOWCASE ---
    { name: "Showcase Belgrano", chain: "showcase", zone: "CABA", city: "Buenos Aires", address: "Monroe 1655, Belgrano", phone: "011 4780-3334", lat: -34.5569, lng: -58.4617, url: "https://www.todoshowcase.com/cines/belgrano" },
    { name: "Showcase Norte (Norcenter)", chain: "showcase", zone: "GBA Norte", city: "Vicente López", address: "Colectora Panamericana 3750, Norcenter", phone: "011 4780-3334", lat: -34.5200, lng: -58.5100, url: "https://www.todoshowcase.com/cines/norte" },
    { name: "Showcase Haedo", chain: "showcase", zone: "GBA Oeste", city: "Haedo", address: "Av. Rivadavia 16.200, Shopping Haedo", phone: "011 4780-3334", lat: -34.6454, lng: -58.5934, url: "https://www.todoshowcase.com/cines/haedo" },
    { name: "Showcase Quilmes", chain: "showcase", zone: "GBA Sur", city: "Quilmes", address: "Av. Calchaquí 3950, Quilmes Factory", phone: "011 4780-3334", lat: -34.7241, lng: -58.2635, url: "https://www.todoshowcase.com/cines/quilmes" },
    { name: "Showcase Rosario", chain: "showcase", zone: "Rosario", city: "Rosario", address: "Junín 501, Alto Rosario Shopping", phone: "0341 410-3334", lat: -32.9340, lng: -60.6510, url: "https://www.todoshowcase.com/cines/rosario" },
    { name: "Showcase Córdoba", chain: "showcase", zone: "Córdoba", city: "Córdoba", address: "Recta Martinoli 8200, Villa Cabrera", phone: "0351 570-3334", lat: -31.3600, lng: -64.2500, url: "https://www.todoshowcase.com/cines/cordoba" },

    // --- ATLAS CINES ---
    { name: "Atlas Flores", chain: "atlas", zone: "CABA", city: "Buenos Aires", address: "Rivera Indarte 44, Flores", phone: "011 4814-7447", lat: -34.6282, lng: -58.4635, url: "https://www.atlascines.com/" },
    { name: "Atlas Caballito", chain: "atlas", zone: "CABA", city: "Buenos Aires", address: "Rivadavia 5071, Caballito", phone: "011 4814-7447", lat: -34.6183, lng: -58.4402, url: "https://www.atlascines.com/" },
    { name: "Atlas Alcorta", chain: "atlas", zone: "CABA", city: "Buenos Aires", address: "Jerónimo Salguero 3172, Alcorta Shopping", phone: "011 4814-7447", lat: -34.5806, lng: -58.4080, url: "https://www.atlascines.com/" },
    { name: "Atlas Nordelta", chain: "atlas", zone: "GBA Norte", city: "Tigre", address: "Av. de los Lagos 7008, Nordelta Centro Comercial", phone: "011 4814-7447", lat: -34.4072, lng: -58.6505, url: "https://www.atlascines.com/" },
    { name: "Atlas Alto Avellaneda", chain: "atlas", zone: "GBA Sur", city: "Avellaneda", address: "Av. Gral. Güemes 896, Alto Avellaneda", phone: "011 4814-7447", lat: -34.6600, lng: -58.3650, url: "https://www.atlascines.com/" },

    // --- CINEMACENTER ---
    { name: "Cinemacenter Bahía Blanca", chain: "cinemacenter", zone: "GBA Sur", city: "Bahía Blanca", address: "Av. Sarmiento 2153, Bahía Blanca Plaza Shopping", phone: null, lat: -38.7196, lng: -62.2724, url: "https://www.cinemacenter.com.ar" },
    { name: "Cinemacenter Mar del Plata", chain: "cinemacenter", zone: "GBA Sur", city: "Mar del Plata", address: "Rivadavia 3050, Los Gallegos Shopping", phone: null, lat: -38.0055, lng: -57.5426, url: "https://www.cinemacenter.com.ar" },
    { name: "Cinemacenter Tandil", chain: "cinemacenter", zone: "GBA Sur", city: "Tandil", address: "Panamá 351", phone: null, lat: -37.3217, lng: -59.1337, url: "https://www.cinemacenter.com.ar" },
    { name: "Cinemacenter Tucumán", chain: "cinemacenter", zone: "Tucumán", city: "San Miguel de Tucumán", address: "Av. Néstor Kirchner 3450, Paseo Libertad", phone: null, lat: -26.8083, lng: -65.2176, url: "https://www.cinemacenter.com.ar" },
    { name: "Cinemacenter Mendoza", chain: "cinemacenter", zone: "Mendoza", city: "Guaymallén", address: "Las Cañas 1833, La Barraca Mall", phone: null, lat: -32.8960, lng: -68.7870, url: "https://www.cinemacenter.com.ar" },
    { name: "Cinemacenter Corrientes", chain: "cinemacenter", zone: "Santa Fe", city: "Corrientes", address: "Av. Pedro Ferré y Chacabuco", phone: null, lat: -27.4696, lng: -58.8306, url: "https://www.cinemacenter.com.ar" },
    { name: "Cinemacenter La Rioja", chain: "cinemacenter", zone: "Mendoza", city: "La Rioja", address: "Bazán y Bustos 750", phone: null, lat: -29.4131, lng: -66.8567, url: "https://www.cinemacenter.com.ar" },
    { name: "Cinemacenter San Juan", chain: "cinemacenter", zone: "Mendoza", city: "San Juan", address: "Av. Circunvalación y Scalabrini Ortiz", phone: null, lat: -31.5375, lng: -68.5364, url: "https://www.cinemacenter.com.ar" },

    // --- CINES INDEPENDIENTES — CABA ---
    { name: "MALBA Cine", chain: "independiente", zone: "CABA", city: "Buenos Aires", address: "Av. Figueroa Alcorta 3415, Palermo", phone: "011 4808-6500", lat: -34.5757, lng: -58.4054, url: "https://malba.org.ar/cine/" },
    { name: "Cine Lorca", chain: "independiente", zone: "CABA", city: "Buenos Aires", address: "Av. Corrientes 1428, San Nicolás", phone: null, lat: -34.6037, lng: -58.3862, url: "https://cinelorca.wixsite.com/cine-lorca" },
    { name: "Cine Gaumont", chain: "independiente", zone: "CABA", city: "Buenos Aires", address: "Av. Rivadavia 1635, Congreso", phone: "011 4371-3050", lat: -34.6097, lng: -58.3927, url: "https://www.espaciosincaa.gob.ar" },
    { name: "Cinema Devoto", chain: "independiente", zone: "CABA", city: "Buenos Aires", address: "José Pedro Varela 4866, Villa Devoto", phone: "011 4019-6060", lat: -34.6027, lng: -58.5089, url: "https://cinemadevoto.com.ar" },
    { name: "Victorshow Cinemas", chain: "independiente", zone: "GBA Oeste", city: "Villa Bosch", address: "El Payador 5539, Villa Bosch", phone: "011 4844-5529", lat: -34.6029, lng: -58.5694, url: "http://www.victorshowcinemas.com.ar" },

    // --- CINES INDEPENDIENTES — CÓRDOBA ---
    { name: "Cinerama", chain: "independiente", zone: "Córdoba", city: "Córdoba", address: "Av. Colón 345, Centro", phone: "0351 422-0866", lat: -31.4144, lng: -64.1880, url: "https://www.cinerama.com.ar" },
    { name: "Gran Rex", chain: "independiente", zone: "Córdoba", city: "Córdoba", address: "Av. General Paz 174, Centro", phone: "0351 424-8709", lat: -31.4167, lng: -64.1876, url: "https://www.cinesgranrex.com.ar" },
    { name: "Cines Dinosaurio Mall", chain: "independiente", zone: "Córdoba", city: "Córdoba", address: "Av. Fuerza Aérea Argentina 1700", phone: "0351 526-1500", lat: -31.4005, lng: -64.2283, url: "https://www.dinosauriomall.com.ar" },

    // --- CINES INDEPENDIENTES — ROSARIO ---
    { name: "Nuevo Monumental", chain: "independiente", zone: "Rosario", city: "Rosario", address: "San Martín 993, Centro", phone: "0341 421-6289", lat: -32.9468, lng: -60.6394, url: "http://www.nuevomonumental.com" },
    { name: "Cines del Centro", chain: "independiente", zone: "Rosario", city: "Rosario", address: "Rioja 1640, 1er Piso, Shopping del Siglo", phone: "0341 445-1460", lat: -32.9436, lng: -60.6368, url: "https://www.cinesdelcentro.com.ar" },
    { name: "El Cairo Cine Público", chain: "independiente", zone: "Rosario", city: "Rosario", address: "Santa Fe 1120, Centro", phone: "0341 472-1851", lat: -32.9440, lng: -60.6448, url: "http://www.elcairocinepublico.gob.ar" },
  ];

  await db.insert(cinemas).values(cinemaData).onConflictDoNothing();
  console.log(`Inserted ${cinemaData.length} cinemas (skipped existing)`);

  // =====================
  // MOVIES (real data — currently in Argentine theaters, March 2026)
  // =====================
  const movieData = [
    {
      title: "Proyecto Fin del Mundo",
      originalTitle: "Project Hail Mary",
      tmdbId: 687163,
      posterUrl: "https://image.tmdb.org/t/p/w500/yihdXomYb5kTeSivtFndMy5iDmf.jpg",
      synopsis: "El profesor de ciencias Ryland Grace se despierta en una nave espacial a años luz de la Tierra, sin recordar quién es ni cómo llegó allí. Con la misión de revertir una crisis solar que amenaza la extinción humana, debe colaborar con una criatura alienígena para salvar a la humanidad.",
      durationMinutes: 156,
      rating: "ATP",
      genres: JSON.stringify(["Ciencia Ficción", "Drama", "Aventura"]),
      releaseDate: "2026-03-19",
      imdbId: "tt12042730",
      imdbScore: 8.2,
      imdbVotes: 185000,
      rtTomatometer: 95,
      rtAudience: 93,
      metacriticScore: 82,
      letterboxdScore: 4.2,
    },
    {
      title: "Hoppers: Operación Castor",
      originalTitle: "Hoppers",
      tmdbId: 1327819,
      posterUrl: "https://image.tmdb.org/t/p/w500/xjtWQ2CL1mpmMNwuU5HeS4Iuwuu.jpg",
      synopsis: "Los científicos descubrieron cómo 'saltar' la conciencia humana a animales robóticos realistas, permitiendo comunicarse con los animales. Mabel, amante de los animales, aprovecha la tecnología y descubre misterios en el mundo animal más allá de lo imaginado.",
      durationMinutes: 105,
      rating: "ATP",
      genres: JSON.stringify(["Animación", "Aventura", "Comedia"]),
      releaseDate: "2026-03-05",
      imdbId: "tt26443616",
      imdbScore: 7.7,
      imdbVotes: 42000,
      rtTomatometer: 88,
      rtAudience: 85,
      metacriticScore: 74,
      letterboxdScore: 3.8,
    },
    {
      title: "Scream 7",
      originalTitle: "Scream 7",
      tmdbId: 1159559,
      posterUrl: "https://image.tmdb.org/t/p/w500/jjyuk0edLiW8vOSnlfwWCCLpbh5.jpg",
      synopsis: "Cuando un nuevo asesino Ghostface aparece en el pueblo donde Sidney Prescott ha construido una nueva vida, sus miedos más oscuros se hacen realidad cuando su hija se convierte en el próximo objetivo.",
      durationMinutes: 114,
      rating: "SAM 16",
      genres: JSON.stringify(["Terror", "Misterio"]),
      releaseDate: "2026-02-26",
      imdbId: "tt27047903",
      imdbScore: 5.8,
      imdbVotes: 89000,
      rtTomatometer: 62,
      rtAudience: 55,
      metacriticScore: 52,
      letterboxdScore: 2.8,
    },
    {
      title: "Boda Sangrienta 2",
      originalTitle: "Ready or Not 2: Here I Come",
      tmdbId: 1266127,
      posterUrl: "https://image.tmdb.org/t/p/w500/jRf89HVEtBZiSnOXXWDhZOfuTwW.jpg",
      synopsis: "Grace, momentos después de sobrevivir al ataque de la familia Le Domas, descubre que ha alcanzado el siguiente nivel del juego de pesadilla — esta vez con su hermana Faith. Tiene una oportunidad para sobrevivir y reclamar el Trono Alto del Consejo.",
      durationMinutes: 108,
      rating: "SAM 16",
      genres: JSON.stringify(["Terror", "Comedia"]),
      releaseDate: "2026-03-19",
      imdbId: "tt33978029",
      imdbScore: 7.8,
      imdbVotes: 35000,
      rtTomatometer: 82,
      rtAudience: 88,
      metacriticScore: 68,
      letterboxdScore: 3.7,
    },
    {
      title: "Cumbres Borrascosas",
      originalTitle: "Wuthering Heights",
      tmdbId: 1316092,
      posterUrl: "https://image.tmdb.org/t/p/w500/lGlJ2cTDwMacj5nuANd38UjVGNQ.jpg",
      synopsis: "Una historia de amor apasionada y tumultuosa ambientada en los páramos de Yorkshire, que explora la relación intensa y destructiva entre Heathcliff y Catherine Earnshaw en la Inglaterra del siglo XVIII.",
      durationMinutes: 136,
      rating: "SAM 13",
      genres: JSON.stringify(["Drama", "Romance"]),
      releaseDate: "2026-02-12",
      imdbId: "tt14824860",
      imdbScore: 7.5,
      imdbVotes: 120000,
      rtTomatometer: 90,
      rtAudience: 86,
      metacriticScore: 80,
      letterboxdScore: 4.0,
    },
    {
      title: "Frankenstein",
      originalTitle: "Frankenstein",
      tmdbId: 1062722,
      posterUrl: "https://image.tmdb.org/t/p/w500/g4JtvGlQO7DByTI6frUobqvSL3R.jpg",
      synopsis: "Victor Frankenstein, un científico brillante pero egoísta, da vida a una criatura en un experimento monstruoso que finalmente lleva a la ruina tanto al creador como a su trágica creación. Dirigida por Guillermo del Toro.",
      durationMinutes: 150,
      rating: "SAM 16",
      genres: JSON.stringify(["Drama", "Fantasía", "Terror"]),
      releaseDate: "2026-03-05",
      imdbId: "tt1312221",
      imdbScore: 7.4,
      imdbVotes: 165000,
      rtTomatometer: 85,
      rtAudience: 82,
      metacriticScore: 78,
      letterboxdScore: 3.9,
    },
    {
      title: "Nuremberg",
      originalTitle: "Nuremberg",
      tmdbId: 1214931,
      posterUrl: "https://image.tmdb.org/t/p/w500/7cWTGH2svfNHWVRjsfKIBob9pDj.jpg",
      synopsis: "En la Alemania de posguerra, un psiquiatra del ejército estadounidense debe determinar si los prisioneros nazis están aptos para ser juzgados por crímenes de guerra, enfrentándose en una compleja batalla intelectual y ética con Hermann Göring.",
      durationMinutes: 148,
      rating: "SAM 13",
      genres: JSON.stringify(["Drama", "Historia"]),
      releaseDate: "2026-03-26",
      imdbId: "tt29567915",
      imdbScore: 7.4,
      imdbVotes: 55000,
      rtTomatometer: 71,
      rtAudience: 95,
      metacriticScore: 61,
      letterboxdScore: 3.6,
    },
    {
      title: "No te olvidaré",
      originalTitle: "Reminders of Him",
      tmdbId: 1367642,
      posterUrl: "https://image.tmdb.org/t/p/w500/7L6rceYgzQ0NeHD7PRDNrRoQ291.jpg",
      synopsis: "Cuando los abuelos de Diem se niegan a dejar que Kenna vea a su hija, descubre compasión inesperada y algo más profundo con Ledger, un ex jugador de la NFL y dueño de bar local. Su romance secreto les traerá peligros y la esperanza de una segunda oportunidad.",
      durationMinutes: 114,
      rating: "SAM 13",
      genres: JSON.stringify(["Drama", "Romance"]),
      releaseDate: "2026-03-12",
      imdbId: "tt33714084",
      imdbScore: 6.9,
      imdbVotes: 28000,
      rtTomatometer: 65,
      rtAudience: 82,
      metacriticScore: 55,
      letterboxdScore: 3.3,
    },
    {
      title: "Turbulencia: Pánico en el aire",
      originalTitle: "Turbulence",
      tmdbId: 1401778,
      posterUrl: "https://image.tmdb.org/t/p/w500/jRuiKL4S9UpLma2ZlM47xIu2gbe.jpg",
      synopsis: "Una pareja casada decide tomar un paseo en globo aerostático sobre los Dolomitas italianos para reavivar su relación. Cuando se les une una tercera pasajera, los eventos se desarrollan de maneras inimaginables a cinco mil metros de altura.",
      durationMinutes: 95,
      rating: "SAM 13",
      genres: JSON.stringify(["Thriller", "Suspenso"]),
      releaseDate: "2026-03-19",
      imdbId: "tt33009027",
      imdbScore: 5.5,
      imdbVotes: 8000,
      rtTomatometer: 42,
      rtAudience: 48,
      metacriticScore: 38,
      letterboxdScore: 2.5,
    },
    {
      title: "Zootopia 2",
      originalTitle: "Zootopia 2",
      tmdbId: 1084242,
      posterUrl: "https://image.tmdb.org/t/p/w500/oJ7g2CifqpStmoYQyaLQgEU32qO.jpg",
      synopsis: "Después de resolver el caso más grande en la historia de Zootopia, los policías novatos Judy Hopps y Nick Wilde se encuentran en el retorcido sendero de un gran misterio cuando Gary De'Snake llega y pone la metrópolis animal patas arriba.",
      durationMinutes: 108,
      rating: "ATP",
      genres: JSON.stringify(["Animación", "Aventura", "Comedia"]),
      releaseDate: "2025-11-26",
      imdbId: "tt26443597",
      imdbScore: 7.4,
      imdbVotes: 210000,
      rtTomatometer: 76,
      rtAudience: 84,
      metacriticScore: 62,
      letterboxdScore: 3.5,
    },
    {
      title: "Iron Lung",
      originalTitle: "Iron Lung",
      tmdbId: 1116201,
      posterUrl: "https://image.tmdb.org/t/p/w500/sIwakdbMGS1krtgendTWpxTY9Hw.jpg",
      synopsis: "En un futuro post-apocalíptico, las estrellas y los planetas han desaparecido. La Consolidación de Hierro descubre un océano de sangre en una luna desolada y envía a un convicto soldado dentro de un submarino sellado en una misión suicida para explorar sus profundidades.",
      durationMinutes: 125,
      rating: "SAM 16",
      genres: JSON.stringify(["Ciencia Ficción", "Terror"]),
      releaseDate: "2026-03-12",
      imdbId: "tt14452922",
      imdbScore: 7.2,
      imdbVotes: 45000,
      rtTomatometer: 78,
      rtAudience: 80,
      metacriticScore: 66,
      letterboxdScore: 3.6,
    },
    {
      title: "La Novia!",
      originalTitle: "The Bride!",
      tmdbId: 1159831,
      posterUrl: "https://image.tmdb.org/t/p/w500/lV8YHwGkYZsm6EfIqnhaSz2avKt.jpg",
      synopsis: "Un solitario Frankenstein viaja al Chicago de los años 30 para pedirle a la pionera científica Dra. Euphronious que le cree una compañera. Las dos reviven a una joven asesinada y La Novia nace, pero lo que sigue está más allá de lo que cualquiera imaginó.",
      durationMinutes: 126,
      rating: "SAM 13",
      genres: JSON.stringify(["Comedia", "Terror", "Fantasía"]),
      releaseDate: "2026-03-05",
      imdbId: "tt11862054",
      imdbScore: 6.8,
      imdbVotes: 32000,
      rtTomatometer: 72,
      rtAudience: 70,
      metacriticScore: 60,
      letterboxdScore: 3.2,
    },
    {
      title: "Te van a matar",
      originalTitle: "They Will Kill You",
      tmdbId: 1292695,
      posterUrl: "https://image.tmdb.org/t/p/w500/6oI4oQKTWMVUlr8Ivqydp28Ruu6.jpg",
      synopsis: "Una joven acepta un trabajo como ama de llaves en un misterioso edificio de Nueva York, sin darse cuenta de que está entrando a una comunidad que ha visto numerosas desapariciones y puede estar bajo el control de un culto satánico.",
      durationMinutes: 94,
      rating: "SAM 16",
      genres: JSON.stringify(["Terror", "Suspenso"]),
      releaseDate: "2026-03-26",
      imdbId: "tt26744117",
      imdbScore: 6.0,
      imdbVotes: 5000,
      rtTomatometer: 55,
      rtAudience: 60,
      metacriticScore: 48,
      letterboxdScore: 2.9,
    },

    // --- CINE ARGENTINO / AUTOR ---
    {
      title: "Parque Lezama",
      originalTitle: "Parque Lezama",
      tmdbId: 1631485,
      posterUrl: "https://image.tmdb.org/t/p/w500/b09A92ZuTH5RRIdIeM16kXIgl8M.jpg",
      synopsis: "Un ex militante comunista y un hombre de filosofía epicúrea forman una improbable amistad en un banco de plaza, compartiendo sus historias de vida con humor y ternura. Una comedia dramática argentina dirigida por Juan José Campanella.",
      durationMinutes: 115,
      rating: "SAM 13",
      genres: JSON.stringify(["Comedia", "Drama"]),
      releaseDate: "2026-02-19",
      imdbId: null,
      imdbScore: null,
      imdbVotes: null,
      rtTomatometer: null,
      rtAudience: null,
      metacriticScore: null,
      letterboxdScore: 3.5,
    },
    {
      title: "Soy tu mensaje",
      originalTitle: "Soy tu mensaje",
      tmdbId: 1567495,
      posterUrl: "https://image.tmdb.org/t/p/w500/lqgA80cMiCSxkTgRvaC8J5U0S7u.jpg",
      synopsis: "Ana y Lucio fundan una pequeña secta en un barrio privado, anunciando la llegada de un mensajero y el fin de la era terrenal. Un thriller místico argentino que mezcla manipulación, misticismo y atmósfera apocalíptica.",
      durationMinutes: 85,
      rating: "SAM 13",
      genres: JSON.stringify(["Thriller", "Drama"]),
      releaseDate: "2026-03-19",
      imdbId: null,
      imdbScore: null,
      imdbVotes: null,
      rtTomatometer: null,
      rtAudience: null,
      metacriticScore: null,
      letterboxdScore: 3.2,
    },
    {
      title: "300 cartas",
      originalTitle: "300 cartas",
      tmdbId: 1279093,
      posterUrl: "https://image.tmdb.org/t/p/w500/6IGv1oHwsodNNTB9bTZ3Y7dn389.jpg",
      synopsis: "El día de su aniversario, Jero descubre que su pareja Tom lo ha abandonado dejando solo una caja con 300 cartas. La lectura lo lleva en un viaje al pasado que pone en cuestión todo lo que creía saber del amor. Comedia romántica LGBT argentina.",
      durationMinutes: 91,
      rating: "SAM 16",
      genres: JSON.stringify(["Comedia", "Romance"]),
      releaseDate: "2026-03-26",
      imdbId: null,
      imdbScore: null,
      imdbVotes: null,
      rtTomatometer: null,
      rtAudience: null,
      metacriticScore: null,
      letterboxdScore: 3.4,
    },
    {
      title: "Nosferatu",
      originalTitle: "Nosferatu",
      tmdbId: 426063,
      posterUrl: "https://image.tmdb.org/t/p/w500/jivUhECegXI3OYtPVflWoIDtENt.jpg",
      synopsis: "Un joven agente inmobiliario viaja a los Cárpatos para cerrar una venta de tierras con el misterioso Conde Orlok, sin saber que ha despertado a una antigua criatura de la oscuridad que acecha a su prometida. Remake gótico de Robert Eggers del clásico del cine mudo.",
      durationMinutes: 132,
      rating: "SAM 16",
      genres: JSON.stringify(["Terror", "Drama"]),
      releaseDate: "2025-01-16",
      imdbId: "tt5040012",
      imdbScore: 7.2,
      imdbVotes: 180000,
      rtTomatometer: 87,
      rtAudience: 84,
      metacriticScore: 75,
      letterboxdScore: 3.8,
    },
  ];

  await db.insert(movies).values(movieData).onConflictDoNothing();
  console.log(`Inserted ${movieData.length} movies (skipped existing)`);

  // =====================
  // SHOWTIMES
  // =====================
  const todayStr = today();
  const tomorrowStr = tomorrow();
  const day2 = dayAfterTomorrow();
  const now = new Date().toISOString();

  // Helper to generate showtimes for a movie at a cinema
  function st(movieId: number, cinemaId: number, date: string, time: string, format: string, language: string, bookingUrl: string) {
    return { movieId, cinemaId, date, time, format, language, bookingUrl, scrapedAt: now };
  }

  const cmk = "https://www.cinemark.com.ar";
  const cpol = "https://www.cinepolis.com.ar";
  const shw = "https://www.todoshowcase.com";
  const atl = "https://www.atlascines.com";
  const cmc = "https://www.cinemacenter.com.ar";

  const showtimeData = [
    // === Cinemark Palermo (1) ===
    st(1, 1, todayStr, "13:30", "2D", "cas", cmk),
    st(1, 1, todayStr, "16:45", "IMAX", "sub", cmk),
    st(1, 1, todayStr, "20:00", "2D", "sub", cmk),
    st(1, 1, tomorrowStr, "14:00", "IMAX", "sub", cmk),
    st(1, 1, tomorrowStr, "17:30", "2D", "cas", cmk),
    st(2, 1, todayStr, "11:00", "2D", "cas", cmk),
    st(2, 1, todayStr, "14:15", "3D", "cas", cmk),
    st(2, 1, tomorrowStr, "11:30", "2D", "cas", cmk),
    st(3, 1, todayStr, "22:30", "2D", "sub", cmk),
    st(4, 1, todayStr, "19:00", "2D", "sub", cmk),
    st(4, 1, todayStr, "22:00", "2D", "sub", cmk),
    st(5, 1, todayStr, "17:00", "2D", "sub", cmk),
    st(6, 1, todayStr, "20:30", "2D", "sub", cmk),
    st(6, 1, tomorrowStr, "21:00", "2D", "sub", cmk),

    // === Hoyts Abasto (2) ===
    st(1, 2, todayStr, "14:00", "2D", "cas", cmk),
    st(1, 2, todayStr, "17:00", "2D", "sub", cmk),
    st(1, 2, todayStr, "20:30", "IMAX", "sub", cmk),
    st(2, 2, todayStr, "12:00", "2D", "cas", cmk),
    st(2, 2, todayStr, "15:00", "3D", "sub", cmk),
    st(3, 2, todayStr, "21:00", "2D", "sub", cmk),
    st(4, 2, todayStr, "18:30", "2D", "sub", cmk),
    st(5, 2, todayStr, "16:00", "2D", "sub", cmk),
    st(7, 2, todayStr, "19:30", "2D", "sub", cmk),
    st(10, 2, todayStr, "13:00", "2D", "cas", cmk),

    // === Cinemark Puerto Madero (3) ===
    st(1, 3, todayStr, "15:00", "2D", "sub", cmk),
    st(1, 3, todayStr, "18:30", "2D", "cas", cmk),
    st(1, 3, todayStr, "21:45", "IMAX", "sub", cmk),
    st(2, 3, todayStr, "11:30", "2D", "cas", cmk),
    st(4, 3, todayStr, "17:15", "2D", "sub", cmk),
    st(5, 3, todayStr, "15:30", "2D", "sub", cmk),
    st(6, 3, todayStr, "20:00", "2D", "sub", cmk),

    // === Hoyts Dot Baires (4) ===
    st(1, 4, todayStr, "14:30", "2D", "cas", cmk),
    st(1, 4, todayStr, "18:00", "2D", "sub", cmk),
    st(2, 4, todayStr, "11:00", "2D", "cas", cmk),
    st(2, 4, todayStr, "14:00", "3D", "cas", cmk),
    st(3, 4, todayStr, "22:00", "2D", "sub", cmk),
    st(4, 4, todayStr, "19:30", "2D", "sub", cmk),
    st(8, 4, todayStr, "16:30", "2D", "cas", cmk),

    // === Hoyts Unicenter (6) ===
    st(1, 6, todayStr, "13:00", "2D", "cas", cmk),
    st(1, 6, todayStr, "16:15", "IMAX", "sub", cmk),
    st(1, 6, todayStr, "19:30", "2D", "sub", cmk),
    st(1, 6, tomorrowStr, "14:30", "2D", "cas", cmk),
    st(2, 6, todayStr, "11:30", "2D", "cas", cmk),
    st(2, 6, todayStr, "14:30", "3D", "cas", cmk),
    st(3, 6, todayStr, "21:30", "2D", "sub", cmk),
    st(4, 6, todayStr, "18:00", "4DX", "sub", cmk),
    st(5, 6, todayStr, "16:00", "2D", "sub", cmk),
    st(6, 6, todayStr, "20:00", "2D", "sub", cmk),
    st(10, 6, todayStr, "12:00", "2D", "cas", cmk),

    // === Cinemark Córdoba (15) ===
    st(1, 15, todayStr, "14:00", "2D", "cas", cmk),
    st(1, 15, todayStr, "17:30", "2D", "sub", cmk),
    st(1, 15, todayStr, "21:00", "IMAX", "sub", cmk),
    st(2, 15, todayStr, "11:00", "2D", "cas", cmk),
    st(4, 15, todayStr, "19:00", "2D", "sub", cmk),
    st(6, 15, todayStr, "21:30", "2D", "sub", cmk),

    // === Cinemark Rosario (18) ===
    st(1, 18, todayStr, "14:30", "2D", "cas", cmk),
    st(1, 18, todayStr, "18:00", "2D", "sub", cmk),
    st(2, 18, todayStr, "11:30", "2D", "cas", cmk),
    st(4, 18, todayStr, "19:30", "2D", "sub", cmk),
    st(5, 18, todayStr, "16:30", "2D", "sub", cmk),

    // === Cinépolis Recoleta (21) ===
    st(1, 21, todayStr, "13:45", "2D", "sub", cpol),
    st(1, 21, todayStr, "17:00", "2D", "cas", cpol),
    st(1, 21, todayStr, "20:15", "2D", "sub", cpol),
    st(2, 21, todayStr, "11:00", "2D", "cas", cpol),
    st(3, 21, todayStr, "22:30", "2D", "sub", cpol),
    st(4, 21, todayStr, "19:00", "2D", "sub", cpol),
    st(5, 21, todayStr, "15:45", "2D", "sub", cpol),
    st(7, 21, todayStr, "18:15", "2D", "sub", cpol),
    st(8, 21, todayStr, "16:00", "2D", "cas", cpol),

    // === Cinépolis Avellaneda (22) ===
    st(1, 22, todayStr, "14:30", "2D", "cas", cpol),
    st(1, 22, todayStr, "18:00", "XD", "sub", cpol),
    st(1, 22, todayStr, "21:15", "2D", "sub", cpol),
    st(2, 22, todayStr, "12:00", "2D", "cas", cpol),
    st(2, 22, todayStr, "15:00", "3D", "cas", cpol),
    st(4, 22, todayStr, "19:00", "2D", "sub", cpol),
    st(6, 22, todayStr, "21:30", "2D", "sub", cpol),

    // === Cinépolis Pilar (23) ===
    st(1, 23, todayStr, "15:00", "2D", "cas", cpol),
    st(1, 23, todayStr, "18:30", "2D", "sub", cpol),
    st(2, 23, todayStr, "12:30", "2D", "cas", cpol),
    st(4, 23, todayStr, "20:00", "2D", "sub", cpol),
    st(10, 23, todayStr, "13:00", "2D", "cas", cpol),

    // === Showcase Belgrano (29) ===
    st(1, 29, todayStr, "14:00", "2D", "sub", shw),
    st(1, 29, todayStr, "17:15", "2D", "cas", shw),
    st(1, 29, todayStr, "20:30", "IMAX", "sub", shw),
    st(1, 29, tomorrowStr, "15:00", "IMAX", "sub", shw),
    st(2, 29, todayStr, "11:30", "2D", "cas", shw),
    st(2, 29, todayStr, "14:30", "3D", "sub", shw),
    st(3, 29, todayStr, "22:00", "2D", "sub", shw),
    st(4, 29, todayStr, "18:30", "2D", "sub", shw),
    st(5, 29, todayStr, "16:00", "2D", "sub", shw),
    st(7, 29, todayStr, "19:00", "2D", "sub", shw),
    st(11, 29, todayStr, "21:30", "2D", "sub", shw),

    // === Showcase Norte (30) ===
    st(1, 30, todayStr, "14:30", "2D", "cas", shw),
    st(1, 30, todayStr, "17:45", "4DX", "sub", shw),
    st(1, 30, todayStr, "21:00", "2D", "sub", shw),
    st(2, 30, todayStr, "12:00", "2D", "cas", shw),
    st(4, 30, todayStr, "19:30", "2D", "sub", shw),
    st(5, 30, todayStr, "15:30", "2D", "sub", shw),
    st(8, 30, todayStr, "17:00", "2D", "cas", shw),

    // === Showcase Haedo (31) ===
    st(1, 31, todayStr, "15:00", "2D", "cas", shw),
    st(1, 31, todayStr, "18:30", "2D", "sub", shw),
    st(2, 31, todayStr, "12:00", "2D", "cas", shw),
    st(4, 31, todayStr, "20:00", "2D", "sub", shw),
    st(10, 31, todayStr, "13:30", "2D", "cas", shw),

    // === Showcase Córdoba (34) ===
    st(1, 34, todayStr, "14:00", "2D", "cas", shw),
    st(1, 34, todayStr, "17:30", "2D", "sub", shw),
    st(1, 34, todayStr, "21:00", "2D", "sub", shw),
    st(2, 34, todayStr, "11:00", "2D", "cas", shw),
    st(4, 34, todayStr, "19:00", "2D", "sub", shw),

    // === Atlas Flores (35) ===
    st(1, 35, todayStr, "15:00", "2D", "cas", atl),
    st(1, 35, todayStr, "18:15", "2D", "sub", atl),
    st(2, 35, todayStr, "12:30", "2D", "cas", atl),
    st(4, 35, todayStr, "20:30", "2D", "sub", atl),
    st(5, 35, todayStr, "16:00", "2D", "sub", atl),
    st(8, 35, todayStr, "17:30", "2D", "cas", atl),

    // === Atlas Caballito (36) ===
    st(1, 36, todayStr, "14:30", "2D", "cas", atl),
    st(1, 36, todayStr, "17:45", "2D", "sub", atl),
    st(2, 36, todayStr, "11:00", "2D", "cas", atl),
    st(3, 36, todayStr, "21:30", "2D", "sub", atl),
    st(5, 36, todayStr, "15:30", "2D", "sub", atl),

    // === Atlas Alcorta (37) ===
    st(1, 37, todayStr, "14:00", "2D", "sub", atl),
    st(1, 37, todayStr, "17:30", "2D", "cas", atl),
    st(1, 37, todayStr, "21:00", "2D", "sub", atl),
    st(4, 37, todayStr, "18:30", "2D", "sub", atl),
    st(5, 37, todayStr, "15:45", "2D", "sub", atl),
    st(7, 37, todayStr, "19:15", "2D", "sub", atl),

    // === Cinemacenter Mar del Plata (41) ===
    st(1, 41, todayStr, "15:00", "2D", "cas", cmc),
    st(1, 41, todayStr, "18:30", "2D", "sub", cmc),
    st(2, 41, todayStr, "12:00", "2D", "cas", cmc),
    st(4, 41, todayStr, "20:00", "2D", "sub", cmc),
    st(10, 41, todayStr, "13:00", "2D", "cas", cmc),

    // === Cinemacenter Tucumán (43) ===
    st(1, 43, todayStr, "14:30", "2D", "cas", cmc),
    st(1, 43, todayStr, "18:00", "2D", "sub", cmc),
    st(2, 43, todayStr, "11:30", "2D", "cas", cmc),
    st(4, 43, todayStr, "19:30", "2D", "sub", cmc),
  ];

  await db.insert(showtimes).values(showtimeData).onConflictDoNothing();
  console.log(`Inserted ${showtimeData.length} showtimes (skipped existing)`);

  console.log("Seed complete!");
  await closeDb();
}

seed().catch(console.error);
