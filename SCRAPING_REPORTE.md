# Reporte de Inspección de Sitios de Cines Argentinos

> **Fecha:** 2026-04-01  
> **Objetivo:** Analizar la viabilidad de scraping de 5 cadenas de cines argentinos  
> **Herramienta recomendada:** Playwright (headless browser)

---

## Resumen Ejecutivo

| Sitio | Tipo | API Interna | Dificultad | Estrategia Principal |
|-------|------|-------------|------------|----------------------|
| Cinemark Hoyts | SPA | ✅ Sí (archivo JS estático) | **Fácil** | Fetch directo del archivo Billboard JS |
| Showcase | SSR (Apache) | ❓ Desconocida | **Media** | Playwright + DOM parsing |
| Village Cines | SPA | ✅ Probable (Vista/API) | **Media** | Playwright + interceptar requests |
| Cinépolis | SPA | ✅ Probable (API REST) | **Media** | Playwright + interceptar requests |
| Atlas Cines | SSR (server-side) | ❌ No encontrada | **Media-Difícil** | Playwright + DOM parsing |

---

## 1. Cinemark Hoyts (cinemarkhoyts.com.ar)

### Tipo de Renderizado
**SPA** — El sitio es una Single Page Application. El HTML inicial contiene un shell mínimo y el contenido se carga dinámicamente con JavaScript.

### API Interna
**✅ SÍ — Archivo de Billboard estático en JS**

```
https://www.cinemarkhoyts.com.ar/ws/Billboard_WWW_{timestamp}.js
```

- Este archivo contiene **TODOS** los datos de cartelera en formato JavaScript (parseble como JSON)
- Incluye: películas, horarios, cines, salas, formatos, idiomas
- Se actualiza periódicamente (el timestamp en el nombre cambia)
- **Esta es la fuente de datos principal y más fácil de consumir**

Además, el sitio usa el backend **Vista Entertainment Solutions**, que expone:
- OData API: `/WSVistaWebClient/OData.svc/{Entity}` (Cinemas, ScheduledFilms, Sessions, Films)
- REST API v1/v2: `/WSVistaWebClient/api/v1/...`
- OCAPI (Omni-Channel API): `/ocapi/v1/...`

Sistema de tickets en: `tickets.cinemarkhoyts.com.ar/NSTicketing/`

### Selectores CSS Probables
Como es SPA, los selectores dependen del rendering JS. Elementos típicos del Billboard JS:
- Nombre de película: campo en el objeto JS del Billboard (no selector CSS directo)
- Horarios: idem, contenidos en el archivo JS
- Formato: campo del objeto (2D, 3D, IMAX, 4DX, XD, etc.)
- Idioma: campo del objeto (Subtitulada, Castellano, Doblada)

### URL de cartelera
```
https://www.cinemarkhoyts.com.ar/cartelera/todas-las-peliculas
```

### Dificultad: FÁCIL
El archivo Billboard JS contiene todos los datos estructurados. Se puede hacer fetch directo sin necesidad de Playwright. Solo hay que parsear el JavaScript.

### Proyectos de referencia en GitHub
- [lndgalante/cinemark-api-wrapper](https://github.com/lndgalante/cinemark-api-wrapper) — Wrapper en TypeScript
- [ldellisola/InfoCines](https://github.com/ldellisola/InfoCines) — Wrapper .NET para CinemarkHoyts y Village
- [diogovalentte/cinemark-api](https://github.com/diogovalentte/cinemark-api) — API para Cinemark Brasil

---

## 2. Showcase (todoshowcase.com)

### Tipo de Renderizado
**SSR** — Servidor Apache. El HTML parece renderizarse del lado del servidor. No se detectaron frameworks SPA (React, Angular, Vue) en las búsquedas.

### API Interna
**❓ No confirmada** — No se encontraron endpoints de API documentados públicamente. El sitio parece servir HTML estático/server-rendered.

**Nota importante:** Al momento de la inspección, varias páginas de cartelera mostraban el placeholder "Testing movie guide", lo que sugiere que el sistema de cartelera podría estar en migración o mantenimiento.

### Selectores CSS Probables
Sin acceso directo al DOM, se requiere inspección con Playwright. Patrones de URL detectados:
```
/cartelera/{ciudad}  (ej: /cartelera/rosario, /cartelera/belgrano, /cartelera/haedo)
/cines
/precios
```

### URLs de navegación
```
https://www.todoshowcase.com/cartelera/belgrano
https://www.todoshowcase.com/cartelera/rosario
https://www.todoshowcase.com/cartelera/haedo
https://www.todoshowcase.com/cartelera/allende
https://www.todoshowcase.com/cines
https://www.todoshowcase.com/precios
```

### Dificultad: MEDIA
Requiere Playwright para renderizar y extraer datos del DOM. La estructura de cartelera por sucursal implica múltiples requests. El estado de "Testing movie guide" genera incertidumbre sobre la estabilidad del contenido.

### Info adicional
- Propiedad de **National Amusements Inc.**
- Complejos: Norcenter, IMAX, Belgrano, Haedo, Quilmes, Rosario, Córdoba (Villa Cabrera y Villa Allende)
- Sistema de entradas en: `entradas.todoshowcase.com`

---

## 3. Village Cines (villagecines.com)

### Tipo de Renderizado
**SPA (probable)** — El sitio utiliza Cloudflare CDN/DNS. La protección de Cloudflare y el 403 en requests sin browser sugieren un sitio que requiere JavaScript para renderizar. Probablemente React o Angular.

### API Interna
**✅ Probable** — El proyecto [InfoCines](https://github.com/ldellisola/InfoCines) en GitHub confirma que Village Cines tiene una "public or known API" que el wrapper consume. Los endpoints específicos están en el código fuente del proyecto.

Es probable que Village Cines también use el backend **Vista Entertainment** (común en cadenas de cine argentinas), lo que implicaría endpoints similares a Cinemark:
- `/WSVistaWebClient/OData.svc/`
- `/WSVistaWebClient/api/v1/`
- OCAPI endpoints

### Selectores CSS Probables
Requiere inspección con Playwright (Cloudflare bloquea requests simples). Selectores típicos de sitios de cine SPA:
- Nombre de película: `.movie-title`, `.film-name`, `h2/h3` dentro de cards
- Horarios: `.showtime`, `.session-time`, botones con hora
- Formato: badges/tags con `.format`, `.version`
- Idioma: badges/tags con `.language`, `.lang`

*(Estos son estimados — requieren verificación con Playwright)*

### URL de cartelera
```
https://www.villagecines.com/cartelera
```

### Dificultad: MEDIA
Cloudflare protection + SPA requiere Playwright con user-agent apropiado. La existencia de una API conocida (vía InfoCines) facilita la tarea si se identifican los endpoints correctos.

---

## 4. Cinépolis (cinepolis.com.ar)

### Tipo de Renderizado
**SPA (probable)** — El 403 en requests sin browser y el patrón de sitios Cinépolis a nivel global sugieren una SPA (probablemente React o Angular). Los sitios de Cinépolis en otros países (México, USA, Brasil) son SPAs con APIs REST.

### API Interna
**✅ Probable (API REST)** — Basándose en el patrón de Cinépolis en otros países:
- Cinépolis Brasil tiene una API documentada por [afilhodaniel/cinepolis_api](https://github.com/afilhodaniel/cinepolis_api) que usa **Nokogiri** para parsing HTML
- La API devuelve JSON con: estados/ciudades, complejos con horarios (salas, horarios, doblada/subtitulada), películas con metadata

Es probable que `cinepolis.com.ar` siga una estructura similar a otros países de Cinépolis.

### Selectores CSS Probables
Basándose en la estructura de Cinépolis en otros países:
- Nombre de película: `.movie-name`, `.titulo-pelicula`
- Horarios: `.showtime-btn`, `.horario`
- Formato: `.format-tag` (2D, 3D, 4DX, IMAX)
- Idioma: `.language-tag` (SUB, DOB, ESP)

*(Estos son estimados basados en sitios Cinépolis de otros países — requieren verificación)*

### URL de cartelera
```
https://www.cinepolis.com.ar/cartelera
```

### Dificultad: MEDIA
Similar a Village: SPA que requiere Playwright. La estructura de Cinépolis es consistente entre países, lo que facilita predecir la estructura. Si se identifica la API interna, el scraping se simplifica significativamente.

---

## 5. Atlas Cines (atlascines.com)

### Tipo de Renderizado
**SSR (server-side rendering)** — Indicios de ser una aplicación server-rendered (posiblemente ASP.NET):
- Patrón de URL: `/DynamicPages/page?codSection=TermsAndConds` (típico de ASP.NET)
- Patrón de URL: `/Peliculas?codPelicula=305` (query parameters estilo server-side)
- Sin indicios de frameworks SPA en las búsquedas

### API Interna
**❌ No encontrada** — No se detectaron endpoints de API públicos ni wrappers existentes. El sitio parece servir HTML renderizado del servidor sin API REST/GraphQL separada.

### Selectores CSS Probables
Requiere inspección con Playwright. Patrones de URL detectados:
```
/Cartelera                          → Listado general de cartelera
/cartelera/cartelera                → Variante de cartelera
/Peliculas?codPelicula={id}         → Detalle de película individual
/DynamicPages/page?codSection=...   → Páginas dinámicas (términos, etc.)
```

Selectores estimados (ASP.NET tiende a usar IDs y clases descriptivas):
- Nombre de película: posiblemente en `h1/h2` o elemento con clase descriptiva
- Horarios: tablas o listas con horarios por complejo
- Formato: texto dentro de badges (2D, 3D, 4D)
- Idioma: texto junto al formato (SUB, DOB, CAST)

*(Requieren verificación con Playwright)*

### Info adicional
- Complejos: Caballito, Catán, Alcorta, Patio Bullrich, Nordelta, Flores, Liniers
- Tienda online: `shop.atlascines.com` (Cine En Casa — venta de códigos de películas)

### Dificultad: MEDIA-DIFÍCIL
Server-rendered sin API conocida significa que hay que parsear HTML directamente. La estructura de URLs con query parameters sugiere que se puede navegar programáticamente, pero requiere entender la estructura del DOM completa.

---

## Recomendación de Herramienta: Playwright

### ¿Por qué Playwright?

1. **Soporte multi-browser:** Chrome, Firefox, Safari — ideal para manejar las diferentes protecciones de cada sitio
2. **Intercepción de requests:** Permite capturar las llamadas a APIs internas (XHR/fetch) que los sitios hacen al cargar datos
3. **Manejo de Cloudflare:** Mejor que Puppeteer para bypasear protecciones anti-bot
4. **Auto-wait:** Espera automáticamente a que los elementos estén disponibles (crucial para SPAs)
5. **Screenshots:** Captura de pantalla integrada para debugging y verificación
6. **Contextos aislados:** Permite múltiples sesiones paralelas sin interferencia

### Estrategia por sitio

```
┌─────────────────┬────────────────────────────────────────────────┐
│ Sitio           │ Estrategia                                     │
├─────────────────┼────────────────────────────────────────────────┤
│ Cinemark Hoyts  │ fetch() directo al Billboard JS (sin browser)  │
│                 │ Fallback: Playwright si cambian la estructura   │
├─────────────────┼────────────────────────────────────────────────┤
│ Showcase        │ Playwright: navegar cartelera por sucursal,     │
│                 │ parsear DOM HTML                                │
├─────────────────┼────────────────────────────────────────────────┤
│ Village Cines   │ Playwright: interceptar API calls en Network,   │
│                 │ consumir API directamente si se descubre        │
├─────────────────┼────────────────────────────────────────────────┤
│ Cinépolis       │ Playwright: interceptar API calls en Network,   │
│                 │ consumir API directamente si se descubre        │
├─────────────────┼────────────────────────────────────────────────┤
│ Atlas Cines     │ Playwright: navegar cartelera, parsear DOM      │
│                 │ HTML server-rendered                            │
└─────────────────┴────────────────────────────────────────────────┘
```

### Código base sugerido para interceptación de APIs

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Interceptar requests de API
const apiResponses: { url: string; data: unknown }[] = [];
page.on('response', async (response) => {
  const url = response.url();
  if (
    response.request().resourceType() === 'xhr' ||
    response.request().resourceType() === 'fetch'
  ) {
    try {
      const json = await response.json();
      apiResponses.push({ url, data: json });
      console.log(`API encontrada: ${url}`);
    } catch {
      // No es JSON, ignorar
    }
  }
});

await page.goto('https://www.villagecines.com/cartelera');
await page.waitForLoadState('networkidle');

// Revisar las APIs encontradas
for (const { url, data } of apiResponses) {
  console.log(`URL: ${url}`);
  console.log(`Data keys: ${Object.keys(data as object)}`);
}

await browser.close();
```

---

## Notas sobre la Inspección

### Limitaciones encontradas
- **Sin acceso HTTP directo:** Todos los sitios devolvieron HTTP 403 tanto vía `curl` como `WebFetch`, incluso con User-Agent de browser. Esto confirma que usan protecciones anti-bot (Cloudflare, WAF, etc.)
- **Sin Playwright disponible en este entorno:** No fue posible descargar Chromium por restricciones de red. El análisis se basó en WebSearch, repositorios existentes de GitHub, y conocimiento de las plataformas
- **Los selectores CSS son estimados:** Requieren verificación en un entorno con Playwright funcional

### Próximos pasos recomendados
1. Instalar Playwright localmente: `npm install playwright && npx playwright install chromium`
2. Ejecutar el script de interceptación de APIs en cada sitio
3. Para Cinemark: probar fetch directo al archivo `Billboard_WWW_*.js`
4. Documentar los selectores CSS exactos una vez renderizados los sitios
5. Capturar screenshots de cada sitio con Playwright
