'use client';

import { useTranslations } from 'next-intl';
import { SubscribePanel } from '@/components/lexora/subscribe-panel';

/** Página de suscripción del despacho: planes por plaza, precio en vivo y gestión del pago. */
export default function SubscriptionPage() {
  const t = useTranslations('subscription');
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{t('pageSubtitle')}</p>
      </div>
      <SubscribePanel />
    </div>
  );
}
