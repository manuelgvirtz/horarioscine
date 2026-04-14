import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y condiciones — cartelera.ar",
  description: "Términos y condiciones de uso de cartelera.ar.",
};

export default function TerminosPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors font-semibold mb-6"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
        Cartelera
      </Link>

      <div className="border-b border-outline-variant/20 pb-5 md:pb-7 mb-8 md:mb-10">
        <h1 className="text-5xl md:text-7xl font-headline font-black tracking-tighter text-on-surface leading-none">
          Términos y condiciones
        </h1>
      </div>

      <div className="prose-custom space-y-8 text-on-surface-variant font-body text-sm leading-relaxed">

        <p className="text-base text-on-surface leading-relaxed">
          ¡Bienvenido/a a <strong className="text-primary font-bold">cartelera.ar</strong>! Este sitio fue creado a pulmón para solucionar un problema simple: encontrar rápidamente qué ver en los cines independientes y comerciales de Argentina.
        </p>
        <p>
          Al usar esta página, aceptás estos términos. Si no estás de acuerdo, por favor no uses el sitio. Es simple.
        </p>

        <section>
          <h2 className="text-lg font-headline font-black text-on-surface tracking-tight mb-3">1. Naturaleza del Servicio</h2>
          <p>
            cartelera.ar es un motor de búsqueda y agregador de información. No vendemos entradas, no reservamos butacas ni procesamos pagos. Nuestro único objetivo es recopilar y organizar los horarios y precios públicos de las páginas oficiales de los cines para que sean más fáciles de leer desde tu celular.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-headline font-black text-on-surface tracking-tight mb-3">2. Exactitud de los Datos</h2>
          <p className="mb-3">
            Toda la información mostrada (horarios, películas, precios, disponibilidad) se obtiene de forma automatizada desde los sitios web de terceros (como el Gaumont, Cacodelphia, Cinemark, etc.).
          </p>
          <div className="border-l-2 border-primary/40 pl-4 py-1">
            <p>
              <strong className="text-on-surface font-semibold">Regla de oro:</strong> Los cines cambian horarios a último momento o sus sistemas fallan. Hacemos todo lo posible por mostrar datos actualizados, pero no garantizamos que la información sea 100% exacta. Siempre verificá el horario y el precio en el enlace oficial del cine antes de salir de tu casa. No nos hacemos responsables si llegás al cine y la función se canceló.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-headline font-black text-on-surface tracking-tight mb-3">3. Enlaces a Sitios de Terceros</h2>
          <p>
            Cuando hacés clic en &quot;Comprar Entrada&quot; o ves un enlace a un cine, estás saliendo de cartelera.ar. Esas compras se procesan en plataformas externas (como Passline, Autoentrada, o la web del propio cine). No tenemos control sobre esas páginas, sus caídas, ni sus políticas de reembolso. Si tenés un problema con una entrada, tenés que reclamarle al cine o a la ticketera.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-headline font-black text-on-surface tracking-tight mb-3">4. Propiedad Intelectual</h2>
          <p className="mb-2">
            No somos dueños de las películas. Los títulos, pósters, sinopsis, marcas registradas y nombres de los cines pertenecen a sus respectivos dueños, distribuidoras y estudios.
          </p>
          <p>
            El uso de este material en cartelera.ar tiene un fin estricta y únicamente informativo y de interés público (uso leal / fair use), para promocionar la asistencia a las salas de cine.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-headline font-black text-on-surface tracking-tight mb-3">5. Disponibilidad del Sitio</h2>
          <p>
            Este es un proyecto independiente (y gratuito). Lo mantenemos lo mejor que podemos, pero el sitio puede caerse, estar en mantenimiento o dejar de funcionar sin previo aviso. No ofrecemos garantías de uptime.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-headline font-black text-on-surface tracking-tight mb-3">6. Privacidad y Analíticas</h2>
          <p>
            Para entender cuánta gente usa la página y qué cines buscan más, usamos herramientas de analítica web (Google Analytics). Medimos tráfico general de forma anónima. No recolectamos tu nombre, tu DNI, ni te pedimos que te registres. No vendemos bases de datos porque no las tenemos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-headline font-black text-on-surface tracking-tight mb-3">7. Cambios en estos Términos</h2>
          <p>
            Podemos modificar estos términos en el futuro si agregamos nuevas funciones (por ejemplo, si algún día permitimos crear cuentas de usuario). Si seguís usando la página después de los cambios, asumimos que estás de acuerdo.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-headline font-black text-on-surface tracking-tight mb-3">8. Contacto</h2>
          <p>
            Si sos el dueño de un cine y querés que corrijamos algún dato, sumemos tu sala, o por el contrario, querés que retiremos tu información del agregador, podés escribirnos (o mandarnos un DM en Twitter) y lo resolvemos enseguida.
          </p>
        </section>

        <p className="pt-4 border-t border-outline-variant/20 text-on-surface font-semibold">
          Absolutamente cine 🚬
        </p>

      </div>
    </div>
  );
}
