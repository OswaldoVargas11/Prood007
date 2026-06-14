'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { NAV_ITEMS } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** Sidebar flotante (aside translúcido con blur). Item activo: fondo brand + barra de 3px. */
export function AppSidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur-xl lg:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--ai-from)] to-[var(--ai-to)]">
          <div className="size-2.5 rotate-45 rounded-[3px] border-2 border-white" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Lexora</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
              {t(item.key)}
              {!item.enabled && (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/60">
                  {t('soon')}
                </span>
              )}
            </span>
          );

          return item.enabled ? (
            <Link key={item.key} href={item.href} aria-current={active ? 'page' : undefined}>
              {content}
            </Link>
          ) : (
            <div key={item.key} aria-disabled>
              {content}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
