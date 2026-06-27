'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Command, Menu, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/i18n/navigation';
import { AppSidebar, MobileSidebar } from './app-sidebar';
import { PageTransition } from './page-transition';
import { CommandMenu, useCommandMenu } from './command-menu';
import { QuickAdd } from './quick-add';
import { AiPanel } from './ai-panel';
import { NotificationsBell } from './notifications-bell';
import { RealtimeToasts } from './realtime-toasts';
import { MessagingDock } from './messaging-dock';
import { AiAgentDock } from './ai-agent-dock';
import { ForcePasswordChange } from './force-password-change';
import { ConfirmEmail } from './confirm-email';
import { FirmBadge } from './firm-badge';
import { WhatsNewDialog } from './whats-new-dialog';
import { UserMenu } from './user-menu';
import { ThemeToggle } from './theme-toggle';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';

function isStaff(roles: string[]): boolean {
  return roles.includes('FIRM_ADMIN') || roles.includes('LAWYER');
}

/**
 * Shell del despacho (staff). Guard de cliente:
 *  - sin sesión → /login (el middleware ya hace el gate grueso; esto cubre expiración en cliente).
 *  - rol CLIENT sin rol de staff → /portal (su superficie de solo lectura, slice F6).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { user, loading } = useAuth();
  const router = useRouter();
  const { open, setOpen } = useCommandMenu();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (!isStaff(user.roles)) {
      router.replace('/portal');
    }
  }, [loading, user, router]);

  if (loading || !user || !isStaff(user.roles)) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-[236px] border-r border-border bg-card/60 lg:block" />
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-48" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </div>
      </div>
    );
  }

  // Bloqueo anti-bots: el email debe estar confirmado antes de operar.
  if (user.emailVerified === false) {
    return <ConfirmEmail />;
  }

  // Bloqueo: cuenta creada por admin / tras reset → debe fijar su contraseña antes de operar.
  if (user.mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-[var(--shadow-md)] focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t('nav.skipToContent')}
      </a>
      <AppSidebar />
      <MobileSidebar open={navOpen} onOpenChange={setNavOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-5 backdrop-blur-xl">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t('nav.openMenu')}
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={() => setOpen(true)}
          >
            <Search className="size-4" />
            <span className="hidden sm:inline">{t('command.placeholder')}</span>
            <kbd className="ml-2 hidden items-center gap-0.5 rounded border border-border px-1.5 text-[10px] sm:inline-flex">
              <Command className="size-2.5" />K
            </kbd>
          </Button>
          <QuickAdd />
          <FirmBadge />
          <div className="ml-auto flex items-center gap-2">
            <AiPanel />
            <NotificationsBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <PageTransition id="main" className="flex-1 p-6 lg:p-8">
          {children}
        </PageTransition>
      </div>
      <CommandMenu open={open} onOpenChange={setOpen} />
      <Toaster />
      <RealtimeToasts />
      <MessagingDock />
      <AiAgentDock />
      <WhatsNewDialog />
    </div>
  );
}
