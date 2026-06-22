'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Check, Crown } from 'lucide-react';
import { Currency, FOUNDER, PLAN_TIERS, buildPlanCatalog, type PlanCycle } from '@legalflow/domain';
import { useFounderStatus } from '@/lib/hooks';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

const CYCLES: PlanCycle[] = ['MONTHLY', 'ANNUAL', 'BIENNIAL'];

function eur(amount: number): string {
  return new Intl.NumberFormat('es', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Sección de precios de la LANDING. Lee del catálogo canónico (`@legalflow/domain`) — cero precios
 * duplicados. Toggle Mensual/Anual/Bienal con ahorro, 3 tiers (Profesional destacado) y bloque Fundador
 * con cupo restante (endpoint público). En EUR (mercado por defecto).
 */
export function LandingPricing() {
  const t = useTranslations('landing.pricing');
  const [cycle, setCycle] = useState<PlanCycle>('ANNUAL');
  const founder = useFounderStatus();
  // Catálogo resuelto en EUR (la landing por defecto muestra precios de ES).
  const catalog = buildPlanCatalog({}, [Currency.EUR]);
  const rowFor = (plan: string) => catalog.find((r) => r.plan === plan && r.cycle === cycle);
  const slotsLeft = founder.data?.slotsLeft ?? null;
  const founderRow = catalog.find(
    (r) => r.plan === 'FOUNDER' && r.cycle === (cycle === 'MONTHLY' ? 'ANNUAL' : cycle),
  );

  return (
    <section id="precios" className="scroll-mt-20 border-t bg-[var(--surface-2)]/40">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-[60ch] text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h2>
          <p className="mt-3.5 text-[15px] leading-relaxed text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        {/* Toggle de ciclo */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-lg border bg-[var(--surface-1)] p-1 text-sm">
            {CYCLES.map((c) => {
              const save =
                catalog.find((r) => r.plan === 'PROFESIONAL' && r.cycle === c)?.savingsPct ?? 0;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition ${cycle === c ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                >
                  {t(`cycle.${c}`)}
                  {save > 0 && (
                    <span className="rounded bg-[var(--brand-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand)]">
                      −{save}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tiers */}
        <div className="mx-auto mt-9 grid max-w-5xl gap-5 md:grid-cols-3">
          {PLAN_TIERS.map((tier) => {
            const row = rowFor(tier.id);
            if (!row) return null;
            return (
              <div
                key={tier.id}
                className={`flex flex-col rounded-2xl border bg-card p-7 text-left shadow-[var(--shadow-md)] ${tier.popular ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]' : 'border-[var(--brand-line)]'}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{t(`tier.${tier.id}`)}</h3>
                  {tier.popular && (
                    <span className="rounded-full bg-[var(--brand)] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                      {t('mostPopular')}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  {t(`tierDesc.${tier.id}`)}
                </p>
                <div className="mt-4 flex items-end gap-1.5">
                  <span className="text-[38px] font-semibold leading-none tracking-tight tabular-nums">
                    {eur(row.perSeatMonthly)}
                  </span>
                  <span className="mb-1 text-[13px] text-muted-foreground">
                    {t('perSeatMonth')}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {cycle === 'MONTHLY'
                    ? t('billedMonthly')
                    : t('billedCycle', { total: eur(row.perSeatPeriod), per: t(`per.${cycle}`) })}
                </p>
                <ul className="mt-4 flex flex-1 flex-col gap-2 text-[13.5px]">
                  {(t.raw(`tierBenefits.${tier.id}`) as string[]).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-[var(--success)]" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  size="lg"
                  variant={tier.popular ? 'default' : 'outline'}
                  className="mt-6 w-full"
                >
                  <Link href="/login">
                    {t('cta')} <ArrowRight />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>

        {/* Bloque Fundador */}
        {(slotsLeft === null || slotsLeft > 0) && founderRow && (
          <div className="mx-auto mt-6 max-w-5xl rounded-2xl border border-[var(--brand)] bg-[var(--brand-soft)]/30 p-6 ring-1 ring-[var(--brand)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Crown className="size-5 text-[var(--brand)]" />
                <h3 className="text-lg font-semibold">{t('founder.title')}</h3>
                {slotsLeft !== null && (
                  <span className="rounded-full bg-[var(--brand)] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    {t('founder.slots', { n: slotsLeft, cap: founder.data?.cap ?? FOUNDER.cap })}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-2xl font-semibold tabular-nums">
                  {eur(founderRow.perSeatMonthly)}
                </span>
                <span className="ml-1 text-[13px] text-muted-foreground">{t('perSeatMonth')}</span>
              </div>
            </div>
            <p className="mt-2 text-[13.5px] text-muted-foreground">{t('founder.desc')}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{t('founder.lockNote')}</p>
            <Button asChild className="mt-4">
              <Link href="/login">
                {t('founder.cta')} <ArrowRight />
              </Link>
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-[12.5px] text-muted-foreground">{t('trialNote')}</p>
      </div>
    </section>
  );
}
