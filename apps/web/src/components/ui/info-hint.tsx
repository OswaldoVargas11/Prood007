'use client';

import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Ayuda contextual (capa didáctica): un disparador discreto "i" junto a un término que abre un popover
 * con título + explicación breve (+ opcional "saber más"). Accesible (clic/teclado, funciona en táctil),
 * con moderación. Pensado para el foso fiscal: Verifactu, e-CF, provisión, plazos, rectificativas…
 */
export function InfoHint({
  title,
  children,
  learnMoreHref,
  learnMoreLabel = 'Saber más',
  label = 'Más información',
  className,
}: {
  title?: string;
  children: React.ReactNode;
  learnMoreHref?: string;
  learnMoreLabel?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Info aria-hidden className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="text-[12.5px] leading-relaxed">
        {title && <div className="mb-1 text-[13px] font-semibold text-foreground">{title}</div>}
        <div className="text-muted-foreground">{children}</div>
        {learnMoreHref && (
          <a
            href={learnMoreHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[12px] font-medium text-[var(--brand)] hover:underline"
          >
            {learnMoreLabel} →
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}
