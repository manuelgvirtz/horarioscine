import Link from "next/link";
import Image from "next/image";

interface Props {
  size?: "sm" | "md";
}

const sizes = {
  sm: { img: "h-7 w-7", text: "text-lg font-bold" },
  md: { img: "h-9 w-9", text: "text-xl font-black tracking-tight" },
};

export function BrandLogo({ size = "md" }: Props) {
  const s = sizes[size];
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image src="/logo.svg" alt="cartelera.ar" width={36} height={36} className={s.img} />
      <div className="flex flex-col leading-none gap-0.5">
        <span className={`${s.text} font-headline`}>
          <span className="text-primary">cartelera</span>
          <span className="text-on-surface">.ar</span>
        </span>
        <p className="text-[10px] text-on-surface-variant tracking-wide">Absolutamente cine 🚬</p>
      </div>
    </Link>
  );
}
