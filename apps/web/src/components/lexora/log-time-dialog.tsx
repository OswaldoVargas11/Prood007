'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Loader2 } from 'lucide-react';
import { useLogTime, useMatters } from '@/lib/hooks';
import type { Matter } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Registro de tiempo SIN FRICCIÓN: un único diálogo, reutilizable desde cualquier pantalla, que pide
 * expediente + concepto + duración + tarifa y ficha el tiempo (`POST /ledger/time`). El expediente se
 * elige aquí (no se asume el contexto), por eso usa `useLogTime` (matterId en el cuerpo).
 */
export function LogTimeDialog({ defaultMatterId }: { defaultMatterId?: string }) {
  const t = useTranslations('time');
  const mattersQuery = useMatters({ pageSize: 100 });
  const matters = useMemo<Matter[]>(() => mattersQuery.data?.items ?? [], [mattersQuery.data]);
  const log = useLogTime();

  const [open, setOpen] = useState(false);
  const [matterId, setMatterId] = useState(defaultMatterId ?? '');
  const [description, setDescription] = useState('');
  const [minutes, setMinutes] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [workedAt, setWorkedAt] = useState(new Date().toISOString().slice(0, 10));

  const valid = Boolean(matterId && description.trim() && minutes && hourlyRate);

  function submit() {
    if (!valid) return;
    log.mutate(
      {
        matterId,
        description: description.trim(),
        minutes: Number(minutes),
        hourlyRate,
        workedAt,
      },
      {
        onSuccess: () => {
          setDescription('');
          setMinutes('');
          setHourlyRate('');
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Clock />
        {t('log')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('log')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lt-matter">{t('matter')}</Label>
              {matters.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('noMatters')}</p>
              ) : (
                <select
                  id="lt-matter"
                  value={matterId}
                  onChange={(e) => setMatterId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="" disabled>
                    {t('matterPlaceholder')}
                  </option>
                  {matters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.reference} · {m.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-desc">{t('description')}</Label>
              <Input
                id="lt-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lt-min">{t('minutes')}</Label>
                <Input
                  id="lt-min"
                  type="number"
                  min={1}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lt-rate">{t('hourlyRate')}</Label>
                <Input
                  id="lt-rate"
                  inputMode="decimal"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lt-date">{t('workedAt')}</Label>
                <Input
                  id="lt-date"
                  type="date"
                  value={workedAt}
                  onChange={(e) => setWorkedAt(e.target.value)}
                />
              </div>
            </div>
            {log.isError && <p className="text-sm text-[var(--danger)]">{t('error')}</p>}
          </div>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={log.isPending || !valid}>
              {log.isPending && <Loader2 className="animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
