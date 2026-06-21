'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CreditCard,
  FileCheck2,
  FileLock2,
  FileText,
  History,
  Landmark,
  Link2,
  Lock,
  PiggyBank,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/lexora/logo';
import { ComplianceSeal } from '@/components/lexora/compliance-seal';
import { DURATION, EASE } from '@/lib/motion';
import { Reveal } from './reveal';

/**
 * Landing pública de Lawzora. Lidera con GESTIÓN (el porqué del uso diario); el cumplimiento
 * (Verifactu/e-CF) baja a diferenciador + urgencia. Misma marca/tokens/Geist que la app, framer-motion
 * con `Reveal` (respeta prefers-reduced-motion) y componentes reales (Button/Badge/Logo/ComplianceSeal).
 * Copy en messages/es.json (`landing.*`). Precios = espejo de subscription/plans.ts (SEAT_TIERS:
 * 1–5 → 39 € · 6–15 → 35 € · 16+ → 29 €; anual 2 meses gratis; prueba 15 días).
 */
const BENEFIT_ICONS: LucideIcon[] = [
  CreditCard,
  PiggyBank,
  CalendarClock,
  Users,
  FileText,
  ShieldCheck,
];
const SECURITY_ICONS: LucideIcon[] = [ShieldCheck, FileLock2, History, Users];

/** Ventana de producto con "traffic lights" (mock con datos ilustrativos; decorativo → aria-hidden). */
function MockWindow({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-2xl border bg-card text-left shadow-[var(--shadow-xl)]"
    >
      <div className="flex items-center gap-1.5 border-b bg-[var(--surface-2)] px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[var(--danger)]" />
        <span className="size-2.5 rounded-full bg-[var(--warning)]" />
        <span className="size-2.5 rounded-full bg-[var(--success)]" />
        <span className="ml-3 font-mono text-[11px] text-muted-foreground">{url}</span>
      </div>
      {children}
    </div>
  );
}

function MockRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-[var(--surface-1)] px-3 py-2.5 text-[13px]">
      {children}
    </div>
  );
}

export function Landing() {
  const t = useTranslations('landing');
  const benefits = t.raw('product.benefits') as { title: string; body: string }[];
  const metrics = t.raw('product.metrics') as { value: string; label: string }[];
  const bullets = t.raw('product.showcase.bullets') as string[];
  const security = t.raw('security.items') as { title: string; body: string }[];
  const features = t.raw('pricing.features') as string[];
  const priceTiers = t.raw('pricing.tiers') as { range: string; price: string }[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-[var(--shadow-md)] focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t('nav.skip')}
      </a>
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-[60px] max-w-5xl items-center justify-between px-6">
          <Logo size={26} />
          <nav className="hidden items-center gap-7 text-[13px] text-muted-foreground md:flex">
            <a
              href="#producto"
              className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('nav.product')}
            </a>
            <a
              href="#cumplimiento"
              className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('nav.compliance')}
            </a>
            <a
              href="#confianza"
              className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('nav.security')}
            </a>
            <a
              href="#precios"
              className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('nav.pricing')}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">{t('nav.login')}</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">{t('nav.trial')}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero (gestión) ── */}
      <section id="contenido" className="relative scroll-mt-20 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-32 h-[460px]"
          style={{
            background:
              'radial-gradient(58% 60% at 50% 0%, color-mix(in oklch, var(--brand) 22%, transparent), transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-5xl px-6 pb-10 pt-20 text-center sm:pt-24">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.entrance }}
            className="font-mono text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {t('hero.eyebrow')}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.entrance, delay: 0.05 }}
            className="mx-auto mt-4 max-w-[18ch] text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl"
          >
            {t('hero.title')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.entrance, delay: 0.1 }}
            className="mx-auto mt-4 max-w-[60ch] text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-base"
          >
            {t('hero.subtitle')}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.base, ease: EASE.entrance, delay: 0.15 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-3"
          >
            <Button asChild size="lg">
              <Link href="/login">
                {t('hero.ctaPrimary')} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#contacto">{t('hero.ctaSecondary')}</a>
            </Button>
          </motion.div>
          <p className="mt-3 text-[12px] text-muted-foreground">{t('hero.note')}</p>

          {/* Mock: panel del despacho (gestión, no factura) */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.chart, ease: EASE.entrance, delay: 0.2 }}
            className="mx-auto mt-12 max-w-3xl"
          >
            <MockWindow url={t('hero.mockUrl')}>
              <div className="grid gap-4 p-4 md:grid-cols-[1.4fr_1fr]">
                <div className="flex flex-col gap-2.5">
                  {[1, 2, 3].map((n) => (
                    <MockRow key={n}>
                      <span className="min-w-0">
                        <b className="font-semibold">{t(`hero.mockMatter${n}`)}</b>
                        <br />
                        <span className="font-mono text-[12px] text-muted-foreground">
                          {t(`hero.mockMatter${n}Ref`)}
                        </span>
                      </span>
                      <Badge variant={n === 1 ? 'success' : n === 2 ? 'info' : 'warning'}>
                        {t(`hero.mockMatter${n}State`)}
                      </Badge>
                    </MockRow>
                  ))}
                </div>
                <div className="flex flex-col gap-3 rounded-lg border bg-[var(--surface-2)] p-3.5">
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--brand)]">
                    <CalendarClock className="size-4" /> {t('hero.mockDeadlineLabel')}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]">
                      <b className="text-[15px] leading-none">08</b>
                      <span className="mt-0.5 font-mono text-[8px] font-semibold">JUL</span>
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold">{t('hero.mockDeadlineTask')}</div>
                      <div className="mt-0.5 font-mono text-[12px] text-[var(--warning)]">
                        {t('hero.mockDeadlineWhen')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2.5 text-[13px] text-muted-foreground">
                    <span>{t('hero.mockBilled')}</span>
                    <span className="font-mono font-semibold text-foreground tabular-nums">
                      5.936,00 €
                    </span>
                  </div>
                </div>
              </div>
            </MockWindow>
          </motion.div>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <section className="border-y bg-[var(--surface-2)]/50">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-7">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            {t('trust.heading')}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[13px] font-semibold text-muted-foreground">
            {(
              [
                [Landmark, 'AEAT'],
                [Landmark, 'DGII'],
                [FileCheck2, 'Verifactu'],
                [FileCheck2, 'e-CF'],
                [CreditCard, 'Stripe'],
                [ShieldCheck, 'RGPD · Ley 172-13'],
              ] as [LucideIcon, string][]
            ).map(([Icon, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5 opacity-80">
                <Icon className="size-4" /> {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Diferenciador fiscal (el foso) ── */}
      <section id="cumplimiento" className="scroll-mt-20 border-b bg-[var(--surface-2)]/40">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <Reveal>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--seal-line)] bg-[var(--seal-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--seal-strong)]">
                <ShieldCheck className="size-3.5" /> {t('diff.badge')}
              </span>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                {t('diff.title')}
              </h2>
              <p className="mt-3.5 text-pretty text-[15px] leading-relaxed text-muted-foreground">
                {t('diff.body')}
              </p>
            </Reveal>
            <Reveal delay={0.05}>
              <MockWindow url={t('diff.invoiceUrl')}>
                <div className="grid gap-4 p-4">
                  <div className="flex flex-col gap-2.5">
                    <MockRow>
                      <span>{t('diff.lineFees')}</span>
                      <span className="font-mono tabular-nums">1.700,00 €</span>
                    </MockRow>
                    <MockRow>
                      <span>{t('diff.lineTax')}</span>
                      <span className="font-mono tabular-nums">102,00 €</span>
                    </MockRow>
                    <MockRow>
                      <span className="font-semibold">{t('diff.lineTotal')}</span>
                      <span className="font-mono font-semibold tabular-nums">1.802,00 €</span>
                    </MockRow>
                  </div>
                  <ComplianceSeal regime="verifactu" />
                </div>
              </MockWindow>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Producto ── */}
      <section id="producto" className="scroll-mt-20 mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <Reveal className="mx-auto max-w-[60ch] text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('product.title')}
          </h2>
          <p className="mt-3.5 text-[15px] leading-relaxed text-muted-foreground">
            {t('product.subtitle')}
          </p>
        </Reveal>

        <div className="mt-10 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b, i) => {
            const Icon = BENEFIT_ICONS[i];
            return (
              <Reveal key={b.title} delay={(i % 3) * 0.05}>
                <div className="h-full rounded-xl border bg-card p-5 shadow-[var(--shadow-xs)] transition-shadow [transition-duration:var(--dur-base)] [transition-timing-function:var(--ease-standard)] hover:shadow-[var(--shadow-md)]">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-3.5 text-[15px] font-semibold">{b.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {b.body}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* Banda de métricas */}
        <Reveal className="mt-10 grid gap-3.5 sm:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.label} className="px-2 py-2 text-center">
              <div className="text-[34px] font-semibold tabular-nums tracking-tight text-[var(--brand)]">
                {m.value}
              </div>
              <div className="mt-1 text-[14px] text-muted-foreground">{m.label}</div>
            </div>
          ))}
        </Reveal>

        {/* Showcase: cobro y caja */}
        <div className="mt-14 grid items-center gap-8 md:grid-cols-2">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-line)] bg-[var(--brand-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--brand)]">
              <CreditCard className="size-3.5" /> {t('product.showcase.badge')}
            </span>
            <h3 className="mt-2.5 text-xl font-semibold tracking-tight">
              {t('product.showcase.title')}
            </h3>
            <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
              {t('product.showcase.body')}
            </p>
            <ul className="mt-4 flex flex-col gap-2.5 text-[14px]">
              {bullets.map((b) => (
                <li key={b} className="flex items-center gap-2.5">
                  <Check className="size-4 text-[var(--success)]" /> {b}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.05}>
            <MockWindow url={t('product.showcase.mockUrl')}>
              <div className="flex flex-col gap-2.5 p-4">
                <div>
                  <div className="text-[12px] text-muted-foreground">
                    {t('product.showcase.mockPending')}
                  </div>
                  <div className="font-mono text-[30px] font-semibold tracking-tight tabular-nums">
                    870,00 €
                  </div>
                </div>
                <MockRow>
                  <span>
                    <b className="font-semibold">{t('product.showcase.mockProvision')}</b>
                    <br />
                    <span className="text-[12px] text-muted-foreground">
                      {t('product.showcase.mockProvisionWhen')}
                    </span>
                  </span>
                  <Badge variant="warning">{t('product.showcase.mockProvisionState')}</Badge>
                </MockRow>
                <MockRow>
                  <span>
                    <b className="font-semibold">{t('product.showcase.mockCard')}</b>
                    <br />
                    <span className="font-mono text-[12px] text-muted-foreground">
                      {t('product.showcase.mockCardRef')}
                    </span>
                  </span>
                  <Badge variant="success">{t('product.showcase.mockCardState')}</Badge>
                </MockRow>
                {/* Visual ilustrativo del mock: NO es un control real (la landing no cobra). */}
                <div
                  aria-hidden
                  className="mt-0.5 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground"
                >
                  <Link2 className="size-4" /> {t('product.showcase.mockCta')}
                </div>
              </div>
            </MockWindow>
          </Reveal>
        </div>
      </section>

      {/* ── Seguridad ── */}
      <section id="confianza" className="scroll-mt-20 border-y bg-[var(--surface-2)]/40">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <Reveal className="mx-auto max-w-[60ch] text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-line)] bg-[var(--brand-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--brand)]">
              <Lock className="size-3.5" /> {t('security.badge')}
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('security.title')}
            </h2>
            <p className="mt-3.5 text-[15px] leading-relaxed text-muted-foreground">
              {t('security.subtitle')}
            </p>
          </Reveal>
          <div className="mt-10 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {security.map((s, i) => {
              const Icon = SECURITY_ICONS[i];
              return (
                <Reveal key={s.title} delay={(i % 4) * 0.04}>
                  <div className="flex h-full items-start gap-3 rounded-xl border bg-card p-[18px] shadow-[var(--shadow-xs)]">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
                      <Icon className="size-[18px]" />
                    </span>
                    <div>
                      <h3 className="text-[14px] font-semibold">{s.title}</h3>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                        {s.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Testimonio (ilustrativo) ── */}
      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <Reveal className="mx-auto max-w-[760px] text-center">
          <div className="font-mono text-[40px] leading-none text-[var(--seal)]">“</div>
          <blockquote className="text-balance text-xl font-medium leading-[1.4] tracking-tight sm:text-[26px]">
            {t('quote.text')}
          </blockquote>
          <div className="mt-6 flex items-center justify-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--brand-soft)] font-semibold text-[var(--brand)]">
              MG
            </span>
            <div className="text-left">
              <div className="text-[14px] font-semibold">{t('quote.name')}</div>
              <div className="text-[12px] text-muted-foreground">{t('quote.role')}</div>
            </div>
          </div>
          <span className="mt-4 inline-block font-mono text-[10.5px] text-[var(--text-subtle)] opacity-80">
            {t('quote.flag')}
          </span>
        </Reveal>
      </section>

      {/* ── Precios ── */}
      <section id="precios" className="scroll-mt-20 border-t bg-[var(--surface-2)]/40">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <Reveal className="mx-auto max-w-[60ch] text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('pricing.title')}
            </h2>
            <p className="mt-3.5 text-[15px] leading-relaxed text-muted-foreground">
              {t('pricing.subtitle')}
            </p>
          </Reveal>
          <Reveal delay={0.05} className="mx-auto mt-9 max-w-sm">
            <div className="rounded-2xl border border-[var(--brand-line)] bg-card p-7 text-left shadow-[var(--shadow-md)]">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('pricing.tag')}
              </div>
              <div className="mt-2.5 flex items-end gap-2">
                <span className="text-[42px] font-semibold leading-none tracking-tight tabular-nums">
                  {t('pricing.amount')}
                </span>
                <span className="mb-1.5 text-[14px] text-muted-foreground">{t('pricing.per')}</span>
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                {t('pricing.amountNote')}
              </p>

              {/* Tramos por volumen (espejo de la tabla in-app: SEAT_TIERS) */}
              <div className="mt-4 rounded-lg border bg-[var(--surface-1)]">
                <div className="border-b px-3.5 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('pricing.tiersLabel')}
                </div>
                <div className="divide-y text-[13px]">
                  {priceTiers.map((tier) => (
                    <div key={tier.range} className="flex items-center justify-between px-3.5 py-2">
                      <span className="text-muted-foreground">{tier.range}</span>
                      <span className="font-medium tabular-nums">{tier.price}</span>
                    </div>
                  ))}
                </div>
              </div>

              <ul className="mt-[18px] flex flex-col gap-2.5 text-[14px]">
                {features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <Check className="size-4 text-[var(--success)]" /> {f}
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-col gap-1.5 text-[12.5px] text-muted-foreground">
                <span className="flex items-center gap-2">
                  <PiggyBank className="size-3.5 text-[var(--brand)]" /> {t('pricing.annualNote')}
                </span>
                <span className="flex items-center gap-2">
                  <CalendarClock className="size-3.5 text-[var(--brand)]" />{' '}
                  {t('pricing.trialNote')}
                </span>
              </div>

              <Button asChild size="lg" className="mt-5 w-full">
                <Link href="/login">
                  {t('pricing.cta')} <ArrowRight />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section id="contacto" className="scroll-mt-20 mx-auto max-w-5xl px-6 py-6 pb-14">
        <Reveal>
          <div
            className="relative overflow-hidden rounded-2xl px-8 py-14 text-center text-white"
            style={{
              background: 'linear-gradient(150deg, var(--brand-strong), oklch(0.3 0.06 205))',
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-36 -right-24 size-[380px] rounded-full"
              style={{
                background: 'radial-gradient(circle, oklch(0.72 0.13 60 / 0.35), transparent 65%)',
              }}
            />
            <h2 className="relative text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('finalCta.title')}
            </h2>
            <p className="relative mx-auto mt-3 max-w-[48ch] text-[15px] opacity-90">
              {t('finalCta.body')}
            </p>
            <div className="relative mt-6 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-white text-[var(--brand-strong)] hover:bg-white/90"
              >
                <Link href="/login">
                  {t('finalCta.ctaPrimary')} <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/50 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <a href="mailto:hola@lawzora.com">{t('finalCta.ctaSecondary')}</a>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t bg-[var(--surface-2)]/50">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-7 text-[12px] text-muted-foreground sm:flex-row">
          <span>{t('footer.rights')}</span>
          <div className="flex items-center gap-5">
            <Link
              href="/privacy"
              className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('footer.privacy')}
            </Link>
            <Link
              href="/terms"
              className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('footer.terms')}
            </Link>
            <a
              href="mailto:hola@lawzora.com"
              className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('footer.contact')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
