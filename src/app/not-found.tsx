import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="material-symbols-outlined text-6xl text-on-surface-variant mb-4">
        movie_filter
      </span>
      <h1 className="text-4xl font-black font-headline tracking-tighter text-on-surface">
        404
      </h1>
      <p className="mt-4 text-on-surface-variant font-semibold">Página no encontrada</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-full bg-primary-container px-6 py-2.5 text-sm font-bold text-on-primary-container hover:bg-primary transition-colors"
      >
        Volver a la cartelera
      </Link>
    </div>
  );
}
