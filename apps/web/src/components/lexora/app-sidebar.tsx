'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Lock } from 'lucide-react';
import { NAV_GROUPS, type NavItem } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Logo } from '@/components/lexora/logo';

/** Marca (logo + nombre), reutilizada por el sidebar de escritorio y el Drawer móvil. */
function Brand() {
  return (
    <div className="flex h-14 items-center px-5">
      <Logo size={24} />
    </div>
  );
}

/** Contenido de navegación (grupos + items), compartido por escritorio y móvil. */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole('FIRM_ADMIN');
  const entitlements = user?.tenant?.entitlements;
  // Bloqueada = la sección requiere una función que el plan no incluye (entitlements undefined ⇒ permisivo).
  const isLocked = (item: NavItem) =>
    Boolean(item.feature && entitlements && entitlements[item.feature] === false);

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
      {NAV_GROUPS.map((group) => {
        // El grupo «Despacho» mezcla items para todo el staff (Agenda) y solo-admin; filtramos.
        const items = group.items.filter((i) => !i.adminOnly || isAdmin);
        if (items.length === 0) return null;
        return (
          <div key={group.key} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1 pt-3.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              {t(`groups.${group.key}`)}
            </div>
            {items.map((item) => (
              <SidebarItem
                key={item.key}
                item={item}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                label={t(item.key)}
                soon={t('soon')}
                locked={isLocked(item)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}

/** Sidebar flotante de escritorio (aside translúcido). Oculto por debajo de `lg` (ver `MobileSidebar`). */
export function AppSidebar() {
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur-xl lg:flex">
      <Brand />
      <SidebarNav />
    </aside>
  );
}

/**
 * Navegación móvil: en anchos pequeños (donde el sidebar fijo está oculto) la navegación se ofrece
 * en un Drawer lateral. Se controla desde el AppShell (botón hamburguesa) y se cierra al navegar.
 */
export function MobileSidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[270px] flex-col bg-card/95 p-0 backdrop-blur-xl lg:hidden"
      >
        <SheetTitle className="sr-only">Lawzora</SheetTitle>
        <SheetDescription className="sr-only">Navegación principal del despacho</SheetDescription>
        <Brand />
        <SidebarNav onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function SidebarItem({
  item,
  active,
  label,
  soon,
  locked,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  label: string;
  soon: string;
  locked?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const content = (
    <span
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
          : item.enabled
            ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
            : 'cursor-not-allowed text-muted-foreground/50',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--brand)]" />
      )}
      <Icon className="size-4 shrink-0" />
      {label}
      {locked && <Lock className="ml-auto size-3.5 text-muted-foreground/60" aria-hidden />}
      {!item.enabled && !locked && (
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/60">
          {soon}
        </span>
      )}
    </span>
  );

  if (!item.enabled) return <div aria-disabled>{content}</div>;

  // Bloqueada por plan: enlaza a la pantalla de planes (upsell) en vez de a la sección.
  const href = locked ? '/subscription' : item.href;
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
      {content}
    </Link>
  );
}
