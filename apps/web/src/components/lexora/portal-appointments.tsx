'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import {
  useBookAppointment,
  useCancelClientAppointment,
  useClientAppointments,
  useSchedulingOptions,
  useSchedulingSlots,
  type SchedulingOption,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Sección de citas del portal: próximas citas + solicitar una nueva con el abogado del expediente. */
export function PortalAppointments() {
  const t = useTranslations('portal.appointments');
  const appts = useClientAppointments();
  const cancel = useCancelClientAppointment();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t('title')}</h2>
        <BookDialog />
      </div>

      {appts.isLoading && <Skeleton className="h-20 w-full" />}
      {appts.data?.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t('none')}
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {appts.data?.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-[var(--brand)]" />
                  <span className="text-sm font-medium capitalize">{a.dayLabel}</span>
                  <span className="text-sm text-muted-foreground">· {a.timeLabel}</span>
                  <Badge variant={a.status === 'CONFIRMED' ? 'success' : 'warning'}>
                    {t(`status.${a.status}`)}
                  </Badge>
                </div>
                {a.lawyer && (
                  <div className="text-[12.5px] text-muted-foreground">
                    {t('withLawyer', { name: a.lawyer.name })}
                    {a.matter ? ` · ${a.matter.label}` : ''}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => cancel.mutate(a.id)}
                disabled={cancel.isPending}
              >
                {t('cancel')}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function BookDialog() {
  const t = useTranslations('portal.appointments');
  const [open, setOpen] = useState(false);
  const options = useSchedulingOptions();
  const bookable = useMemo(() => (options.data ?? []).filter((o) => o.bookable), [options.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CalendarClock className="size-4" />
          {t('request')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('request')}</DialogTitle>
          <DialogDescription>{t('requestHint')}</DialogDescription>
        </DialogHeader>
        {options.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : bookable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('noBookable')}</p>
        ) : (
          <BookForm options={bookable} onDone={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BookForm({ options, onDone }: { options: SchedulingOption[]; onDone: () => void }) {
  const t = useTranslations('portal.appointments');
  const [lawyerId, setLawyerId] = useState(options[0].lawyerId);
  const [matterId, setMatterId] = useState<string>('');
  const [startsAt, setStartsAt] = useState<string>('');
  const [note, setNote] = useState('');
  const slots = useSchedulingSlots(lawyerId);
  const book = useBookAppointment();

  const lawyer = options.find((o) => o.lawyerId === lawyerId) ?? options[0];

  // Agrupa las franjas por día conservando el orden.
  const byDay = useMemo(() => {
    const groups: { day: string; items: { startsAt: string; timeLabel: string }[] }[] = [];
    for (const s of slots.data ?? []) {
      let g = groups.find((x) => x.day === s.dayLabel);
      if (!g) {
        g = { day: s.dayLabel, items: [] };
        groups.push(g);
      }
      g.items.push({ startsAt: s.startsAt, timeLabel: s.timeLabel });
    }
    return groups;
  }, [slots.data]);

  async function submit() {
    if (!startsAt) return;
    try {
      await book.mutateAsync({
        lawyerId,
        matterId: matterId || undefined,
        startsAt,
        note: note.trim() || undefined,
      });
      toast.success(t('booked'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('bookError'));
    }
  }

  return (
    <div className="space-y-4">
      {options.length > 1 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('lawyer')}</label>
          <select
            value={lawyerId}
            onChange={(e) => {
              setLawyerId(e.target.value);
              setMatterId('');
              setStartsAt('');
            }}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {options.map((o) => (
              <option key={o.lawyerId} value={o.lawyerId}>
                {o.lawyerName}
              </option>
            ))}
          </select>
        </div>
      )}

      {lawyer.matters.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('matter')}</label>
          <select
            value={matterId}
            onChange={(e) => setMatterId(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">{t('noMatter')}</option>
            {lawyer.matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('chooseSlot')}</label>
        {slots.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : byDay.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('noSlots')}</p>
        ) : (
          <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
            {byDay.map((g) => (
              <div key={g.day}>
                <div className="mb-1 text-[11.5px] font-medium capitalize text-muted-foreground">
                  {g.day}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => setStartsAt(s.startsAt)}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                        startsAt === s.startsAt
                          ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {s.timeLabel}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('reason')}</label>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('reasonPlaceholder')}
        />
      </div>

      <Button onClick={submit} disabled={!startsAt || book.isPending} className="w-full">
        {book.isPending && <Loader2 className="size-4 animate-spin" />}
        {t('confirm')}
      </Button>
    </div>
  );
}
