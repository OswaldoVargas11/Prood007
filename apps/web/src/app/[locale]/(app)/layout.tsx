import type { ReactNode } from 'react';
import { AppShell } from '@/components/lexora/app-shell';

/** Layout del despacho (staff): envuelve todo en el shell con guard de sesión/rol. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
