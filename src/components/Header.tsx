import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { HomeOnlyDatePicker } from "./HomeOnlyDatePicker";

export function Header() {
  return (
    <nav aria-label="Navegación principal" className="fixed top-0 w-full z-50 bg-surface/70 backdrop-blur-xl shadow-2xl shadow-black/40">
      <div className="max-w-screen-2xl mx-auto px-6 py-4 flex justify-between items-center gap-4">
        <div className="flex items-center gap-8 min-w-0">
          <BrandLogo />
          <HomeOnlyDatePicker />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href="/cines"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-base leading-none">theaters</span>
            Cines
          </Link>
          <Link
            href="/estrenos"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold text-primary border border-primary/30 hover:bg-primary-container hover:text-on-primary-container hover:border-transparent transition-colors"
          >
            <span className="material-symbols-outlined text-base leading-none">fiber_new</span>
            Estrenos
          </Link>
        </div>
      </div>
    </nav>
  );
}
