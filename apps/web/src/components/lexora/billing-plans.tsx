'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  CalendarClock,
  ChevronDown,
  FileText,
  Loader2,
  Play,
  Plus,
  Repeat,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import {
  useBillingSchedule,
  useCollectBillingInstallment,
  useCreateBillingSchedule,
  useMatterBillingSchedules,
  useRunBillingSchedule,
} from '@/lib/hooks';
import { defaultTaxCodes } from '@/lib/ledger';
import { formatMoney, formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api';
import type { BadgeProps } from '@/components/ui/badge';
import type {
  BillingInstallmentStatus,
  BillingScheduleLine,
  BillingScheduleListItem,
  BillingScheduleStatus,
} from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const STATUS_VARIANT: Record<BillingScheduleStatus, NonNullable<BadgeProps['variant']>> = {
  ACTIVE: 'info',
  PAUSED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'outline',
};

const INSTALLMENT_VARIANT: Record<BillingInstallmentStatus, NonNullable<BadgeProps['variant']>> = {
  SCHEDULED: 'secondary',
  EMITTED: 'info',
  PAID: 'success',
  SKIPPED: 'outline',
  FAILED: 'danger',
};

const INTERVALS = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;

/** Mensaje de error legible: el del backend (i18n) o un texto genérico. */
function errText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** ¿El plan se emite por barrido (botón «Emitir vencidos»)? Los ADVANCE se cobran cuota a cuota. */
function isRunnable(plan: { type: string; fiscalMode: string; status: string }): boolean {
  if (plan.status !== 'ACTIVE') return false;
  return !(plan.type === 'INSTALLMENTS' && plan.fiscalMode === 'ADVANCE');
}

/** Facturación programada del expediente (D-028): planes recurrentes y de pago + su cuadro de cuotas. */
export function BillingPlansTab({ matterId }: { matterId: string }) {
  const t = useTranslations('billingPlans');
  const { data, isLoading, isError, refetch } = useMatterBillingSchedules(matterId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        <CreatePlanDialog matterId={matterId} />
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && (
        <div className="space-y-2 py-8 text-center">
          <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            {t('retry')}
          </Button>
        </div>
      )}
      {!isLoading && !isError && data && data.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('empty')}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((plan) => (
            <PlanCard key={plan.id} plan={plan} matterId={matterId} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">{t('hint')}</p>
    </div>
  );
}

/** Tarjeta de un plan: resumen + acciones + cuadro de cuotas desplegable. */
function PlanCard({ plan, matterId }: { plan: BillingScheduleListItem; matterId: string }) {
  const t = useTranslations('billingPlans');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const run = useRunBillingSchedule(matterId);
  const runnable = isRunnable(plan);

  const intervalLabel = plan.intervalUnit ? t(`interval.${plan.intervalUnit}`) : '—';
  const cadence =
    plan.intervalCount > 1 ? `${plan.intervalCount}× ${intervalLabel}` : intervalLabel;
  const scope =
    plan.type === 'RECURRING'
      ? plan.occurrences == null
        ? t('openEnded')
        : t('periods', { count: plan.occurrences })
      : t('installments', { count: plan.installmentCount ?? plan.installments });

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="violet">
                <span className="flex items-center gap-1">
                  {plan.type === 'RECURRING' ? (
                    <Repeat className="size-3" />
                  ) : (
                    <CalendarClock className="size-3" />
                  )}
                  {t(`type.${plan.type}`)}
                </span>
              </Badge>
              {plan.type === 'INSTALLMENTS' && (
                <Badge variant="secondary">{t(`fiscalMode.${plan.fiscalMode}`)}</Badge>
              )}
              <Badge variant={STATUS_VARIANT[plan.status]}>{t(`status.${plan.status}`)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {cadence} · {scope}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('nextRun')}
            </span>
            <span className="text-sm font-medium tabular-nums">
              {plan.nextRunAt ? formatDate(plan.nextRunAt, locale) : '—'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-[var(--brand)] hover:underline"
            aria-expanded={open}
          >
            <ChevronDown
              className={cn('size-4 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
            {open ? t('hideSchedule') : t('viewSchedule', { count: plan.installments })}
          </button>
          {runnable && (
            <div className="flex flex-col items-end gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => run.mutate(plan.id)}
                disabled={run.isPending}
              >
                {run.isPending ? <Loader2 className="animate-spin" /> : <Play />}
                {t('runDue')}
              </Button>
              {run.isSuccess && (
                <span className="text-[11px] text-[var(--success)]">
                  {run.data.emitted.length > 0
                    ? t('runEmitted', { count: run.data.emitted.length })
                    : t('runNone')}
                </span>
              )}
              {run.error && (
                <span className="text-[11px] text-[var(--danger)]">
                  {errText(run.error, t('runError'))}
                </span>
              )}
            </div>
          )}
        </div>

        {open && <ScheduleTable scheduleId={plan.id} matterId={matterId} />}
      </CardContent>
    </Card>
  );
}

/** Cuadro de cuotas del plan (carga perezosa al desplegar). Cobra las cuotas ADVANCE in situ. */
function ScheduleTable({ scheduleId, matterId }: { scheduleId: string; matterId: string }) {
  const t = useTranslations('billingPlans');
  const locale = useLocale();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useBillingSchedule(scheduleId);
  const collect = useCollectBillingInstallment(matterId);
  const [collecting, setCollecting] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (isError || !data) {
    return (
      <div className="space-y-2 py-4 text-center">
        <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const isAdvance = data.type === 'INSTALLMENTS' && data.fiscalMode === 'ADVANCE';

  function doCollect(installmentId: string) {
    setCollecting(installmentId);
    collect.mutate(installmentId, { onSettled: () => setCollecting(null) });
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">{t('col.sequence')}</th>
            <th className="px-3 py-2 font-medium">{t('col.dueDate')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('col.amount')}</th>
            <th className="px-3 py-2 font-medium">{t('col.status')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('col.action')}</th>
          </tr>
        </thead>
        <tbody>
          {data.installments.map((i) => (
            <tr key={i.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{i.sequence}</td>
              <td className="px-3 py-2 tabular-nums">{formatDate(i.dueDate, locale)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatMoney(i.amount, data.currency, locale)}
              </td>
              <td className="px-3 py-2">
                <Badge variant={INSTALLMENT_VARIANT[i.status]}>
                  {t(`installmentStatus.${i.status}`)}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right">
                {i.invoiceId ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/invoices/${i.invoiceId}`)}
                    className="inline-flex items-center gap-1 text-[var(--brand)] hover:underline"
                  >
                    <FileText className="size-3.5" />
                    {t('viewInvoice')}
                  </button>
                ) : isAdvance && i.status === 'SCHEDULED' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => doCollect(i.id)}
                    disabled={collect.isPending}
                  >
                    {collecting === i.id ? <Loader2 className="animate-spin" /> : <Wallet />}
                    {t('collect')}
                  </Button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {collect.error && (
        <p className="px-3 py-2 text-[12px] text-[var(--danger)]">
          {errText(collect.error, t('collectError'))}
        </p>
      )}
    </div>
  );
}

/** Crea un plan RECURRING (iguala) o INSTALLMENTS (fraccionar), con líneas y retención opcional. */
function CreatePlanDialog({ matterId }: { matterId: string }) {
  const t = useTranslations('billingPlans');
  const { user } = useAuth();
  const codes = defaultTaxCodes(user?.jurisdiction ?? 'es');
  const create = useCreateBillingSchedule(matterId);
  const [open, setOpen] = useState(false);

  const [type, setType] = useState<'RECURRING' | 'INSTALLMENTS'>('RECURRING');
  const [fiscalMode, setFiscalMode] = useState<'SERVICE_RENDERED' | 'ADVANCE'>('SERVICE_RENDERED');
  const [intervalUnit, setIntervalUnit] = useState<(typeof INTERVALS)[number]>('MONTHLY');
  const [intervalCount, setIntervalCount] = useState('1');
  const [occurrences, setOccurrences] = useState('');
  const [installmentCount, setInstallmentCount] = useState('3');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<'EUR' | 'USD' | 'DOP'>(
    (user?.tenant?.currency as 'EUR' | 'USD' | 'DOP') ?? 'EUR',
  );
  const [note, setNote] = useState('');
  const [withholding, setWithholding] = useState(false);
  const [lines, setLines] = useState<BillingScheduleLine[]>([
    { description: '', quantity: '1', unitPrice: '', taxCode: codes.taxCode },
  ]);

  function setLine(i: number, patch: Partial<BillingScheduleLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const validLines = lines.filter((l) => l.description.trim() && l.unitPrice && l.quantity);
  const installmentsValid = type !== 'INSTALLMENTS' || Number(installmentCount) >= 2;
  const canSubmit = validLines.length > 0 && Boolean(startDate) && installmentsValid;

  function reset() {
    setType('RECURRING');
    setFiscalMode('SERVICE_RENDERED');
    setIntervalUnit('MONTHLY');
    setIntervalCount('1');
    setOccurrences('');
    setInstallmentCount('3');
    setStartDate(new Date().toISOString().slice(0, 10));
    setCurrency((user?.tenant?.currency as 'EUR' | 'USD' | 'DOP') ?? 'EUR');
    setNote('');
    setWithholding(false);
    setLines([{ description: '', quantity: '1', unitPrice: '', taxCode: codes.taxCode }]);
  }

  function submit() {
    if (!canSubmit) return;
    const ic = Number(intervalCount);
    create.mutate(
      {
        type,
        intervalUnit,
        intervalCount: Number.isFinite(ic) && ic >= 1 ? ic : 1,
        startDate,
        currency,
        lines: validLines,
        withholdingTaxCode: withholding ? codes.withholdingTaxCode : undefined,
        note: note.trim() || undefined,
        ...(type === 'RECURRING'
          ? { occurrences: occurrences.trim() ? Number(occurrences) : undefined }
          : { fiscalMode, installmentCount: Number(installmentCount) }),
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus />
        {t('createPlan')}
      </Button>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Tipo de plan */}
          <div className="space-y-1.5">
            <Label>{t('typeLabel')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {(['RECURRING', 'INSTALLMENTS'] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setType(tp)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    type === tp
                      ? 'border-transparent bg-[var(--brand-soft)] text-[var(--brand)]'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {t(`type.${tp}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{t(`typeHint.${type}`)}</p>
          </div>

          {/* Tratamiento fiscal (solo INSTALLMENTS) */}
          {type === 'INSTALLMENTS' && (
            <div className="space-y-1.5">
              <Label>{t('fiscalModeLabel')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {(['SERVICE_RENDERED', 'ADVANCE'] as const).map((fm) => (
                  <button
                    key={fm}
                    type="button"
                    onClick={() => setFiscalMode(fm)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium',
                      fiscalMode === fm
                        ? 'border-transparent bg-[var(--brand-soft)] text-[var(--brand)]'
                        : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {t(`fiscalMode.${fm}`)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t(`fiscalModeHint.${fiscalMode}`)}
              </p>
            </div>
          )}

          {/* Cadencia + alcance */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bp-unit">{t('intervalUnitLabel')}</Label>
              <select
                id="bp-unit"
                value={intervalUnit}
                onChange={(e) => setIntervalUnit(e.target.value as (typeof INTERVALS)[number])}
                className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {INTERVALS.map((iv) => (
                  <option key={iv} value={iv}>
                    {t(`interval.${iv}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-count">{t('intervalCount')}</Label>
              <Input
                id="bp-count"
                inputMode="numeric"
                value={intervalCount}
                onChange={(e) => setIntervalCount(e.target.value)}
              />
            </div>
            {type === 'RECURRING' ? (
              <div className="space-y-1.5">
                <Label htmlFor="bp-occ">{t('occurrences')}</Label>
                <Input
                  id="bp-occ"
                  inputMode="numeric"
                  placeholder={t('openEnded')}
                  value={occurrences}
                  onChange={(e) => setOccurrences(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="bp-inst">{t('installmentCount')}</Label>
                <Input
                  id="bp-inst"
                  inputMode="numeric"
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(e.target.value)}
                />
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {type === 'RECURRING' ? t('occurrencesHint') : t('installmentCountHint')}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="bp-start">{t('startDate')}</Label>
              <Input
                id="bp-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-currency">{t('currency')}</Label>
              <select
                id="bp-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'EUR' | 'USD' | 'DOP')}
                className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="EUR">EUR €</option>
                <option value="USD">USD $</option>
                <option value="DOP">DOP RD$</option>
              </select>
            </div>
          </div>

          {/* Líneas de la plantilla */}
          <div className="space-y-2">
            <Label>{t('linesLabel')}</Label>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-6 space-y-1">
                  <Label className="text-xs">{t('lineDescription')}</Label>
                  <Input
                    value={line.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">{t('qty')}</Label>
                  <Input
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => setLine(i, { quantity: e.target.value })}
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">{t('unitPrice')}</Label>
                  <Input
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                  />
                </div>
                <div className="col-span-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setLines((ls) => [
                  ...ls,
                  { description: '', quantity: '1', unitPrice: '', taxCode: codes.taxCode },
                ])
              }
            >
              <Plus />
              {t('addLine')}
            </Button>
          </div>

          {codes.withholdingTaxCode && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withholding}
                onChange={(e) => setWithholding(e.target.checked)}
              />
              {t('applyWithholding')}
            </label>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bp-note">{t('noteOptional')}</Label>
            <Input id="bp-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {create.error && (
            <p className="text-sm text-[var(--danger)]">
              {errText(create.error, t('createError'))}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={create.isPending || !canSubmit}>
            {create.isPending && <Loader2 className="animate-spin" />}
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
