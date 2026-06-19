'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Pause, Play, ReceiptText } from 'lucide-react';
import { useAddTimeEntry, useMatterLedger, useProposeCost, useTasks } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { daysUntil, deadlineUrgency, URGENCY_COLOR } from '@/lib/calendar';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Rail derecho de la ficha de expediente: plazos procesales · saldo · cronómetro (replica 453-550). */
export function MatterRail({
  matterId,
  onOpenLedger,
}: {
  matterId: string;
  onOpenLedger?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <DeadlinesCard matterId={matterId} />
      <BalanceCard matterId={matterId} onOpenLedger={onOpenLedger} />
      <ProposeCostCard matterId={matterId} />
      <TimerCard matterId={matterId} />
    </div>
  );
}

function ProposeCostCard({ matterId }: { matterId: string }) {
  const t = useTranslations('matters.rail');
  const propose = useProposeCost(matterId);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const valid = description.trim().length >= 2 && Number(amount) > 0;

  async function submit() {
    setError(null);
    try {
      await propose.mutateAsync({ description: description.trim(), amount });
      setDescription('');
      setAmount('');
      setOpen(false);
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('proposeError'));
    }
  }

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <ReceiptText className="size-4 text-[var(--brand)]" />
        <span className="text-[13px] font-semibold">{t('proposeTitle')}</span>
      </div>
      {!open ? (
        <>
          <p className="mb-2.5 text-[11.5px] text-[var(--text-subtle)]">{t('proposeHint')}</p>
          {done && <p className="mb-2 text-[11.5px] text-[var(--success)]">{t('proposeSent')}</p>}
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setDone(false);
            }}
            className="w-full rounded-[10px] border px-3 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('propose')}
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('proposeConcept')}
            autoFocus
            className="h-9 w-full rounded-[10px] border bg-[var(--surface-1)] px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder={t('proposeAmount')}
            className="h-9 w-full rounded-[10px] border bg-[var(--surface-1)] px-3 text-[12.5px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-[10px] border px-3 py-2 text-[12px] text-muted-foreground"
            >
              {t('proposeCancel')}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!valid || propose.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[var(--brand)] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {propose.isPending && <Loader2 className="size-3.5 animate-spin" />}
              {t('proposeSend')}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border bg-card p-4 shadow-sm', className)}>{children}</div>;
}

function DeadlinesCard({ matterId }: { matterId: string }) {
  const t = useTranslations('matters.rail');
  const locale = useLocale();
  const { data } = useTasks({ matterId });

  const deadlines = useMemo(() => {
    return (data ?? [])
      .filter(
        (task) =>
          task.dueDate &&
          task.isProcedural &&
          task.status !== 'CANCELLED' &&
          task.status !== 'DONE',
      )
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .slice(0, 4);
  }, [data]);

  return (
    <Card>
      <div className="mb-3 text-[13px] font-semibold">{t('deadlines')}</div>
      {deadlines.length === 0 ? (
        <p className="text-[12px] text-[var(--text-subtle)]">{t('noDeadlines')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {deadlines.map((d) => {
            const color = URGENCY_COLOR[deadlineUrgency(d.dueDate!, false)];
            const date = new Date(d.dueDate!);
            const n = daysUntil(d.dueDate!);
            return (
              <div key={d.id} className="flex gap-3">
                <div className="w-9 flex-shrink-0 text-center">
                  <div className="text-base font-semibold leading-none" style={{ color }}>
                    {new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(date)}
                  </div>
                  <div className="text-[10px] uppercase text-[var(--text-subtle)]">
                    {new Intl.DateTimeFormat(locale, { month: 'short' }).format(date)}
                  </div>
                </div>
                <div className="flex-1 border-l-2 pl-3" style={{ borderColor: color }}>
                  <div className="text-[12.5px] font-medium">{d.deadlineType || d.title}</div>
                  <div className="text-[11px] font-semibold" style={{ color }}>
                    {n < 0 ? t('overdue') : n === 0 ? t('today') : t('inDays', { n })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function BalanceCard({ matterId, onOpenLedger }: { matterId: string; onOpenLedger?: () => void }) {
  const t = useTranslations('matters.rail');
  const locale = useLocale();
  const { data } = useMatterLedger(matterId);

  // "Facturado" DESGLOSADO por moneda: las facturas del expediente pueden ser de distintas monedas
  // (EUR/USD/DOP) y no deben sumarse en una sola cifra. Devuelve el texto ya formateado (« · » entre monedas).
  const billed = useMemo(() => {
    if (!data) return null;
    const byCcy = new Map<string, number>();
    for (const e of data.entries) {
      if (e.type === 'INVOICE')
        byCcy.set(e.currency, (byCcy.get(e.currency) ?? 0) + Number(e.amount));
    }
    return byCcy.size
      ? [...byCcy.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([c, v]) => formatMoney(v, c, locale))
          .join(' · ')
      : formatMoney(0, data.currency, locale);
  }, [data, locale]);

  return (
    <Card>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[13px] font-semibold">{t('balance')}</div>
        {onOpenLedger && (
          <button
            type="button"
            onClick={onOpenLedger}
            className="text-[11.5px] font-semibold text-[var(--brand)] hover:underline"
          >
            {t('ledger')} →
          </button>
        )}
      </div>
      <div className="text-[28px] font-semibold tabular-nums tracking-tight">
        {data ? formatMoney(data.balance, data.currency, locale) : '—'}
      </div>
      <div className="mt-0.5 text-[11.5px] text-[var(--text-subtle)]">{t('pending')}</div>
      <div className="mt-3.5 flex gap-2">
        <Stat label={t('billed')} value={data && billed !== null ? billed : '—'} />
        <Stat label={t('entries')} value={data ? String(data.entries.length) : '—'} />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-[9px] border bg-[var(--surface-1)] p-2.5 text-center">
      <div className="text-[10.5px] text-[var(--text-subtle)]">{label}</div>
      <div className="text-[13px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

const DEFAULT_RATE = '120.00';

function TimerCard({ matterId }: { matterId: string }) {
  const t = useTranslations('matters.rail');
  const addTime = useAddTimeEntry(matterId);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState(DEFAULT_RATE);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const minutes = Math.round(seconds / 60);
  const disp = formatClock(seconds);

  function logTime() {
    if (minutes < 1) return;
    addTime.mutate(
      {
        description: description.trim() || t('defaultConcept'),
        minutes,
        hourlyRate: rate.trim() || DEFAULT_RATE,
        workedAt: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          setSeconds(0);
          setRunning(false);
          setDescription('');
        },
      },
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold">{t('timer')}</span>
        <span className="text-[11px] text-[var(--text-subtle)]">{rate} €/h</span>
      </div>

      <div className="flex items-center gap-3 rounded-xl border bg-[var(--surface-1)] p-3">
        <button
          type="button"
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? t('stop') : t('start')}
          className={cn(
            'flex size-[42px] flex-shrink-0 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90',
            running ? 'animate-pulse bg-[var(--danger)]' : 'bg-[var(--brand)]',
          )}
        >
          {running ? (
            <Pause className="size-[15px] fill-white" />
          ) : (
            <Play className="size-[15px] fill-white" />
          )}
        </button>
        <div>
          <div className="text-[23px] font-semibold tabular-nums tracking-tight">{disp}</div>
          <div className="text-[11px] text-[var(--text-subtle)]">
            {running ? (
              <span className="font-semibold text-[var(--danger)]">● {t('counting')}</span>
            ) : (
              t('hint')
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('conceptPlaceholder')}
          className="h-9 w-full rounded-[10px] border bg-card px-3 text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-2">
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            aria-label={t('rate')}
            className="h-9 w-24 rounded-[10px] border bg-card px-3 text-[12.5px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={logTime}
            disabled={minutes < 1 || addTime.isPending}
            className="h-9 flex-1 rounded-[10px] bg-[var(--brand)] text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t('logTime', { min: minutes })}
          </button>
        </div>
        {addTime.isError && <p className="text-[11px] text-[var(--danger)]">{t('logError')}</p>}
      </div>
    </Card>
  );
}

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
