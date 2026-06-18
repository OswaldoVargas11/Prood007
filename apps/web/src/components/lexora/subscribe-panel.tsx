'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, CreditCard, Loader2 } from 'lucide-react';
import { useCheckout, usePortal, useSubscription } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { BadgeProps } from '@/components/ui/badge';
import type { SubscriptionStatusValue, SubscriptionTier } from '@/lib/types';

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
 * Panel de suscripción (modelo POR USUARIO): selector de plazas, precio en vivo con descuento por
 * volumen, y botones Suscribirme (→ Checkout de Stripe) / Gestionar pago (→ portal). Reutilizado en
 * la página /subscription y en el muro. Lee su propio estado (react-query dedupe).
 */
export function SubscribePanel() {
  const t = useTranslations('subscription');
  const { data, isLoading } = useSubscription();
  const checkout = useCheckout();
  const portal = usePortal();
  const [seats, setSeats] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !data) return <Skeleton className="h-72 w-full rounded-xl" />;

  const current = seats ?? Math.max(1, data.seats || data.seatsUsed || 1);
  const price = priceForSeats(data.tiers, current);
  const total = current * price;
  const hasSubscription = data.seats > 0 || data.status === 'ACTIVE' || data.status === 'PAST_DUE';

  async function go(action: 'subscribe' | 'manage') {
    setError(null);
    try {
      const res =
        action === 'subscribe' ? await checkout.mutateAsync(current) : await portal.mutateAsync();
      window.location.href = res.url;
    } catch {
      setError(t('error'));
    }
  }

  return (
    <div className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
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

      {/* Tabla de precios por volumen */}
      <div className="rounded-lg border">
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

      {/* Selector de plazas + total en vivo */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1.5">
          <span className="text-[13px] font-medium">{t('seatsLabel')}</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={current}
            onChange={(e) => setSeats(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
            className="flex h-10 w-28 rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div className="space-y-0.5">
          <div className="text-[13px] text-muted-foreground">{t('total')}</div>
          <div className="text-2xl font-semibold">
            €{total}
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              /{t('month')} · €{price}/{t('perSeat')}
            </span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => go('subscribe')} disabled={checkout.isPending}>
          {checkout.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          {hasSubscription ? t('changePlan') : t('subscribe')}
        </Button>
        {hasSubscription && (
          <Button variant="outline" onClick={() => go('manage')} disabled={portal.isPending}>
            {portal.isPending ? <Loader2 className="animate-spin" /> : <CreditCard />}
            {t('manage')}
          </Button>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">{t('allFeatures')}</p>
    </div>
  );
}
