'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, CalendarX, CreditCard, Crown, Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  useCancelSubscription,
  useChangeSeats,
  useCheckout,
  usePortal,
  useResumeSubscription,
  useSubscription,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { ConfirmDialog } from '@/components/lexora/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { BadgeProps } from '@/components/ui/badge';
import type {
  BillingCycle,
  PlanKey,
  PlanPriceRow,
  SubscriptionInfo,
  SubscriptionStatusValue,
  SubscriptionTierId,
} from '@/lib/types';

const CYCLES: BillingCycle[] = ['MONTHLY', 'ANNUAL', 'BIENNIAL'];

function money(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale || 'es', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

function rowFor(
  data: SubscriptionInfo,
  plan: PlanKey,
  cycle: BillingCycle,
): PlanPriceRow | undefined {
  return data.catalog.find((r) => r.plan === plan && r.cycle === cycle);
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
 * Panel de suscripción (3 tiers × 3 ciclos + Fundador), leído del CATÁLOGO del backend. Selector de
 * plazas, toggle Mensual/Anual/Bienal con ahorro, cartas de tier (Profesional destacado) y bloque
 * Fundador (tarifa congelada, solo anual/bienal, mientras quede cupo). Suscribirse → Checkout de Stripe.
 */
export function SubscribePanel() {
  const t = useTranslations('subscription');
  const locale = useLocale();
  const { data, isLoading } = useSubscription();
  const checkout = useCheckout();
  const portal = usePortal();
  const [seatsInput, setSeatsInput] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('ANNUAL');
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Skeleton className="h-96 w-full rounded-xl" />;

  const refSeats = Math.max(1, data.seats || data.seatsUsed || 1);
  const current =
    seatsInput === null ? refSeats : Math.max(1, Math.min(1000, Number(seatsInput) || 1));
  const hasSubscription = data.seats > 0 || data.status === 'ACTIVE' || data.status === 'PAST_DUE';
  const founderAvailable = !data.isFounder && data.founderSlotsLeft > 0;
  // El Fundador exige anual o bienal; si el toggle está en mensual, usamos anual para su carta.
  const founderCycle: BillingCycle = cycle === 'MONTHLY' ? 'ANNUAL' : cycle;

  async function go(
    action: 'subscribe' | 'manage',
    opts?: { tier: SubscriptionTierId; founder: boolean; cycle: BillingCycle },
  ) {
    setError(null);
    try {
      const res =
        action === 'subscribe' && opts
          ? await checkout.mutateAsync({
              seats: current,
              tier: opts.tier,
              cycle: opts.cycle,
              founder: opts.founder,
            })
          : await portal.mutateAsync();
      window.location.href = res.url;
    } catch {
      setError(t('error'));
    }
  }

  const cycleSavings = (c: BillingCycle) => rowFor(data, 'PROFESIONAL', c)?.savingsPct ?? 0;

  return (
    <div className="space-y-6">
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

      {hasSubscription && <ManageSeatsCard data={data} />}

      {/* Controles: plazas + ciclo */}
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

        <div className="inline-flex rounded-lg border bg-[var(--surface-1)] p-1 text-sm">
          {CYCLES.map((c) => {
            const save = cycleSavings(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${cycle === c ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
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

      {/* Cartas de tier */}
      <div className="grid gap-4 md:grid-cols-3">
        {data.tiers.map((tier) => {
          const row = rowFor(data, tier.id, cycle);
          if (!row) return null;
          const total = row.perSeatPeriod * current;
          return (
            <PlanCard
              key={tier.id}
              highlighted={tier.popular}
              badge={tier.popular ? t('mostPopular') : undefined}
              name={t(`tier.${tier.id}`)}
              description={t(`tierDesc.${tier.id}`)}
              total={money(total, data.currency, locale)}
              periodLabel={t(`per.${cycle}`)}
              perSeatLine={t('perSeatMonthly', {
                amount: money(row.perSeatMonthly, data.currency, locale),
              })}
              savings={row.savingsPct > 0 ? t('savePct', { pct: row.savingsPct }) : undefined}
              benefits={t.raw(`tierBenefits.${tier.id}`) as string[]}
              cta={
                <Button
                  className="w-full"
                  variant={tier.popular ? 'default' : 'outline'}
                  onClick={() => go('subscribe', { tier: tier.id, founder: false, cycle })}
                  disabled={checkout.isPending}
                >
                  {checkout.isPending ? <Loader2 className="animate-spin" /> : null}
                  {hasSubscription ? t('changePlan') : t('subscribe')}
                </Button>
              }
            />
          );
        })}
      </div>

      {/* Bloque Fundador */}
      {founderAvailable ? (
        <FounderBlock
          data={data}
          cycle={founderCycle}
          seats={current}
          locale={locale}
          pending={checkout.isPending}
          onChoose={() =>
            go('subscribe', { tier: 'PROFESIONAL', founder: true, cycle: founderCycle })
          }
        />
      ) : (
        <div className="rounded-xl border border-dashed bg-card/50 p-4 text-center text-sm text-muted-foreground">
          {data.isFounder ? t('founderYours') : t('founderClosed')}
        </div>
      )}

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {hasSubscription && (
        <div className="space-y-3 border-t pt-4">
          <Button variant="outline" onClick={() => go('manage')} disabled={portal.isPending}>
            {portal.isPending ? <Loader2 className="animate-spin" /> : <CreditCard />}
            {t('manage')}
          </Button>
          <SubscriptionLifecycle data={data} />
        </div>
      )}
    </div>
  );
}

function FounderBlock({
  data,
  cycle,
  seats,
  locale,
  pending,
  onChoose,
}: {
  data: SubscriptionInfo;
  cycle: BillingCycle;
  seats: number;
  locale: string;
  pending: boolean;
  onChoose: () => void;
}) {
  const t = useTranslations('subscription');
  const row = rowFor(data, 'FOUNDER', cycle);
  const total = row ? money(row.perSeatPeriod * seats, data.currency, locale) : '—';
  return (
    <div className="rounded-xl border border-[var(--brand)] bg-[var(--brand-soft)]/30 p-6 ring-1 ring-[var(--brand)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Crown className="size-5 text-[var(--brand)]" />
          <h3 className="text-lg font-semibold">{t('planFounder')}</h3>
          <span className="rounded-full bg-[var(--brand)] px-2.5 py-0.5 text-[11px] font-semibold text-white">
            {t('founderSlots', { n: data.founderSlotsLeft, cap: data.founderCap })}
          </span>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold">{total}</div>
          <div className="text-[12px] text-muted-foreground">
            {t(`per.${cycle}`)} · {row ? money(row.perSeatMonthly, data.currency, locale) : ''}/
            {t('perSeatMonthShort')}
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t('planFounderDesc')}</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {(t.raw('founderBenefits') as string[]).map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted-foreground">{t('founderLockNote')}</p>
      <Button className="mt-4" onClick={onChoose} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Crown />}
        {t('chooseFounder')}
      </Button>
    </div>
  );
}

/**
 * Baja de la suscripción desde la web (al final del periodo). Si ya hay baja agendada, muestra el aviso
 * "se cancelará el …" y el botón de reanudar; si no, el botón "Cancelar suscripción" con confirmación.
 */
function SubscriptionLifecycle({ data }: { data: SubscriptionInfo }) {
  const t = useTranslations('subscription');
  const locale = useLocale();
  const cancel = useCancelSubscription();
  const resume = useResumeSubscription();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cancelable = data.status === 'ACTIVE' || data.status === 'PAST_DUE';
  const endDate = data.currentPeriodEnd ? formatDate(data.currentPeriodEnd, locale) : null;

  async function doCancel() {
    try {
      await cancel.mutateAsync();
      setConfirmOpen(false);
      toast.success(endDate ? t('cancelScheduledOn', { date: endDate }) : t('cancelScheduled'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('error'));
    }
  }

  async function doResume() {
    try {
      await resume.mutateAsync();
      toast.success(t('resumed'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('error'));
    }
  }

  if (data.cancelAtPeriodEnd) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
          <CalendarX className="mt-0.5 size-4 shrink-0" />
          <span>{endDate ? t('cancelNoticeOn', { date: endDate }) : t('cancelNotice')}</span>
        </p>
        <Button size="sm" variant="outline" onClick={doResume} disabled={resume.isPending}>
          {resume.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          {t('resume')}
        </Button>
      </div>
    );
  }

  if (!cancelable) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="text-[13px] font-medium text-[var(--danger)] hover:underline"
      >
        {t('cancelSubscription')}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('cancelConfirmTitle')}
        description={
          endDate ? t('cancelConfirmBody', { date: endDate }) : t('cancelConfirmBodyNoDate')
        }
        confirmLabel={t('cancelConfirmCta')}
        onConfirm={doCancel}
        loading={cancel.isPending}
      />
    </>
  );
}

/** Ajuste de plazas para un despacho YA suscrito: sube/baja la quantity con prorrateo (preserva el plan). */
function ManageSeatsCard({ data }: { data: SubscriptionInfo }) {
  const t = useTranslations('subscription');
  const locale = useLocale();
  const change = useChangeSeats();
  const min = Math.max(1, data.seatsUsed);
  const [seats, setSeats] = useState(Math.max(min, data.seats || min));
  const dirty = seats !== data.seats;
  // Estimación €/mes del plan actual (informativa); el prorrateo real lo calcula Stripe.
  const monthlyRow =
    rowFor(data, data.plan, 'MONTHLY') ?? data.catalog.find((r) => r.plan === data.plan);
  const monthly = money((monthlyRow?.perSeatMonthly ?? 0) * seats, data.currency, locale);

  async function apply() {
    if (seats < min || seats === data.seats) return;
    try {
      await change.mutateAsync(seats);
      toast.success(t('manageSeats.updated'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('error'));
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t('manageSeats.title')}</h3>
        <span className="text-[12px] text-muted-foreground">
          {t('manageSeats.current', { seats: data.seats, used: data.seatsUsed })}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-md border bg-[var(--surface-1)]">
          <button
            type="button"
            onClick={() => setSeats((s) => Math.max(min, s - 1))}
            disabled={seats <= min}
            className="px-3 py-2 text-muted-foreground disabled:opacity-40"
            aria-label="−"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-10 text-center text-sm font-semibold tabular-nums">{seats}</span>
          <button
            type="button"
            onClick={() => setSeats((s) => Math.min(999, s + 1))}
            className="px-3 py-2 text-muted-foreground"
            aria-label="+"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <span className="text-[13px] text-muted-foreground">
          {t('manageSeats.newTotal', { total: monthly })}
        </span>
        <Button
          size="sm"
          onClick={apply}
          disabled={!dirty || seats < min || change.isPending}
          className="ml-auto"
        >
          {change.isPending ? <Loader2 className="animate-spin" /> : null}
          {t('manageSeats.apply')}
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground">{t('manageSeats.prorationNote')}</p>
      {seats < data.seats && (
        <p className="text-[12px] text-amber-600">{t('manageSeats.decreaseNote')}</p>
      )}
    </div>
  );
}

interface PlanCardProps {
  name: string;
  description: string;
  badge?: string;
  highlighted?: boolean;
  total: string;
  periodLabel: string;
  perSeatLine: string;
  savings?: string;
  benefits: string[];
  cta: React.ReactNode;
}

function PlanCard(props: PlanCardProps) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm ${props.highlighted ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{props.name}</h3>
        {props.badge && (
          <span className="rounded-full bg-[var(--brand)] px-2.5 py-0.5 text-[11px] font-semibold text-white">
            {props.badge}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{props.description}</p>

      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold">{props.total}</span>
          <span className="text-sm text-muted-foreground">/{props.periodLabel}</span>
        </div>
        <div className="text-[13px] text-muted-foreground">{props.perSeatLine}</div>
        {props.savings && (
          <div className="mt-1 text-[13px] font-medium text-[var(--success)]">{props.savings}</div>
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

      <div className="mt-auto">{props.cta}</div>
    </div>
  );
}
