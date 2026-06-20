import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

/** Marco común de las páginas legales (privacidad, términos): cabecera + contenedor de lectura. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/login" className="text-lg font-semibold tracking-tight">
            Lawzora
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            ← Volver
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última actualización: {updated}</p>
        <article className="mt-8 space-y-5 text-[14px] leading-relaxed text-foreground/90 [&_a]:text-[var(--brand)] [&_a:hover]:underline [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </article>
        <footer className="mt-12 border-t pt-6 text-[13px] text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacidad
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-foreground">
            Términos del servicio
          </Link>
        </footer>
      </main>
    </div>
  );
}
