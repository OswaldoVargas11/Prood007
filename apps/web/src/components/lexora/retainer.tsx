'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRightLeft, FileText, Loader2, Plus, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import {
  useInvoices,
  useMatterRetainer,
  useRetainerAnticipo,
  useRetainerApply,
  useRetainerDeposit,
  useRetainerFinalInvoice,
  useRetainerRefund,
  type InvoiceLineInput,
} from '@/lib/hooks';
import { defaultTaxCodes } from '@/lib/ledger';
import { formatMoney, formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api';
import type { BadgeProps } from '@/components/ui/badge';
import type { ProvisionKind, RetainerEntry, RetainerMovementType } from '@/lib/types';
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

const MOVEMENT_VARIANT: Record<RetainerMovementType, NonNullable<BadgeProps['variant']>> = {
  DEPOSIT: 'success',
  APPLICATION: 'info',
  REFUND: 'warning',
  ADJUSTMENT: 'secondary',
};

/** Mensaje de error legible: el del backend (i18n, p. ej. el bloqueo de anticipo) o un texto genérico. */
function errText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Provisión de fondos del expediente: saldo + movimientos + cobrar provisión/anticipo + aplicar. */
export function RetainerTab({ matterId }: { matterId: string }) {
  const t = useTranslations('retainer');
  const locale = useLocale();
  const { data, isLoading, isError, refetch } = useMatterRetainer(matterId);
  // El saldo de anticipo (ya facturado) NO se aplica como cobro (devengaría doble IVA): se realiza por
  // la factura final con deducción. Si el expediente tiene anticipo, «Aplicar a factura» queda bloqueado.
  const hasAnticipo = (data?.entries ?? []).some(
    (e) => e.type === 'DEPOSIT' && e.kind === 'ANTICIPO',
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        <div className="flex flex-wrap gap-2">
          <DepositDialog matterId={matterId} />
          <AnticipoDialog matterId={matterId} />
          <ApplyDialog matterId={matterId} hasAnticipo={hasAnticipo} />
        </div>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="size-4" />
            {t('balance')}
          </span>
          {data ? (
            <span className="text-2xl font-semibold tabular-nums text-[var(--success)]">
              {formatMoney(data.balance, data.currency ?? 'EUR', locale)}
            </span>
          ) : (
            <Skeleton className="h-8 w-28" />
          )}
        </CardContent>
      </Card>

      {/* Cierre del anticipo (D-027): solo cuando el expediente tiene anticipo facturado. */}
      {hasAnticipo && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-[var(--surface-2)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{t('closeTitle')}</p>
            <p className="text-[12px] text-muted-foreground">{t('closeHint')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FinalInvoiceDialog matterId={matterId} />
            <RefundDialog
              matterId={matterId}
              anticipoEntries={(data?.entries ?? []).filter(
                (e) => e.type === 'DEPOSIT' && e.kind === 'ANTICIPO',
              )}
            />
          </div>
        </div>
      )}

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && (
        <div className="space-y-2 py-8 text-center">
          <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            {t('retry')}
          </Button>
        </div>
      )}
      {!isLoading && !isError && data && data.entries.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('empty')}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.entries.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t('col.movement')}</th>
                <th className="px-4 py-2 font-medium">{t('col.detail')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('col.amount')}</th>
                <th className="px-4 py-2 font-medium">{t('col.date')}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => {
                const negative = Number(e.amount) < 0;
                return (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={MOVEMENT_VARIANT[e.type]}>{t(`movement.${e.type}`)}</Badge>
                        {e.kind && (
                          <span className="text-xs text-muted-foreground">
                            {t(`kind.${e.kind}`)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {e.note ?? (e.invoiceId ? t('linkedInvoice') : '—')}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums',
                        negative ? 'text-[var(--danger)]' : 'text-[var(--success)]',
                      )}
                    >
                      {negative ? '−' : '+'}
                      {formatMoney(Math.abs(Number(e.amount)), data.currency ?? 'EUR', locale)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatDate(e.createdAt, locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground">{t('hint')}</p>
    </div>
  );
}

/** Cobro de provisión NO fiscal: SUPLIDO (gasto por cuenta del cliente) o GENERICO (sin servicio aún). */
function DepositDialog({ matterId }: { matterId: string }) {
  const t = useTranslations('retainer');
  const deposit = useRetainerDeposit(matterId);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'SUPLIDO' | 'GENERICO'>('SUPLIDO');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  function submit() {
    if (!amount) return;
    deposit.mutate(
      { amount, kind, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setAmount('');
          setNote('');
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus />
        {t('deposit')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('depositTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('kindLabel')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {(['SUPLIDO', 'GENERICO'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    kind === k
                      ? 'border-transparent bg-[var(--brand-soft)] text-[var(--brand)]'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {t(`kind.${k}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{t(`kindHint.${kind}`)}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-amount">{t('amount')}</Label>
            <Input
              id="dep-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-note">{t('noteOptional')}</Label>
            <Input id="dep-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {deposit.error && (
            <p className="text-sm text-[var(--danger)]">
              {errText(deposit.error, t('depositError'))}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={deposit.isPending || !amount}>
            {deposit.isPending && <Loader2 className="animate-spin" />}
            {t('charge')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cobro de ANTICIPO de honorarios: emite la factura de anticipo (Verifactu/e-CF) y acredita el saldo. */
function AnticipoDialog({ matterId }: { matterId: string }) {
  const t = useTranslations('retainer');
  const { user } = useAuth();
  const router = useRouter();
  const anticipo = useRetainerAnticipo(matterId);
  const codes = defaultTaxCodes(user?.jurisdiction ?? 'es');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [withholding, setWithholding] = useState(false);

  function submit() {
    if (!amount) return;
    anticipo.mutate(
      {
        amount,
        description: description.trim() || undefined,
        withholdingTaxCode: withholding ? codes.withholdingTaxCode : undefined,
      },
      {
        onSuccess: () => {
          setAmount('');
          setDescription('');
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileText />
        {t('anticipo')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('anticipoTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">{t('anticipoHint')}</p>
          <div className="space-y-1.5">
            <Label htmlFor="ant-amount">{t('anticipoBase')}</Label>
            <Input
              id="ant-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ant-desc">{t('descriptionOptional')}</Label>
            <Input
              id="ant-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
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
          {anticipo.isSuccess && (
            <button
              type="button"
              onClick={() => router.push(`/invoices/${anticipo.data.invoiceId}`)}
              className="flex w-full items-center justify-between rounded-md border border-[var(--success)]/40 bg-[var(--success)]/5 px-3 py-2 text-sm hover:underline"
            >
              <span className="flex items-center gap-1.5 text-[var(--success)]">
                <FileText className="size-3.5" />
                {t('anticipoIssued', { number: anticipo.data.number })}
              </span>
              <span className="tabular-nums text-muted-foreground">{t('viewInvoice')} →</span>
            </button>
          )}
          {anticipo.error && (
            <p className="text-sm text-[var(--danger)]">
              {errText(anticipo.error, t('anticipoError'))}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={anticipo.isPending || !amount}>
            {anticipo.isPending && <Loader2 className="animate-spin" />}
            {t('issueAnticipo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Aplica saldo de provisión (SUPLIDO/GENERICO) al cobro de una factura pendiente. Si el expediente tiene
 * saldo de ANTICIPO (ya facturado), aplicarlo como cobro lo bloquea el backend (evita doble IVA): el
 * anticipo se realiza por la factura final con deducción. Se avisa y se deshabilita la acción.
 */
function ApplyDialog({ matterId, hasAnticipo }: { matterId: string; hasAnticipo: boolean }) {
  const t = useTranslations('retainer');
  const locale = useLocale();
  const apply = useRetainerApply(matterId);
  const { data: invoices } = useInvoices();
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');

  // Facturas del expediente con pendiente de cobro (no PAID/CANCELLED).
  const payable = (invoices ?? []).filter(
    (i) =>
      i.matter?.id === matterId &&
      i.status !== 'PAID' &&
      i.status !== 'CANCELLED' &&
      Number(i.total) - Number(i.amountPaid) > 0,
  );

  function submit() {
    if (!invoiceId) return;
    apply.mutate(
      { invoiceId, amount: amount.trim() || undefined },
      {
        onSuccess: () => {
          setAmount('');
          setInvoiceId('');
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <ArrowRightLeft />
        {t('apply')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('applyTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {hasAnticipo ? (
            <p className="rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/5 px-3 py-2 text-sm text-muted-foreground">
              {t('applyAnticipoBlocked')}
            </p>
          ) : payable.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('noInvoices')}</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="apply-invoice">{t('selectInvoice')}</Label>
                <select
                  id="apply-invoice"
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">{t('selectInvoicePlaceholder')}</option>
                  {payable.map((i) => {
                    const outstanding = (Number(i.total) - Number(i.amountPaid)).toFixed(2);
                    return (
                      <option key={i.id} value={i.id}>
                        {i.number} · {formatMoney(outstanding, i.currency, locale)}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="apply-amount">{t('amountOptional')}</Label>
                <Input
                  id="apply-amount"
                  inputMode="decimal"
                  placeholder={t('amountFullPlaceholder')}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">{t('applyHint')}</p>
              {apply.error && (
                <p className="text-sm text-[var(--danger)]">
                  {errText(apply.error, t('applyError'))}
                </p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={submit}
            disabled={apply.isPending || !invoiceId || payable.length === 0 || hasAnticipo}
          >
            {apply.isPending && <Loader2 className="animate-spin" />}
            {t('applyAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Factura FINAL de cierre con DEDUCCIÓN del anticipo (R3b): se factura el servicio completo y el backend
 * añade las líneas negativas que neutralizan los anticipos del expediente (sin doble IVA). El IVA
 * acumulado = IVA del total; los anticipos quedan inmutables.
 */
function FinalInvoiceDialog({ matterId }: { matterId: string }) {
  const t = useTranslations('retainer');
  const { user } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const final = useRetainerFinalInvoice(matterId);
  const codes = defaultTaxCodes(user?.jurisdiction ?? 'es');
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<InvoiceLineInput[]>([
    { description: '', quantity: '1', unitPrice: '', taxCode: codes.taxCode },
  ]);
  const [withholding, setWithholding] = useState(false);

  function setLine(i: number, patch: Partial<InvoiceLineInput>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function submit() {
    const valid = lines.filter((l) => l.description.trim() && l.unitPrice);
    if (valid.length === 0) return;
    final.mutate({
      lines: valid,
      withholdingTaxCode: withholding ? codes.withholdingTaxCode : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FileText />
        {t('finalInvoice')}
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('finalInvoiceTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">{t('finalInvoiceHint')}</p>
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

          {final.isSuccess && (
            <button
              type="button"
              onClick={() => router.push(`/invoices/${final.data.invoiceId}`)}
              className="w-full space-y-0.5 rounded-md border border-[var(--success)]/40 bg-[var(--success)]/5 px-3 py-2 text-left text-sm hover:underline"
            >
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[var(--success)]">
                  <FileText className="size-3.5" />
                  {t('finalIssued', { number: final.data.number })}
                </span>
                <span className="text-muted-foreground">{t('viewInvoice')} →</span>
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('finalNet', {
                  total: formatMoney(
                    final.data.total,
                    user?.jurisdiction === 'do' ? 'DOP' : 'EUR',
                    locale,
                  ),
                  count: final.data.deducted.length,
                })}
              </span>
            </button>
          )}
          {final.error && (
            <p className="text-sm text-[var(--danger)]">
              {errText(final.error, t('finalInvoiceError'))}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={final.isPending}>
            {final.isPending && <Loader2 className="animate-spin" />}
            {t('issueFinal')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Devolución de un anticipo facturado (R3c): emite una factura RECTIFICATIVA por sustitución que reversa
 * el anticipo y registra un REFUND(−). La factura de anticipo queda inmutable.
 */
function RefundDialog({
  matterId,
  anticipoEntries,
}: {
  matterId: string;
  anticipoEntries: RetainerEntry[];
}) {
  const t = useTranslations('retainer');
  const router = useRouter();
  const refund = useRetainerRefund(matterId);
  const { data: invoices } = useInvoices();
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [reason, setReason] = useState('');

  const numberById = new Map((invoices ?? []).map((i) => [i.id, i.number]));
  const anticipoInvoices = anticipoEntries
    .map((e) => e.invoiceId)
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ id, number: numberById.get(id) ?? id }));

  function submit() {
    if (!invoiceId || reason.trim().length < 3) return;
    refund.mutate({ anticipoInvoiceId: invoiceId, reason: reason.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw />
        {t('refund')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('refundTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">{t('refundHint')}</p>
          <div className="space-y-1.5">
            <Label htmlFor="refund-invoice">{t('selectAnticipo')}</Label>
            <select
              id="refund-invoice"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t('selectAnticipoPlaceholder')}</option>
              {anticipoInvoices.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.number}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">{t('refundReason')}</Label>
            <Input
              id="refund-reason"
              value={reason}
              placeholder={t('refundReasonPlaceholder')}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {refund.isSuccess && (
            <button
              type="button"
              onClick={() => router.push(`/invoices/${refund.data.invoiceId}`)}
              className="flex w-full items-center justify-between rounded-md border border-[var(--success)]/40 bg-[var(--success)]/5 px-3 py-2 text-sm hover:underline"
            >
              <span className="flex items-center gap-1.5 text-[var(--success)]">
                <FileText className="size-3.5" />
                {t('refundIssued', { number: refund.data.number })}
              </span>
              <span className="text-muted-foreground">{t('viewInvoice')} →</span>
            </button>
          )}
          {refund.error && (
            <p className="text-sm text-[var(--danger)]">
              {errText(refund.error, t('refundError'))}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={submit}
            disabled={refund.isPending || !invoiceId || reason.trim().length < 3}
          >
            {refund.isPending && <Loader2 className="animate-spin" />}
            {t('issueRefund')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
