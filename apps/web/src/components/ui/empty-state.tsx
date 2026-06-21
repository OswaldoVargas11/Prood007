import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Estado vacío DIDÁCTICO: icono + qué es + (opcional) una acción primaria. Sustituye los textos grises
 * sueltos. Pensado para "enseñar" en la primera vez (qué verás aquí + cómo empezar).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      {Icon && (
        <span
          aria-hidden
          className="mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"
        >
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-[14px] font-semibold">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
