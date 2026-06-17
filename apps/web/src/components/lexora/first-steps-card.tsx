'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  Briefcase,
  Check,
  FileUp,
  Receipt,
  Rocket,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useInvoices, useMatters } from '@/lib/hooks';
import type { DashboardSummary, MatterDocument } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Step {
  key: 'client' | 'matter' | 'document' | 'invoice';
  icon: LucideIcon;
  done: boolean;
  href: string;
}

/**
 * Tarjeta "Primeros pasos" para despachos recién creados. El progreso se deriva de datos REALES
 * (clientes/expedientes desde el resumen del dashboard, facturas y documentos por consulta) y la
 * tarjeta se oculta cuando todo está hecho, así que no estorba a los despachos en marcha.
 */
export function FirstStepsCard({ summary }: { summary: DashboardSummary }) {
  const t = useTranslations('dashboard.firstSteps');

  const hasClients = summary.kpis.totalClients > 0;
  const hasMatters = summary.kpis.totalMatters > 0;

  const invoicesQ = useInvoices();
  const hasInvoices = (invoicesQ.data?.length ?? 0) > 0;

  // Documentos: el backend solo los expone por expediente. Agregamos solo mientras la tarjeta puede
  // estar visible (hay expedientes pero falta algún paso); para despachos nuevos el coste es mínimo.
  const mattersQ = useMatters({ pageSize: 100 });
  const matters = useMemo(() => mattersQ.data?.items ?? [], [mattersQ.data]);
  const docQueries = useQueries({
    queries: matters.map((m) => ({
      queryKey: ['documents', m.id],
      queryFn: () => api.get<MatterDocument[]>(`/documents/by-matter/${m.id}`),
      enabled: hasMatters,
      staleTime: 30_000,
    })),
  });
  const hasDocuments = docQueries.some((q) => (q.data?.length ?? 0) > 0);

  const steps: Step[] = [
    { key: 'client', icon: UserPlus, done: hasClients, href: '/clients' },
    { key: 'matter', icon: Briefcase, done: hasMatters, href: '/matters' },
    { key: 'document', icon: FileUp, done: hasDocuments, href: '/documents' },
    { key: 'invoice', icon: Receipt, done: hasInvoices, href: '/invoices' },
  ];

  const completed = steps.filter((s) => s.done).length;
  // Oculta cuando todo está hecho (o cuando no hay nada que sugerir aún por estar cargando facturas).
  if (completed === steps.length) return null;

  return (
    <Card className="border-[var(--brand-line)]">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-[var(--ai-from)] to-[var(--ai-to)]">
            <Rocket className="size-3.5 text-white" />
          </span>
          <span className="text-sm font-semibold">{t('title')}</span>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {t('progress', { done: completed, total: steps.length })}
          </span>
        </div>
        <p className="mb-3 text-[13px] text-muted-foreground">{t('subtitle')}</p>
        <ol className="space-y-1.5">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] transition-colors hover:bg-accent',
                    s.done ? 'border-transparent opacity-60' : 'border-border',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full',
                      s.done
                        ? 'bg-[var(--success)] text-white'
                        : 'bg-[var(--brand-soft)] text-[var(--brand)]',
                    )}
                  >
                    {s.done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                  </span>
                  <span className={cn('flex-1', s.done && 'line-through')}>
                    {t(`step.${s.key}`)}
                  </span>
                  {!s.done && <ArrowRight className="size-4 text-muted-foreground" />}
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
