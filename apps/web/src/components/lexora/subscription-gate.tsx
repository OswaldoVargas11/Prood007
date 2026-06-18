'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useSubscription } from '@/lib/hooks';
import { TrialBanner } from './trial-banner';
import { SubscribePanel } from './subscribe-panel';

/**
 * Envuelve la app del despacho: si la suscripción no da acceso (prueba caducada / suspendido / etc.)
 * muestra el MURO (pantalla de suscripción) en vez de la app; si está en prueba, muestra el banner.
 * Fail-open mientras carga (el backend ya aplica el muro con 402; esto es solo la UX).
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const t = useTranslations('subscription');
  const { data, isLoading } = useSubscription();

  if (isLoading || !data) return <>{children}</>;

  if (!data.hasAccess) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('wallTitle')}</h1>
          <p className="text-muted-foreground">{t('wallSubtitle')}</p>
        </div>
        <SubscribePanel />
      </div>
    );
  }

  return (
    <>
      {data.status === 'TRIALING' && data.trialDaysLeft != null && (
        <TrialBanner daysLeft={data.trialDaysLeft} />
      )}
      {children}
    </>
  );
}
