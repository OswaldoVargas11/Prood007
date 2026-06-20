'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  CalendarClock,
  CheckSquare,
  FileText,
  Mail,
  MessageSquare,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import { useMatterTimeline } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import type { TimelineEvent } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const ICON: Record<TimelineEvent['type'], LucideIcon> = {
  document: FileText,
  task: CheckSquare,
  deadline: CalendarClock,
  ledger: Receipt,
  email: Mail,
  message: MessageSquare,
};

/** Feed cronológico único del expediente (documentos, tareas, plazos, ledger, correos, chat). */
export function MatterTimeline({ matterId }: { matterId: string }) {
  const t = useTranslations('matters.timeline');
  const locale = useLocale();
  const { data, isLoading } = useMatterTimeline(matterId);

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  const events = data?.events ?? [];
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t('empty')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">
        <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
          {events.map((e, i) => {
            const Icon = ICON[e.type] ?? FileText;
            return (
              <li key={i} className="relative flex gap-3">
                <span className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-[var(--surface-1)] text-[var(--brand)]">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t(`type.${e.type}`)}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {formatDate(e.at, locale)}
                    </span>
                  </div>
                  <div className="truncate text-[13.5px] font-medium">{e.title}</div>
                  {e.subtitle && (
                    <div className="truncate text-[12px] text-muted-foreground">{e.subtitle}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
