'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Check, ListChecks, Loader2, Plus } from 'lucide-react';
import {
  useCreateTask,
  useCreateTaskFromDeadline,
  useDeadlinePreview,
  useTasks,
  useUpdateTask,
} from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { DEADLINE_PRESETS } from '@/lib/deadline-types';
import { isOverdue, TASK_STATUSES, taskStatusVariant } from '@/lib/task-status';
import { formatDate } from '@/lib/format';
import type { DeadlineResult, TaskStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function TasksPanel({ matterId }: { matterId?: string }) {
  const t = useTranslations('tasks');
  const tStatus = useTranslations('tasks.status');
  const locale = useLocale();
  const [status, setStatus] = useState<TaskStatus | undefined>(undefined);
  const { data, isLoading, isError, refetch } = useTasks({ matterId, status });
  const update = useUpdateTask();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={status === undefined} onClick={() => setStatus(undefined)}>
            {t('filterAll')}
          </Chip>
          {TASK_STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
              {tStatus(s)}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          <NewTaskDialog matterId={matterId} />
          <DeadlineDialog matterId={matterId} />
        </div>
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}
      {isError && (
        <div className="space-y-2 py-8 text-center">
          <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            {t('retry')}
          </Button>
        </div>
      )}
      {!isLoading && !isError && data?.length === 0 && (
        <Card>
          <EmptyState icon={ListChecks} title={t('empty')} />
        </Card>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {data.map((task) => {
              const overdue = isOverdue(task.dueDate, task.status);
              return (
                <div key={task.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{task.title}</span>
                      {task.isProcedural && (
                        <Badge variant="violet" className="gap-1">
                          <CalendarClock className="size-3" />
                          {t('procedural')}
                        </Badge>
                      )}
                    </div>
                    {task.dueDate && (
                      <div
                        className={cn(
                          'mt-0.5 text-xs tabular-nums',
                          overdue ? 'font-medium text-[var(--danger)]' : 'text-muted-foreground',
                        )}
                      >
                        {t('due')}: {formatDate(task.dueDate, locale)}
                        {overdue ? ` · ${t('overdue')}` : ''}
                      </div>
                    )}
                  </div>
                  <Badge variant={taskStatusVariant(task.status)}>{tStatus(task.status)}</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" disabled={update.isPending}>
                        {update.isPending ? <Loader2 className="animate-spin" /> : t('setStatus')}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {TASK_STATUSES.filter((s) => s !== task.status).map((s) => (
                        <DropdownMenuItem
                          key={s}
                          onSelect={() => update.mutate({ id: task.id, status: s })}
                        >
                          {s === 'DONE' ? <Check /> : null}
                          {tStatus(s)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-transparent bg-[var(--brand-soft)] text-[var(--brand)]'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function NewTaskDialog({ matterId }: { matterId?: string }) {
  const t = useTranslations('tasks');
  const create = useCreateTask();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  function submit() {
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), dueDate: dueDate || undefined, matterId },
      {
        onSuccess: () => {
          setTitle('');
          setDueDate('');
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus />
        {t('new')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('new')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!create.isPending && title.trim()) submit();
          }}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">{t('titleField')}</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">{t('dueField')}</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            {create.isError && <p className="text-sm text-[var(--danger)]">{t('createError')}</p>}
          </div>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              {create.isPending && <Loader2 className="animate-spin" />}
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeadlineDialog({ matterId }: { matterId?: string }) {
  const t = useTranslations('tasks');
  const locale = useLocale();
  const { user } = useAuth();
  const presets =
    DEADLINE_PRESETS[(user?.jurisdiction as 'es' | 'do') ?? 'es'] ?? DEADLINE_PRESETS.es;
  const fromDeadline = useCreateTaskFromDeadline();
  const [open, setOpen] = useState(false);
  const [deadlineType, setDeadlineType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [days, setDays] = useState('');
  const [notificationRef, setNotificationRef] = useState('');
  const [created, setCreated] = useState<DeadlineResult | null>(null);

  // Preview en vivo (debounced) mientras se rellena, antes de crear nada.
  const [debounced, setDebounced] = useState<{
    deadlineType: string;
    startDate: string;
    days: number;
  } | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      const d = Number(days);
      setDebounced(
        deadlineType.trim() && startDate && d > 0
          ? { deadlineType: deadlineType.trim(), startDate, days: d }
          : null,
      );
    }, 300);
    return () => clearTimeout(id);
  }, [deadlineType, startDate, days]);
  const preview = useDeadlinePreview(created ? null : debounced);
  const shown = created ?? preview.data ?? null;

  function applyPreset(label: string) {
    const p = presets.find((x) => x.label === label);
    if (p) {
      setDeadlineType(p.label);
      setDays(String(p.days));
    }
  }

  function submit() {
    if (!deadlineType.trim() || !startDate || !days) return;
    fromDeadline.mutate(
      {
        deadlineType: deadlineType.trim(),
        startDate,
        days: Number(days),
        matterId,
        notificationRef: notificationRef.trim() || undefined,
      },
      { onSuccess: (data) => setCreated(data.deadline) },
    );
  }

  function close(o: boolean) {
    setOpen(o);
    if (!o) {
      setCreated(null);
      setDeadlineType('');
      setStartDate('');
      setDays('');
      setNotificationRef('');
      setDebounced(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CalendarClock />
        {t('fromDeadline')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('fromDeadline')}</DialogTitle>
          <DialogDescription>{t('deadlineHelp')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!fromDeadline.isPending && deadlineType.trim() && startDate && days) submit();
          }}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('preset')}</Label>
              <select
                value=""
                onChange={(e) => applyPreset(e.target.value)}
                className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('presetPlaceholder')}</option>
                {presets.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label} ({p.days} d)
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dl-type">{t('deadlineType')}</Label>
              <Input
                id="dl-type"
                value={deadlineType}
                onChange={(e) => setDeadlineType(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dl-ref">{t('notificationRef')}</Label>
              <Input
                id="dl-ref"
                value={notificationRef}
                onChange={(e) => setNotificationRef(e.target.value)}
                placeholder={t('notificationRefPlaceholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dl-start">{t('startDate')}</Label>
                <Input
                  id="dl-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dl-days">{t('days')}</Label>
                <Input
                  id="dl-days"
                  type="number"
                  min={1}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </div>
            </div>
            {shown && (
              <div className="rounded-md border border-[var(--brand-line)] bg-[var(--brand-soft)] p-3 text-sm">
                <div className="font-medium text-[var(--brand)]">
                  {t('computed')}: {formatDate(shown.dueDate, locale)}
                </div>
                {shown.holidaysApplied && shown.holidaysApplied.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t('holidays')}: {shown.holidaysApplied.length}
                  </div>
                )}
                {created && <div className="mt-1 text-xs text-[var(--success)]">{t('saved')}</div>}
              </div>
            )}
            {fromDeadline.isError && (
              <p className="text-sm text-[var(--danger)]">{t('createError')}</p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              type="submit"
              disabled={fromDeadline.isPending || !deadlineType.trim() || !startDate || !days}
            >
              {fromDeadline.isPending && <Loader2 className="animate-spin" />}
              {created ? t('createAnother') : t('compute')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
