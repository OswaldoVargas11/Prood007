import { cn } from '@/lib/utils';

/**
 * Cabecera de sección con jerarquía por PESO+COLOR (no solo tamaño): kicker opcional (uppercase tenue) +
 * título + descripción + slot de acción a la derecha. Un solo patrón para todas las secciones.
 */
export function SectionHeader({
  kicker,
  title,
  description,
  action,
  className,
}: {
  kicker?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {kicker && (
          <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {kicker}
          </div>
        )}
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
