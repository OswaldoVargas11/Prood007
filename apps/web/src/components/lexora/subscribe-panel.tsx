'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, CreditCard, Crown, Loader2 } from 'lucide-react';
import { useCheckout, usePortal, useSubscription } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { BadgeProps } from '@/components/ui/badge';
import type { BillingCycle, SubscriptionStatusValue, SubscriptionTier } from '@/lib/types';

function priceForSeats(tiers: SubscriptionTier[], seats: number): number {
  for (const t of tiers) if (t.upTo === null || seats <= t.upTo) return t.pricePerSeatEur;
  return tiers.length ? tiers[tiers.length - 1]!.pricePerSeatEur : 0;
}

function statusVariant(s: SubscriptionStatusValue): NonNullable<BadgeProps['variant']> {
  switch (s) {
    case 'ACTIVE':
      return 'success';
    case 'TRIALING':
      return 'info';
    case 'PAST_DUE':
      return 'warning';
    default:
      return 'danger';
  }
}

/**
 * Panel de suscripción (modelo POR USUARIO) presentado como CARTAS. Selector de plazas (input que se
 * puede vaciar y normaliza al salir), toggle mensual/anual (2 meses gratis), carta Profesional y carta
 * Fundador (precio por plaza bloqueado de por vida, mientras quede cupo). Suscribirme → Checkout de
 * Stripe; Gestionar pago → portal. Reutilizado en /subscription y en el muro de fin de prueba.
 */
export function SubscribePanel() {
  const t = useTranslations('subscription');
  const { data, isLoading } = useSubscription();
  const checkout = useCheckout();
  const portal = usePortal();
  // El input se gobierna como STRING para permitir borrarlo (vacío) mientras se escribe; se normaliza
  // a un nº válido al perder el foco. `null` = aún no tocado (usa las plazas de referencia del backend).
  const [seatsInput, setSeatsInput] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Skeleton className="h-96 w-full rounded-xl" />;

  const refSeats = Math.max(1, data.seats || data.seatsUsed || 1);
  const current =
    seatsInput === null ? refSeats : Math.max(1, Math.min(1000, Number(seatsInput) || 1));
  const pricePerSeat = priceForSeats(data.tiers, current);
  const monthlyTotal = current * pricePerSeat;
  const annualTotal = monthlyTotal * (12 - data.annualFreeMonths); // 2 meses gratis
  const cycleTotal = cycle === 'ANNUAL' ? annualTotal : monthlyTotal;
  const annualSavings = monthlyTotal * 12 - annualTotal;

  const hasSubscription = data.seats > 0 || data.status === 'ACTIVE' || data.status === 'PAST_DUE';
  const founderAvailable = !data.isFounder && data.founderSlotsLeft > 0;

  const proBenefits = t.raw('proBenefits') as string[];
  const founderBenefits = t.raw('founderBenefits') as string[];

  async function go(action: 'subscribe' | 'manage', founder = false) {
    setError(null);
    try {
      const res =
        action === 'subscribe'
          ? await checkout.mutateAsync({ seats: current, cycle, founder })
          : await portal.mutateAsync();
      window.location.href = res.url;
    } catch {
      setError(t('error'));
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecera + estado */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Badge variant={statusVariant(data.status)}>{t(`statuses.${data.status}`)}</Badge>
      </div>

      {data.status === 'TRIALING' && data.trialDaysLeft != null && (
        <p className="text-sm">
          {t('trialLeft', { days: data.trialDaysLeft })} ·{' '}
          {t('seatsUsed', { used: data.seatsUsed })}
        </p>
      )}
      {data.isFounder && data.founderNumber != null && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--brand)]">
          <Crown className="size-4" /> {t('founderActive', { n: data.founderNumber })}
        </p>
      )}

      {/* Controles compartidos: plazas + ciclo */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4">
        <label className="space-y-1.5">
          <span className="text-[13px] font-medium">{t('seatsLabel')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={seatsInput ?? String(refSeats)}
            onChange={(e) => setSeatsInput(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => setSeatsInput(String(current))}
            className="flex h-10 w-28 rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {/* Toggle de ciclo */}
        <div className="inline-flex rounded-lg border bg-[var(--surface-1)] p-1 text-sm">
          <button
            type="button"
            onClick={() => setCycle('MONTHLY')}
            className={`rounded-md px-3 py-1.5 font-medium transition ${cycle === 'MONTHLY' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            {t('cycleMonthly')}
          </button>
          <button
            type="button"
            onClick={() => setCycle('ANNUAL')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${cycle === 'ANNUAL' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            {t('cycleAnnual')}
            <span className="rounded bg-[var(--brand-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand)]">
              {t('annualBadge', { months: data.annualFreeMonths })}
            </span>
          </button>
        </div>
      </div>

      {/* Cartas de plan */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Profesional */}
        <PlanCard
          icon={<Check className="size-4" />}
          name={t('planPro')}
          description={t('planProDesc')}
          pricePerSeat={pricePerSeat}
          cycle={cycle}
          total={cycleTotal}
          annualSavings={cycle === 'ANNUAL' ? annualSavings : 0}
          perSeatLabel={t('perSeat')}
          monthLabel={t('month')}
          yearLabel={t('year')}
          saveLabel={t('annualSave', { amount: annualSavings })}
          equivLabel={t('annualEquiv', { amount: Math.round(annualTotal / 12) })}
          benefits={proBenefits}
          cta={
            <Button
              className="w-full"
              onClick={() => go('subscribe', false)}
              disabled={checkout.isPending}
            >
              {checkout.isPending ? <Loader2 className="animate-spin" /> : null}
              {hasSubscription ? t('changePlan') : t('subscribe')}
            </Button>
          }
        />

        {/* Fundador (solo si queda cupo y no lo es ya) */}
        {founderAvailable ? (
          <PlanCard
            highlighted
            icon={<Crown className="size-4" />}
            name={t('planFounder')}
            description={t('planFounderDesc')}
            badge={t('founderSlots', { n: data.founderSlotsLeft, cap: data.founderCap })}
            pricePerSeat={pricePerSeat}
            cycle={cycle}
            total={cycleTotal}
            annualSavings={cycle === 'ANNUAL' ? annualSavings : 0}
            perSeatLabel={t('perSeat')}
            monthLabel={t('month')}
            yearLabel={t('year')}
            saveLabel={t('annualSave', { amount: annualSavings })}
            equivLabel={t('annualEquiv', { amount: Math.round(annualTotal / 12) })}
            benefits={founderBenefits}
            footnote={t('founderLockNote')}
            cta={
              <Button
                className="w-full"
                onClick={() => go('subscribe', true)}
                disabled={checkout.isPending}
              >
                {checkout.isPending ? <Loader2 className="animate-spin" /> : <Crown />}
                {t('chooseFounder')}
              </Button>
            }
          />
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed bg-card/50 p-6 text-center text-sm text-muted-foreground">
            {data.isFounder ? t('founderYours') : t('founderClosed')}
          </div>
        )}
      </div>

      {/* Tabla de tramos por volumen (referencia) */}
      <div className="rounded-xl border">
        <div className="border-b px-4 py-2 text-[13px] font-semibold">{t('priceTable')}</div>
        <div className="divide-y text-sm">
          {data.tiers.map((tier, i) => {
            const from = i === 0 ? 1 : (data.tiers[i - 1]!.upTo ?? 0) + 1;
            const label = tier.upTo ? `${from}–${tier.upTo}` : `${from}+`;
            const active = current >= from && (tier.upTo === null || current <= tier.upTo);
            return (
              <div
                key={i}
                className={`flex items-center justify-between px-4 py-2 ${active ? 'bg-[var(--brand-soft)] font-medium text-[var(--brand)]' : ''}`}
              >
                <span>{t('seatsRange', { range: label })}</span>
                <span>
                  €{tier.pricePerSeatEur}/{t('perSeat')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {hasSubscription && (
        <Button variant="outline" onClick={() => go('manage')} disabled={portal.isPending}>
          {portal.isPending ? <Loader2 className="animate-spin" /> : <CreditCard />}
          {t('manage')}
        </Button>
      )}
    </div>
  );
}

interface PlanCardProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  badge?: string;
  highlighted?: boolean;
  pricePerSeat: number;
  cycle: BillingCycle;
  total: number;
  annualSavings: number;
  perSeatLabel: string;
  monthLabel: string;
  yearLabel: string;
  saveLabel: string;
  equivLabel: string;
  benefits: string[];
  footnote?: string;
  cta: React.ReactNode;
}

function PlanCard(props: PlanCardProps) {
  const annual = props.cycle === 'ANNUAL';
  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm ${props.highlighted ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[var(--brand)]">{props.icon}</span>
          <h3 className="font-semibold">{props.name}</h3>
        </div>
        {props.badge && (
          <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--brand)]">
            {props.badge}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{props.description}</p>

      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold">€{props.total}</span>
          <span className="text-sm text-muted-foreground">
            /{annual ? props.yearLabel : props.monthLabel}
          </span>
        </div>
        <div className="text-[13px] text-muted-foreground">
          €{props.pricePerSeat}/{props.perSeatLabel} · {annual ? props.equivLabel : ''}
        </div>
        {annual && props.annualSavings > 0 && (
          <div className="mt-1 text-[13px] font-medium text-[var(--success)]">
            {props.saveLabel}
          </div>
        )}
      </div>

      <ul className="space-y-2 text-sm">
        {props.benefits.map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {props.footnote && <p className="text-[12px] text-muted-foreground">{props.footnote}</p>}

      <div className="mt-auto">{props.cta}</div>
    </div>
  );
}
