import { cn } from '@/lib/utils';

/** Tecla/atajo (hint de teclado): hace descubribles ⌘K, quick-add, etc. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-[var(--surface-2)] px-1.5 font-mono text-[10.5px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
