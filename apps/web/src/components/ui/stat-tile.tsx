import { cn } from '@/lib/utils';

/**
 * KPI con jerarquía: etiqueta tenue arriba, VALOR protagonista (numeral tabular), y un apoyo opcional
 * (delta/hint). `emphasis` resalta la métrica estrella de la vista (Von Restorff: una sola por pantalla).
 */
export function StatTile({
  label,
  value,
  hint,
  delta,
  emphasis = false,
  icon,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: { value: React.ReactNode; positive?: boolean };
  emphasis?: boolean;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4 shadow-[var(--shadow-xs)]',
        emphasis && 'border-[var(--brand-line)] bg-[var(--brand-soft)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon && <span className="text-[var(--brand)]">{icon}</span>}
      </div>
      <div
        className={cn(
          'mt-1.5 font-semibold tabular-nums tracking-tight',
          emphasis ? 'text-[26px] text-[var(--brand)]' : 'text-[22px]',
        )}
      >
        {value}
      </div>
      {(hint || delta) && (
        <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
          {delta && (
            <span
              className={cn(
                'font-medium',
                delta.positive ? 'text-[var(--success)]' : 'text-[var(--danger)]',
              )}
            >
              {delta.value}
            </span>
          )}
          {hint}
        </div>
      )}
    </div>
  );
}
