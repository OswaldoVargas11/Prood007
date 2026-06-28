'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarPlus, Check, ChevronLeft, ChevronRight, CalendarDays, Copy } from 'lucide-react';
import { useCalendarFeedLink, useMatters, useTasks } from '@/lib/hooks';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  buildMonthGrid,
  dayKey,
  daysUntil,
  deadlineUrgency,
  URGENCY_COLOR,
  type DeadlineUrgency,
} from '@/lib/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Task } from '@/lib/types';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface Deadline {
  task: Task;
  reference: string | null;
  urgency: DeadlineUrgency;
  color: string;
}

export default function CalendarPage() {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const router = useRouter();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const tasksQuery = useTasks();
  const mattersQuery = useMatters({ pageSize: 100 });

  const refByMatter = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of mattersQuery.data?.items ?? []) map.set(m.id, m.reference);
    return map;
  }, [mattersQuery.data]);

  // Plazos = tareas con fecha de vencimiento, sin cancelar. Las procesales son las "duras".
  const deadlines = useMemo<Deadline[]>(() => {
    return (tasksQuery.data ?? [])
      .filter((task) => task.dueDate && task.status !== 'CANCELLED')
      .map((task) => ({
        task,
        reference: task.matterId ? (refByMatter.get(task.matterId) ?? null) : null,
        urgency: deadlineUrgency(task.dueDate!, task.status === 'DONE'),
        color: URGENCY_COLOR[deadlineUrgency(task.dueDate!, task.status === 'DONE')],
      }));
  }, [tasksQuery.data, refByMatter]);

  const byDay = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    for (const d of deadlines) {
      const k = dayKey(new Date(d.task.dueDate!));
      const list = map.get(k) ?? [];
      list.push(d);
      map.set(k, list);
    }
    return map;
  }, [deadlines]);

  const grid = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor.year, cursor.month],
  );

  const upcoming = useMemo(
    () =>
      deadlines
        .filter((d) => d.urgency !== 'done' && daysUntil(d.task.dueDate!) >= 0)
        .sort((a, b) => a.task.dueDate!.localeCompare(b.task.dueDate!))
        .slice(0, 8),
    [deadlines],
  );

  // Capitalizamos SOLO la primera letra (no con CSS `capitalize`, que pondría "Junio De 2026").
  const monthLabelRaw = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(cursor.year, cursor.month, 1),
  );
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
  const isCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function openDeadline(d: Deadline) {
    if (d.task.matterId) router.push(`/matters/${d.task.matterId}`);
    else router.push('/tasks');
  }

  function leftLabel(iso: string): string {
    const n = daysUntil(iso);
    if (n < 0) return t('overdue');
    if (n === 0) return t('today');
    return t('inDays', { n });
  }

  const loading = tasksQuery.isLoading || mattersQuery.isLoading;

  return (
    <div className="mx-auto max-w-[1320px] space-y-4">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <>
            <SubscribeAgendaButton />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}
              disabled={isCurrentMonth}
            >
              {t('goToday')}
            </Button>
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label={t('prevMonth')}
              className="flex size-8 items-center justify-center rounded-[9px] border bg-card text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[120px] text-center text-sm font-semibold">{monthLabel}</span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label={t('nextMonth')}
              className="flex size-8 items-center justify-center rounded-[9px] border bg-card text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_300px]">
        {/* Rejilla del mes */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div role="row" className="grid grid-cols-7 border-b">
            {WEEKDAYS.map((w) => (
              <span
                key={w}
                role="columnheader"
                className="p-2.5 text-center text-[10.5px] font-semibold uppercase text-[var(--text-subtle)]"
              >
                {w}
              </span>
            ))}
          </div>
          <div role="grid" aria-label={t('title')} className="grid grid-cols-7">
            {grid.map((cell) => {
              const items = byDay.get(cell.key) ?? [];
              return (
                <div
                  key={cell.key}
                  role="gridcell"
                  aria-current={cell.isToday ? 'date' : undefined}
                  className={cn(
                    'min-h-[86px] border-b border-r p-2 last:border-r-0',
                    !cell.inMonth && 'bg-[var(--surface-1)]/40',
                    cell.isWeekend && cell.inMonth && 'bg-accent/30',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'text-xs tabular-nums',
                        cell.inMonth ? 'font-medium text-foreground' : 'text-[var(--text-subtle)]',
                        cell.isToday && 'font-semibold text-[var(--brand)]',
                      )}
                    >
                      {cell.day}
                    </span>
                    {cell.isToday && (
                      <span className="rounded-[5px] bg-[var(--brand)] px-1.5 py-px text-[8.5px] font-bold text-white">
                        {t('todayBadge')}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {items.slice(0, 3).map((d) => (
                      <button
                        key={d.task.id}
                        type="button"
                        onClick={() => openDeadline(d)}
                        title={d.task.title}
                        aria-label={
                          d.task.deadlineType
                            ? `${d.task.deadlineType}: ${d.task.title}`
                            : d.task.title
                        }
                        className="truncate rounded-[5px] px-1.5 py-0.5 text-left text-[9.5px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        style={{ background: d.color }}
                      >
                        {d.task.deadlineType || d.task.title}
                      </button>
                    ))}
                    {items.length > 3 && (
                      <span className="px-1 text-[9.5px] font-medium text-[var(--text-subtle)]">
                        {t('more', { n: items.length - 3 })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rail: carga de plazos próximos */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm lg:sticky lg:top-2">
          <div className="border-b px-4 py-3 text-[13px] font-semibold">{t('load')}</div>
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : upcoming.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <CalendarDays className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2.5 text-[12.5px] text-muted-foreground">{t('empty')}</p>
            </div>
          ) : (
            upcoming.map((d) => (
              <button
                key={d.task.id}
                type="button"
                onClick={() => openDeadline(d)}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60"
              >
                <span
                  className="h-[34px] w-[3px] flex-shrink-0 rounded-[3px]"
                  style={{ background: d.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">
                    {d.task.deadlineType || d.task.title}
                  </div>
                  <div className="font-mono text-[11px] text-[var(--text-subtle)]">
                    {d.reference ? `${d.reference} · ` : ''}
                    {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(
                      new Date(d.task.dueDate!),
                    )}
                  </div>
                </div>
                <span
                  className="flex-shrink-0 whitespace-nowrap text-[11.5px] font-semibold"
                  style={{ color: d.color }}
                >
                  {leftLabel(d.task.dueDate!)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {tasksQuery.isError && <p className="text-sm text-muted-foreground">{t('loadError')}</p>}
    </div>
  );
}

/** Botón "Suscribir agenda": muestra la URL iCal para añadirla a Google/Outlook/Apple Calendar. */
function SubscribeAgendaButton() {
  const t = useTranslations('calendar');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = useCalendarFeedLink();
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  const url = link.data ? `${base}/api/public/calendar/${link.data.token}.ics` : '';

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" /> {t('subscribe')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('subscribeTitle')}</DialogTitle>
            <DialogDescription>{t('subscribeDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                readOnly
                value={url || '…'}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-[12px]"
              />
              <Button size="sm" onClick={copy} disabled={!url}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-muted-foreground">
              <li>{t('howGoogle')}</li>
              <li>{t('howOutlook')}</li>
              <li>{t('howApple')}</li>
            </ol>
            <p className="text-[11.5px] text-[var(--text-subtle)]">{t('subscribeNote')}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
