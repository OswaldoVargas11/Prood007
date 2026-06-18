import type { ReactNode } from 'react';
import { AppShell } from '@/components/lexora/app-shell';
import { SubscriptionGate } from '@/components/lexora/subscription-gate';

/** Layout del despacho (staff): shell con guard de sesión/rol + muro/banner de suscripción. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <SubscriptionGate>{children}</SubscriptionGate>
    </AppShell>
  );
}
