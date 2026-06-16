'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRightLeft, FileText, Loader2, Plus, Wallet } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import {
  useInvoices,
  useMatterRetainer,
  useRetainerAnticipo,
  useRetainerApply,
  useRetainerDeposit,
} from '@/lib/hooks';
import { defaultTaxCodes } from '@/lib/ledger';
import { formatMoney, formatDate } from '@/lib/format';
import type { BadgeProps } from '@/components/ui/badge';
import type { ProvisionKind, RetainerMovementType } from '@/lib/types';
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

/** Provisión de fondos del expediente: saldo + movimientos + cobrar provisión/anticipo + aplicar. */
export function RetainerTab({ matterId }: { matterId: string }) {
  const t = useTranslations('retainer');
  const locale = useLocale();
  const { data, isLoading, isError, refetch } = useMatterRetainer(matterId);
  const currency = data?.currency ?? undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        <div className="flex flex-wrap gap-2">
          <DepositDialog matterId={matterId} />
          <AnticipoDialog matterId={matterId} />
          <ApplyDialog matterId={matterId} currency={currency} />
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
          {deposit.isError && <p className="text-sm text-[var(--danger)]">{t('depositError')}</p>}
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
          {anticipo.isError && <p className="text-sm text-[var(--danger)]">{t('anticipoError')}</p>}
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

/** Aplica saldo de provisión (SUPLIDO/GENERICO) al cobro de una factura pendiente del expediente. */
function ApplyDialog({ matterId, currency }: { matterId: string; currency?: string }) {
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
          {payable.length === 0 ? (
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
              {apply.isError && <p className="text-sm text-[var(--danger)]">{t('applyError')}</p>}
            </>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={apply.isPending || !invoiceId || payable.length === 0}>
            {apply.isPending && <Loader2 className="animate-spin" />}
            {t('applyAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
