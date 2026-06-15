import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge de estado Lexora: `variant` semántico usa color de texto + fondo translúcido del mismo token
 * (la máquina de estados de cada dominio decide qué variante aplicar).
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground border-[var(--border-strong)]',
        success: 'border-[var(--success)]/20 bg-[var(--success-soft)] text-[var(--success)]',
        warning: 'border-[var(--warning)]/20 bg-[var(--warning-soft)] text-[var(--warning)]',
        info: 'border-[var(--info)]/20 bg-[var(--info-soft)] text-[var(--info)]',
        danger: 'border-[var(--danger)]/20 bg-[var(--danger-soft)] text-[var(--danger)]',
        violet: 'border-[var(--violet)]/20 bg-[var(--violet-soft)] text-[var(--violet)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
