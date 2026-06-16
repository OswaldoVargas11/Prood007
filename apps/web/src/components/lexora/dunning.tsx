'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Bell, Loader2 } from 'lucide-react';
import { useDunningReminders, useDunningRun } from '@/lib/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import type { BadgeProps } from '@/components/ui/badge';
import type { DunningReminderStatus, DunningSeverity } from '@/lib/types';

const SEVERITY_VARIANT: Record<DunningSeverity, BadgeProps['variant']> = {
  REMINDER: 'info',
  WARNING: 'warning',
  FINAL: 'danger',
};

const STATUS_VARIANT: Record<DunningReminderStatus, BadgeProps['variant']> = {
  SCHEDULED: 'secondary',
  SENT: 'success',
  SKIPPED: 'outline',
  FAILED: 'danger',
};

/**
 * Botón "Recordar vencidas": dispara `POST /dunning/run` para perseguir las facturas vencidas del
 * despacho. Muestra el resumen de la corrida (entregados · vencidas) o el error, en línea.
 */
export function DunningRunButton() {
  const t = useTranslations('dunning');
  const run = useDunningRun();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
        {run.isPending ? <Loader2 className="animate-spin" /> : <Bell />}
        {run.isPending ? t('reminding') : t('remindOverdue')}
      </Button>
      {run.isSuccess && (
        <span className="text-[12px] text-muted-foreground">
          {t('runResult', { delivered: run.data.delivered, evaluated: run.data.evaluated })}
        </span>
      )}
      {run.isError && <span className="text-[12px] text-[var(--danger)]">{t('runError')}</span>}
    </div>
  );
}

/**
 * Línea de tiempo de recordatorios de cobro de una factura: qué etapa, por qué canal, en qué estado y
 * cuándo. Estados cargando / vacío / error. Solo lectura.
 */
export function DunningTimeline({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations('dunning');
  const locale = useLocale();
  const { data, isLoading, isError } = useDunningReminders(invoiceId);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t('timelineTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading && <Skeleton className="h-16 w-full" />}
        {isError && <p className="text-[var(--danger)]">{t('loadError')}</p>}
        {!isLoading && !isError && (!data || data.length === 0) && (
          <p className="text-muted-foreground">{t('timelineEmpty')}</p>
        )}
        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={SEVERITY_VARIANT[r.severity]}>
                      {t(`severity.${r.severity}`)}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[r.status]}>{t(`status.${r.status}`)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {t(`channel.${r.channel}`)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('offsetDays', { n: r.offsetDays })}
                  </div>
                </div>
                <div className="text-right text-xs tabular-nums text-muted-foreground">
                  {formatDate(r.sentAt ?? r.scheduledFor, locale)}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground">{t('timelineHint')}</p>
      </CardContent>
    </Card>
  );
}
