'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarClock, Check, Loader2, X } from 'lucide-react';
import {
  useFirmAppointments,
  useSchedulingConfig,
  useSetAppointmentStatus,
  useUpdateSchedulingConfig,
  type Appointment,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const WD_LABEL: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
  7: 'Dom',
};

const toTime = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const fromTime = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export default function SchedulingPage() {
  const t = useTranslations('scheduling');
  const cfg = useSchedulingConfig();
  const appts = useFirmAppointments();

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-5 text-[var(--brand)]" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {cfg.isLoading ? <Skeleton className="h-64 w-full" /> : <AvailabilityCard data={cfg.data!} />}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('appointments')}</h2>
        {appts.isLoading && <Skeleton className="h-24 w-full" />}
        {appts.data?.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t('noAppointments')}
            </CardContent>
          </Card>
        )}
        <div className="space-y-2">
          {appts.data?.map((a) => (
            <FirmAppointmentRow key={a.id} appt={a} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AvailabilityCard({
  data,
}: {
  data: {
    enabled: boolean;
    weekdays: number[];
    startMin: number;
    endMin: number;
    slotMinutes: number;
  };
}) {
  const t = useTranslations('scheduling');
  const save = useUpdateSchedulingConfig();
  const [enabled, setEnabled] = useState(data.enabled);
  const [weekdays, setWeekdays] = useState<number[]>(data.weekdays ?? []);
  const [start, setStart] = useState(toTime(data.startMin));
  const [end, setEnd] = useState(toTime(data.endMin));
  const [slot, setSlot] = useState(data.slotMinutes);

  // Sincroniza si los datos llegan después del primer render.
  useEffect(() => {
    setEnabled(data.enabled);
    setWeekdays(data.weekdays ?? []);
    setStart(toTime(data.startMin));
    setEnd(toTime(data.endMin));
    setSlot(data.slotMinutes);
  }, [data]);

  function toggleDay(d: number) {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function submit() {
    const startMin = fromTime(start);
    const endMin = fromTime(end);
    if (endMin <= startMin) {
      toast.error(t('invalidHours'));
      return;
    }
    try {
      await save.mutateAsync({ enabled, weekdays, startMin, endMin, slotMinutes: slot });
      toast.success(t('saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('saveError'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('availability')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">{t('enabled')}</div>
            <div className="text-[12.5px] text-muted-foreground">{t('enabledHint')}</div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </label>

        <div className="space-y-2">
          <div className="text-sm font-medium">{t('weekdays')}</div>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  weekdays.includes(d)
                    ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {WD_LABEL[d]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">{t('from')}</div>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">{t('to')}</div>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">{t('slotLength')}</div>
            <select
              value={slot}
              onChange={(e) => setSlot(Number(e.target.value))}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {[15, 20, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} {t('minutes')}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {t('save')}
        </Button>
      </CardContent>
    </Card>
  );
}

function FirmAppointmentRow({ appt }: { appt: Appointment }) {
  const t = useTranslations('scheduling');
  const setStatus = useSetAppointmentStatus();
  const pending = appt.status === 'REQUESTED';

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium capitalize">{appt.dayLabel}</span>
            <span className="text-sm text-muted-foreground">· {appt.timeLabel}</span>
            <Badge variant={pending ? 'warning' : 'success'}>{t(`status.${appt.status}`)}</Badge>
          </div>
          {appt.client && (
            <div className="text-[12.5px] text-muted-foreground">
              {t('withClient', { name: appt.client.name })}
              {appt.matter ? ` · ${appt.matter.label}` : ''}
            </div>
          )}
          {appt.note && <div className="text-[12.5px] text-muted-foreground">“{appt.note}”</div>}
        </div>
        <div className="flex items-center gap-1.5">
          {pending && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatus.mutate({ id: appt.id, action: 'confirm' })}
              disabled={setStatus.isPending}
            >
              <Check className="size-4" />
              {t('confirm')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setStatus.mutate({ id: appt.id, action: 'cancel' })}
            disabled={setStatus.isPending}
          >
            <X className="size-4" />
            {t('cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
