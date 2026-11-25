import Link from "next/link";
import { BrandLogo } from "@/components/brand";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
      <BrandLogo className="w-56" />
      <h1 className="mt-6 font-display text-5xl">Ese cliente no está</h1>
      <p className="mt-3 text-muted">Puede que se haya eliminado o que el enlace esté incompleto.</p>
      <Link className={`${buttonClass("solid")} mt-6 w-fit`} href="/">
        Volver a clientes
      </Link>
    </main>
  );
}
