import { cn } from '@/lib/utils';

/**
 * Placeholder de carga. Sobre el tono base corre una banda de brillo (shimmer) que sugiere actividad
 * con más vida que un simple pulse. El shimmer se anula solo con `prefers-reduced-motion` (ver globals).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative isolate overflow-hidden rounded-md bg-[var(--surface-3)]',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer',
        'before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent',
        'motion-reduce:before:hidden',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
