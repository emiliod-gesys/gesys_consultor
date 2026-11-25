import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/actions";
import { BrandLogo } from "@/components/brand";
import { buttonClass } from "@/components/ui";

export function Shell({
  children,
  aside,
  fill = false,
  compact = false,
}: {
  children: ReactNode;
  aside?: ReactNode;
  fill?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`mx-auto flex w-full max-w-6xl flex-col px-3 sm:px-8 ${compact ? "py-2 sm:py-3" : "py-6"} ${fill ? "h-dvh overflow-hidden" : "min-h-dvh"}`}
    >
      <header className={`flex items-center justify-between gap-2 ${compact ? "mb-2" : "mb-8"}`}>
        <Link href="/" className="flex min-w-0 items-center gap-3 rounded-2xl">
          <BrandLogo className={compact ? "w-24 sm:w-40" : "w-40 sm:w-52"} />
          <span className="hidden border-l border-line pl-3 text-[0.68rem] tracking-[0.22em] text-muted sm:inline">
            CONSULTOR
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {aside}
          <form action={logout}>
            <button className={buttonClass("ghost")} type="submit">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

export function PageFallback({ label }: { label: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6 sm:px-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <BrandLogo className="w-40 sm:w-52" />
        <div className="h-11 w-24 rounded-full border border-line" />
      </header>
      <p className="text-muted">Cargando {label.toLowerCase()}…</p>
    </div>
  );
}
