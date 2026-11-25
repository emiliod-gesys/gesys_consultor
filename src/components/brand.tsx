import Image from "next/image";

export function BrandLogo({ className = "w-44 sm:w-52" }: { className?: string }) {
  return (
    <Image
      src="/brand/gesys-logo.png"
      alt="Gesys. Soluciones e implementaciones tecnológicas."
      width={960}
      height={271}
      priority
      className={`h-auto ${className}`}
    />
  );
}
