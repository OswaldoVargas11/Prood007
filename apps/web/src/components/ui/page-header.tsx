import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Cabecera de página unificada del área de despacho: eyebrow (opcional · mono caps) + título + subtítulo
 * + slot de acciones alineado a la derecha. Centraliza el patrón que cada pantalla repetía a mano, para
 * que todas las cabeceras compartan ritmo tipográfico y alineación. El eyebrow va pensado para CONTEXTO
 * útil (p. ej. un contador en vivo), no decoración.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        {eyebrow != null && eyebrow !== '' && (
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-subtle)]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
