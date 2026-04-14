export default function Loading() {
  return (
    <div>
      <div className="h-5 w-24 rounded bg-surface-container-high animate-pulse mb-6" />
      <div className="border-b border-outline-variant/20 pb-5 md:pb-7 space-y-4">
        <div className="h-16 md:h-24 w-48 rounded bg-surface-container-high animate-pulse" />
        <div className="h-4 w-36 rounded bg-surface-container-high animate-pulse" />
        <div className="flex gap-3">
          <div className="h-10 w-40 md:w-48 rounded-xl bg-surface-container-high animate-pulse" />
          <div className="h-10 w-44 rounded-full bg-surface-container-high animate-pulse" />
        </div>
      </div>
      <div className="mt-6 md:mt-8 space-y-10">
        {[8, 6, 5].map((count, z) => (
          <section key={z}>
            <div className="h-4 w-32 rounded bg-surface-container-high animate-pulse mb-6" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-surface-container rounded-xl h-28 animate-pulse" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
