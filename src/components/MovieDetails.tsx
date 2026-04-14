import Image from "next/image";
import type { CastMember } from "@/types";
import { MobileDetailsToggle } from "./MobileDetailsToggle";

interface MovieDetailsProps {
  synopsis?: string | null;
  director?: string | null;
  castMembers?: CastMember[];
}

function CastRow({ director, castMembers }: { director?: string | null; castMembers: CastMember[] }) {
  return (
    <div className="space-y-2">
      {director && (
        <p className="text-xs text-on-surface-variant">
          <span className="font-bold text-on-surface uppercase tracking-wider text-[10px]">Dir.</span>{" "}
          {director}
        </p>
      )}
      {castMembers.length > 0 && (
        <div className="flex gap-4">
          {castMembers.map((actor) => (
            <div key={actor.name} className="flex flex-col items-center gap-1.5 w-14">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-container-highest shrink-0">
                {actor.profileUrl ? (
                  <Image
                    src={actor.profileUrl}
                    alt={actor.name}
                    width={48}
                    height={48}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-on-surface-variant text-xs font-bold"
                    aria-hidden="true"
                  >
                    {actor.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-on-surface-variant text-center leading-tight line-clamp-2 w-full">
                {actor.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MovieDetails({ synopsis, director, castMembers = [] }: MovieDetailsProps) {
  const hasCast = !!(director || castMembers.length > 0);
  const hasContent = !!(synopsis || hasCast);

  if (!hasContent) return null;

  const content = (
    <>
      {synopsis && (
        <p className="text-on-surface-variant text-sm leading-relaxed font-body">
          {synopsis}
        </p>
      )}
      {hasCast && <CastRow director={director} castMembers={castMembers} />}
    </>
  );

  return (
    <>
      {/* ── Mobile: toggle wraps server-rendered content ── */}
      <MobileDetailsToggle>{content}</MobileDetailsToggle>

      {/* ── Desktop: synopsis + cast inline, no toggle ── */}
      <div className="hidden md:flex flex-col gap-4 w-full">
        {synopsis && (
          <p className="text-on-surface-variant text-sm leading-relaxed font-body max-w-prose">
            {synopsis}
          </p>
        )}
        {hasCast && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Reparto</p>
            <CastRow director={director} castMembers={castMembers} />
          </div>
        )}
      </div>
    </>
  );
}
