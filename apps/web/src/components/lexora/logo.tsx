import { cn } from '@/lib/utils';

/**
 * Marca Lawzora: isotipo (monograma L + tick de verificación cobre sobre tile teal) + wordmark.
 * El isotipo lleva su propio degradado, así que se ve igual en claro/oscuro. El wordmark usa
 * `--font-wordmark` (Geist Semibold, tracking ceñido). `markOnly` para favicons/colapsado.
 */
export function Logo({
  size = 26,
  markOnly = false,
  className,
}: {
  size?: number;
  markOnly?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      {!markOnly && (
        <span
          className="font-semibold text-foreground"
          style={{
            fontFamily: 'var(--font-wordmark)',
            fontSize: size * 0.66,
            letterSpacing: '-0.03em',
          }}
        >
          Lawzora
        </span>
      )}
    </span>
  );
}

/** Solo el isotipo (tile teal + L + tick cobre). Degradado propio: idéntico en claro/oscuro. */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Lawzora"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id="lz-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.55 0.092 200)" />
          <stop offset="1" stopColor="oklch(0.43 0.09 201)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#lz-tile)" />
      <path
        d="M11.5 8 V20.5 H18.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.6 18.7 L19.5 21.6 L23.8 15.4"
        fill="none"
        stroke="oklch(0.72 0.13 60)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
