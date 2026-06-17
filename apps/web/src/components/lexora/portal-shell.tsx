'use client';

import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter, Link } from '@/i18n/navigation';
import { NotificationsBell } from './notifications-bell';
import { RealtimeToasts } from './realtime-toasts';
import { PageTransition } from './page-transition';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';

/**
 * Shell del Portal del cliente: superficie más calmada (sin sidebar del despacho). Guard de sesión.
 * El gate de rol (solo CLIENT) lo hace el middleware de servidor; aquí solo exigimos sesión.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-5 backdrop-blur-xl">
        <Link href="/portal" className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--ai-from)] to-[var(--ai-to)]">
            <div className="size-2.5 rotate-45 rounded-[3px] border-2 border-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Lexora</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <NotificationsBell />
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <PageTransition className="mx-auto max-w-4xl p-6 lg:p-8">{children}</PageTransition>
      <Toaster />
      <RealtimeToasts />
    </div>
  );
}
