import Link from "next/link";
import { BrandLogo } from "./BrandLogo";

export function Footer() {
  return (
    <footer className="w-full py-12 px-6 flex flex-col md:flex-row justify-between items-center gap-6 bg-surface-container-lowest border-t border-outline-variant/20">
      <div className="flex flex-col gap-2 items-center md:items-start">
        <BrandLogo size="sm" />
        <p className="text-sm text-on-surface-variant">
          Los horarios se actualizan periódicamente. Verificá en el sitio del
          cine antes de ir.
        </p>
      </div>
      <div className="flex gap-8">
        <Link href="/privacidad" className="text-on-surface-variant text-sm font-medium hover:text-primary transition-colors">
          Privacidad
        </Link>
        <Link href="/terminos" className="text-on-surface-variant text-sm font-medium hover:text-primary transition-colors">
          Términos y condiciones
        </Link>
        <a href="mailto:hola@cartelera.ar" className="text-on-surface-variant text-sm font-medium hover:text-primary transition-colors">
          Contacto
        </a>
      </div>
    </footer>
  );
}
