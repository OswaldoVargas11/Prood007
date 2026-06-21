import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<Tone, { icon: LucideIcon; bg: string; fg: string; border: string }> = {
  info: { icon: Info, bg: 'var(--info-soft)', fg: 'var(--info)', border: 'var(--info)' },
  success: {
    icon: CheckCircle2,
    bg: 'var(--success-soft)',
    fg: 'var(--success)',
    border: 'var(--success)',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'var(--warning-soft)',
    fg: 'var(--warning)',
    border: 'var(--warning)',
  },
  danger: { icon: XCircle, bg: 'var(--danger-soft)', fg: 'var(--danger)', border: 'var(--danger)' },
};

/**
 * Aviso/nota con tono semántico (usa los tokens `*-soft`). Para errores sigue la pauta H9: el `title`
 * dice QUÉ pasó y `children` POR QUÉ + QUÉ hacer. También vale para info/éxito/advertencia.
 */
export function Callout({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const t = TONE[tone];
  const Icon = icon ?? t.icon;
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
      className={cn('flex gap-2.5 rounded-lg border p-3 text-[12.5px] leading-relaxed', className)}
      style={{ background: t.bg, borderColor: `color-mix(in oklch, ${t.border} 35%, transparent)` }}
    >
      <Icon aria-hidden className="mt-px size-4 shrink-0" style={{ color: t.fg }} />
      <div className="min-w-0">
        {title && <div className="font-semibold text-foreground">{title}</div>}
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
