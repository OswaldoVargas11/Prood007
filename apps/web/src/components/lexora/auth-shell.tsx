import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/lexora/logo';

/**
 * Marco compartido de las páginas públicas de autenticación (login, recuperar/restablecer
 * contraseña). Split editorial claro y minimalista (dirección "Sello · luz"): a la izquierda la
 * "tesis" de la landing (sans con tracking ajustado · acento teal · hairline cobre con la fila de
 * cumplimiento) y a la derecha el formulario (`children`). En pantallas < lg el panel se oculta y
 * queda solo la columna del formulario centrada.
 *
 * `lz-light` fuerza la paleta clara aunque el tema global del interior sea oscuro (ver globals.css):
 * todas las utilidades Tailwind de dentro (bg-background, text-muted-foreground…) se resuelven en
 * claro. Cero precios/datos: solo identidad.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="lz-light relative grid min-h-screen grid-rows-1 overflow-hidden bg-background text-foreground lg:grid-cols-[1.05fr_minmax(440px,0.95fr)]">
      {/* ── Panel editorial (la "tesis" de la landing) — solo en pantallas grandes ── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-[var(--surface-2)] p-12 lg:flex xl:p-16">
        {/* rejilla sutil enmascarada, como el hero de la landing */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(78% 60% at 28% 22%, #000 0%, transparent 76%)',
            WebkitMaskImage: 'radial-gradient(78% 60% at 28% 22%, #000 0%, transparent 76%)',
            opacity: 0.7,
          }}
        />
        {/* resplandor teal del brand, muy contenido */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: '-12%',
            top: '-16%',
            width: 760,
            height: 620,
            background: 'radial-gradient(50% 50% at 42% 32%, var(--brand-soft), transparent 70%)',
          }}
        />

        <div className="relative z-10">
          <Logo size={32} />
        </div>

        <div className="relative z-10 max-w-[34ch]">
          <p className="mb-6 font-mono text-[12px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="text-[var(--brand)]">●</span> Software para despachos transaccionales
          </p>
          <h1 className="text-[clamp(34px,3.4vw,52px)] font-[580] leading-[1.06] tracking-[-0.035em] text-foreground">
            Del encargo al cierre, <em className="not-italic text-[var(--brand)]">en un sitio</em>.
          </h1>
          <p className="mt-6 max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">
            Entra para continuar la operación: data room, redline, checklist de cierre y facturación
            con Verifactu — sin saltar entre programas.
          </p>
        </div>

        <div className="relative z-10">
          <div
            className="mb-4 h-px w-full max-w-md"
            style={{ background: 'linear-gradient(90deg, var(--seal-line), transparent)' }}
          />
          <div className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <ShieldCheck size={14} className="text-[var(--seal-strong)]" aria-hidden />
            <span>Verifactu · e-CF · AEAT · DGII · RGPD</span>
          </div>
        </div>
      </aside>

      {/* ── Columna del formulario ── */}
      <div className="relative flex flex-col items-center justify-center overflow-y-auto bg-background px-6 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05] lg:hidden"
          style={{
            background: 'radial-gradient(60% 50% at 50% 0%, var(--ai-from), transparent 70%)',
          }}
        />

        {children}

        <p className="relative z-10 mt-6 text-center text-[11.5px] text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground hover:underline">
            Privacidad
          </Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-foreground hover:underline">
            Términos del servicio
          </Link>
        </p>
      </div>
    </main>
  );
}
