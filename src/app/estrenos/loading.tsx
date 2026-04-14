export default function Loading() {
  return (
    <div>
      <div className="h-5 w-24 rounded bg-surface-container-high animate-pulse mb-6" />
      <div className="border-b border-outline-variant/20 pb-5 md:pb-7 space-y-4 mb-6 md:mb-10">
        <div className="h-16 md:h-24 w-40 rounded bg-surface-container-high animate-pulse" />
        <div className="h-4 w-44 rounded bg-surface-container-high animate-pulse" />
        <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-full overflow-hidden">
          {["w-14", "w-20", "w-24", "w-24", "w-24", "w-24", "w-24"].map((w, i) => (
            <div key={i} className={`${w} h-8 rounded-full bg-surface-container-high animate-pulse shrink-0`} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[2/3] rounded-2xl bg-surface-container animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-surface-container animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-surface-container animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
