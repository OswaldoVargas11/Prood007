'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth';
import { useRouter, Link } from '@/i18n/navigation';
import { NotificationsBell } from './notifications-bell';
import { RealtimeToasts } from './realtime-toasts';
import { ForcePasswordChange } from './force-password-change';
import { ConfirmEmail } from './confirm-email';
import { PageTransition } from './page-transition';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { Logo } from './logo';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';

/**
 * Shell del Portal del cliente: superficie más calmada (sin sidebar del despacho). Guard de sesión.
 * El gate de rol (solo CLIENT) lo hace el middleware de servidor; aquí solo exigimos sesión.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('nav');

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

  if (user.emailVerified === false) {
    return <ConfirmEmail />;
  }

  if (user.mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-[var(--shadow-md)] focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t('skipToContent')}
      </a>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-5 backdrop-blur-xl">
        <Link href="/portal" className="flex items-center">
          <Logo size={24} />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <NotificationsBell />
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <PageTransition id="main" className="mx-auto max-w-4xl p-6 lg:p-8">
        {children}
      </PageTransition>
      <Toaster />
      <RealtimeToasts />
    </div>
  );
}
