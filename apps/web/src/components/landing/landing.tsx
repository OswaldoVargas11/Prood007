'use client';

import { motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Lock,
  PiggyBank,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { DURATION, EASE } from '@/lib/motion';
import { Reveal } from './reveal';

/**
 * Landing pública (BORRADOR para revisión). Misma marca/Geist/tokens que la app + sistema de movimiento.
 * Copy es-ES pendiente de revisión del owner (valor y precios marcados). i18n se aplica al fijar el copy.
 * Capturas: placeholders estilizados — se sustituyen por capturas reales de la app pulida (Parte A).
 */
const BENEFITS = [
  {
    icon: CreditCard,
    title: 'Cobro online',
    body: 'Cobra con tarjeta; el dinero va directo a tu cuenta.',
  },
  {
    icon: PiggyBank,
    title: 'Provisión de fondos',
    body: 'Pide provisiones y lleva el saldo del expediente en tiempo real.',
  },
  {
    icon: CalendarClock,
    title: 'Plazos procesales',
    body: 'Vencimientos con días hábiles y festivos; recordatorios que no fallan.',
  },
  {
    icon: Users,
    title: 'Portal del cliente',
    body: 'Tu cliente ve sus expedientes, facturas y documentos en su espacio.',
  },
  {
    icon: CheckCircle2,
    title: 'Todo incluido',
    body: 'Sin niveles de funciones: todas las capacidades, una tarifa por usuario.',
  },
  {
    icon: ShieldCheck,
    title: 'España + R. Dominicana',
    body: 'Una herramienta para despachos en ES, en RD o en ambos.',
  },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-[var(--brand)] text-white">
              <ShieldCheck className="size-3.5" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Lawzora</span>
          </div>
          <nav className="hidden items-center gap-6 text-[13px] text-muted-foreground sm:flex">
            <a href="#producto" className="transition-colors hover:text-foreground">
              Producto
            </a>
            <a href="#cumplimiento" className="transition-colors hover:text-foreground">
              Cumplimiento
            </a>
            <a href="#precios" className="transition-colors hover:text-foreground">
              Precios
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/login"
              className="rounded-md bg-[var(--brand)] px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[var(--shadow-xs)] transition-colors hover:opacity-90"
            >
              Prueba gratis
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        {/* acento de marca MUY sutil de fondo (sin morado chillón) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] opacity-[0.5]"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 0%, color-mix(in oklch, var(--brand) 22%, transparent), transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-20 text-center sm:pt-28">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.entrance }}
            className="text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Software de gestión para despachos · España y R. Dominicana
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.entrance, delay: 0.05 }}
            className="mx-auto mt-4 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            El despacho, al día. La facturación, en regla.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.entrance, delay: 0.1 }}
            className="mx-auto mt-4 max-w-2xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base"
          >
            Único con <strong className="text-foreground">Verifactu (España)</strong> y{' '}
            <strong className="text-foreground">e-CF (Rep. Dominicana)</strong> nativos: facturación
            fiscal válida desde el primer día, sin add-ons ni integraciones a medias.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.entrance, delay: 0.15 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-5 py-2.5 text-[14px] font-semibold text-white shadow-[var(--shadow-sm)] transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.98]"
            >
              Empieza gratis 15 días <ArrowRight className="size-4" />
            </Link>
            <a
              href="#contacto"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-[14px] font-medium transition-colors hover:bg-accent"
            >
              Solicitar una demo
            </a>
          </motion.div>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Sin tarjeta para empezar · Todo incluido · ES/RD
          </p>

          {/* Visual de producto (PLACEHOLDER — se sustituye por captura real de la app pulida) */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE.entrance, delay: 0.2 }}
            className="mx-auto mt-12 max-w-4xl"
          >
            <AppMockup />
          </motion.div>
        </div>
      </section>

      {/* ── Diferenciador / foso ── */}
      <section id="cumplimiento" className="border-t border-border/60 bg-[var(--surface-2)]/40">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success-soft)] px-3 py-1 text-[12px] font-medium text-[var(--success)]">
              <FileCheck2 className="size-3.5" /> Cumplimiento fiscal nativo
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              Cumplimiento de verdad, no una casilla
            </h2>
            <p className="mt-3 text-pretty text-[14.5px] leading-relaxed text-muted-foreground">
              Verifactu y e-CF no son un extra: son la ley. Lawzora emite facturas con su registro
              fiscal encadenado y su QR/eNCF de cotejo, listas para{' '}
              <strong className="text-foreground">AEAT</strong> y{' '}
              <strong className="text-foreground">DGII</strong>. Lo que otros dejan para «más
              adelante», aquí ya funciona.
            </p>
          </Reveal>
          <Reveal
            delay={0.05}
            className="mx-auto mt-8 flex max-w-md flex-wrap items-center justify-center gap-3"
          >
            <Badge ok>Verifactu · AEAT</Badge>
            <Badge ok>e-CF · DGII</Badge>
            <Badge ok>Huella encadenada</Badge>
          </Reveal>
        </div>
      </section>

      {/* ── Beneficios ── */}
      <section id="producto" className="mx-auto max-w-6xl px-5 py-16">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Todo lo que el despacho necesita
          </h2>
          <p className="mt-3 text-[14.5px] text-muted-foreground">
            De la captación al cobro, pasando por los plazos y el portal del cliente.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.title} delay={(i % 3) * 0.05}>
              <div className="h-full rounded-xl border bg-card p-5 shadow-[var(--shadow-xs)] transition-shadow duration-200 hover:shadow-[var(--shadow-md)]">
                <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                  <b.icon className="size-5" />
                </span>
                <h3 className="mt-3 text-[14.5px] font-semibold">{b.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{b.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Confianza ── */}
      <section className="border-y border-border/60 bg-[var(--surface-2)]/40">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <Reveal className="grid items-center gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                <Lock className="size-3.5" /> Seguridad
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Tus datos, blindados
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                Construido para datos sensibles, con aislamiento total entre despachos.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Cifrado en reposo', 'Documentos y datos sensibles cifrados (AES-256-GCM).'],
                ['Verificación en dos pasos', '2FA para proteger cada cuenta.'],
                ['RGPD / Ley 172-13', 'Privacidad y retención conforme a ES y RD.'],
                ['Aislamiento por despacho', 'Cada despacho, su espacio estanco.'],
              ].map(([t, d]) => (
                <div key={t} className="rounded-lg border bg-card p-3.5">
                  <div className="flex items-center gap-2 text-[13.5px] font-medium">
                    <CheckCircle2 className="size-4 text-[var(--success)]" /> {t}
                  </div>
                  <p className="mt-1 pl-6 text-[12px] text-muted-foreground">{d}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Precios (REVISAR) ── */}
      <section id="precios" className="mx-auto max-w-6xl px-5 py-16">
        <Reveal className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Una tarifa, todo dentro
          </h2>
          <p className="mt-3 text-[14.5px] text-muted-foreground">
            Por usuario activo. Sin sorpresas.
          </p>
          <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-[var(--brand-line)] bg-card p-6 text-left shadow-[var(--shadow-md)]">
            <div className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Plan único · todo incluido
            </div>
            <div className="mt-2 flex items-end gap-1">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">€—</span>
              <span className="mb-1 text-[13px] text-muted-foreground">/ usuario / mes</span>
            </div>
            <p className="mt-1 text-[11.5px] font-medium text-[var(--warning)]">
              [REVISAR PRECIOS]
            </p>
            <ul className="mt-4 space-y-2 text-[13px]">
              {[
                'Verifactu + e-CF',
                'Cobro online + provisión',
                'Plazos + portal del cliente',
                'Sin niveles de funciones',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[var(--success)]" /> {f}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Empieza gratis <ArrowRight className="size-4" />
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ── CTA final ── */}
      <section id="contacto" className="border-t border-border/60">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center">
          <Reveal>
            <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              Pon tu despacho en regla hoy
            </h2>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Empieza gratis <ArrowRight className="size-4" />
              </Link>
              <a
                href="mailto:hola@lawzora.com"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-[14px] font-medium transition-colors hover:bg-accent"
              >
                Habla con nosotros
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/60 bg-[var(--surface-2)]/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-[12.5px] text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Lawzora · lawzora.com</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacidad
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Términos
            </Link>
            <a href="mailto:hola@lawzora.com" className="transition-colors hover:text-foreground">
              Contacto
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Badge({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[12.5px] font-medium">
      {ok && <CheckCircle2 className="size-3.5 text-[var(--success)]" />}
      {children}
    </span>
  );
}

/** Mockup estilizado de la app (placeholder; se reemplaza por captura real de la Parte A). */
function AppMockup() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-xl)]">
      <div className="flex items-center gap-1.5 border-b border-border bg-[var(--surface-2)] px-3 py-2">
        <span className="size-2.5 rounded-full bg-[var(--danger)]/60" />
        <span className="size-2.5 rounded-full bg-[var(--warning)]/60" />
        <span className="size-2.5 rounded-full bg-[var(--success)]/60" />
        <span className="ml-3 text-[11px] text-muted-foreground">
          lawzora.com · Factura F-2026-0042
        </span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <div className="h-5 w-40 rounded bg-[var(--surface-3)]" />
          <div className="rounded-lg border bg-[var(--surface-1)] p-3">
            <div className="mb-2 h-3 w-24 rounded bg-[var(--surface-3)]" />
            {[80, 60, 70].map((w, i) => (
              <div key={i} className="mb-1.5 flex items-center justify-between">
                <div className="h-3 rounded bg-[var(--surface-3)]" style={{ width: `${w}%` }} />
                <div className="h-3 w-10 rounded bg-[var(--surface-3)]" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] p-3">
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--success)]">
              <FileCheck2 className="size-3.5" /> Verifactu · AEAT
            </div>
            <div className="mt-2 size-16 rounded bg-[var(--surface-1)] [background-image:repeating-linear-gradient(45deg,var(--border)_0,var(--border)_2px,transparent_2px,transparent_4px)]" />
          </div>
          <div className="rounded-lg border bg-[var(--brand-soft)] p-3">
            <div className="h-3 w-16 rounded bg-[var(--brand-line)]" />
            <div className="mt-2 h-6 w-24 rounded bg-[var(--brand-line)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
