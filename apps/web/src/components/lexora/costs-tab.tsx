'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import {
  useAddLedgerEntry,
  useAddTimeEntry,
  useCreateInvoice,
  useInvoicePreview,
  useMatterLedger,
  type InvoiceLineInput,
  type PreviewLineInput,
} from '@/lib/hooks';
import { BALANCE_SIGN, defaultTaxCodes, entryTypeVariant, MANUAL_ENTRY_TYPES } from '@/lib/ledger';
import { formatMoney, formatDate } from '@/lib/format';
import type { LedgerEntryType } from '@/lib/types';
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

export function CostsTab({ matterId }: { matterId: string }) {
  const t = useTranslations('billing');
  const tType = useTranslations('billing.type');
  const locale = useLocale();
  const { data, isLoading, isError, refetch } = useMatterLedger(matterId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EntryDialog matterId={matterId} />
          <TimeDialog matterId={matterId} />
          <InvoiceDialog matterId={matterId} currency={data?.currency} />
        </div>
      </div>

      {/* Saldo */}
      {data && (
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <span className="text-sm text-muted-foreground">{t('balance')}</span>
            <span
              className={cn(
                'text-2xl font-semibold tabular-nums',
                Number(data.balance) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]',
              )}
            >
              {formatMoney(data.balance, data.currency, locale)}
            </span>
          </CardContent>
        </Card>
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
      {!isLoading && !isError && data?.entries.length === 0 && (
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
                <th className="px-4 py-2 font-medium">{t('col.type')}</th>
                <th className="px-4 py-2 font-medium">{t('col.description')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('col.amount')}</th>
                <th className="px-4 py-2 font-medium">{t('col.date')}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => {
                const sign = BALANCE_SIGN[e.type];
                return (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <Badge variant={entryTypeVariant(e.type)}>{tType(e.type)}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      {e.invoiceId ? (
                        <InvoiceLink invoiceId={e.invoiceId} label={e.description} />
                      ) : (
                        e.description
                      )}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums',
                        sign > 0 && 'text-[var(--success)]',
                        sign < 0 && 'text-[var(--danger)]',
                      )}
                    >
                      {sign < 0 ? '−' : sign > 0 ? '+' : ''}
                      {formatMoney(e.amount, e.currency, locale)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatDate(e.occurredAt, locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function InvoiceLink({ invoiceId, label }: { invoiceId: string; label: string }) {
  const router = useRouter();
  return (
    <button
      className="inline-flex items-center gap-1.5 text-[var(--brand)] hover:underline"
      onClick={() => router.push(`/invoices/${invoiceId}`)}
    >
      <FileText className="size-3.5" />
      {label}
    </button>
  );
}

function EntryDialog({ matterId }: { matterId: string }) {
  const t = useTranslations('billing');
  const tType = useTranslations('billing.type');
  const add = useAddLedgerEntry(matterId);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LedgerEntryType>('PROVISION');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  function submit() {
    if (!amount || !description.trim()) return;
    add.mutate(
      { type, amount, description: description.trim() },
      {
        onSuccess: () => {
          setAmount('');
          setDescription('');
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus />
        {t('newEntry')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newEntry')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('col.type')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {MANUAL_ENTRY_TYPES.map((tp) => (
                <button
                  key={tp}
                  onClick={() => setType(tp)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    type === tp
                      ? 'border-transparent bg-[var(--brand-soft)] text-[var(--brand)]'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {tType(tp)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">{t('amount')}</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">{t('description')}</Label>
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {add.isError && <p className="text-sm text-[var(--danger)]">{t('entryError')}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={add.isPending || !amount || !description.trim()}>
            {add.isPending && <Loader2 className="animate-spin" />}
            {t('add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimeDialog({ matterId }: { matterId: string }) {
  const t = useTranslations('billing');
  const add = useAddTimeEntry(matterId);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [minutes, setMinutes] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [workedAt, setWorkedAt] = useState(new Date().toISOString().slice(0, 10));

  function submit() {
    if (!description.trim() || !minutes || !hourlyRate) return;
    add.mutate(
      { description: description.trim(), minutes: Number(minutes), hourlyRate, workedAt },
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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus />
        {t('logTime')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('logTime')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">{t('description')}</Label>
            <Input
              id="t-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-min">{t('minutes')}</Label>
              <Input
                id="t-min"
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-rate">{t('hourlyRate')}</Label>
              <Input
                id="t-rate"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-date">{t('workedAt')}</Label>
              <Input
                id="t-date"
                type="date"
                value={workedAt}
                onChange={(e) => setWorkedAt(e.target.value)}
              />
            </div>
          </div>
          {add.isError && <p className="text-sm text-[var(--danger)]">{t('entryError')}</p>}
        </div>
        <DialogFooter>
          <Button
            onClick={submit}
            disabled={add.isPending || !description.trim() || !minutes || !hourlyRate}
          >
            {add.isPending && <Loader2 className="animate-spin" />}
            {t('add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ matterId, currency }: { matterId: string; currency?: string }) {
  const t = useTranslations('billing');
  const { user } = useAuth();
  const router = useRouter();
  const create = useCreateInvoice(matterId);
  const [open, setOpen] = useState(false);
  // El despacho elige formato fiscal (es/do) y moneda POR FACTURA. El formato fija los códigos de
  // impuesto de las líneas (IVA/IRPF en ES · ITBIS en RD); por defecto, los del propio despacho.
  const [format, setFormatState] = useState<'es' | 'do'>(user?.jurisdiction ?? 'es');
  const [selectedCurrency, setSelectedCurrency] = useState<'EUR' | 'USD' | 'DOP'>(
    (currency as 'EUR' | 'USD' | 'DOP') ?? 'EUR',
  );
  const codes = defaultTaxCodes(format);
  const [lines, setLines] = useState<InvoiceLineInput[]>([
    { description: '', quantity: '1', unitPrice: '', taxCode: codes.taxCode },
  ]);
  const [withholding, setWithholding] = useState(Boolean(codes.withholdingTaxCode));

  const withholdingTaxCode = withholding ? codes.withholdingTaxCode : undefined;

  // Cambiar de formato reescribe los códigos de impuesto de todas las líneas al del nuevo formato.
  function changeFormat(next: 'es' | 'do') {
    const nc = defaultTaxCodes(next);
    setFormatState(next);
    setLines((ls) => ls.map((l) => ({ ...l, taxCode: nc.taxCode })));
    setWithholding(Boolean(nc.withholdingTaxCode));
  }

  function setLine(i: number, patch: Partial<InvoiceLineInput>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function submit() {
    const valid = lines.filter((l) => l.description.trim() && l.unitPrice);
    if (valid.length === 0) return;
    create.mutate(
      {
        lines: valid,
        withholdingTaxCode,
        currency: selectedCurrency,
        invoiceFormat: format,
      },
      { onSuccess: (data) => router.push(`/invoices/${data.invoice.id}`) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FileText />
        {t('newInvoice')}
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('newInvoice')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Formato fiscal + moneda de la factura (elegibles por el despacho). */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('invoiceFormat')}</Label>
              <select
                value={format}
                onChange={(e) => changeFormat(e.target.value as 'es' | 'do')}
                className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="es">{t('formatES')}</option>
                <option value="do">{t('formatDO')}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('invoiceCurrency')}</Label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value as 'EUR' | 'USD' | 'DOP')}
                className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="EUR">EUR €</option>
                <option value="USD">USD $</option>
                <option value="DOP">DOP RD$</option>
              </select>
            </div>
          </div>
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

          <LivePreview
            lines={lines}
            withholdingTaxCode={withholdingTaxCode}
            currency={selectedCurrency}
            invoiceFormat={format}
          />
          {create.isError && <p className="text-sm text-[var(--danger)]">{t('invoiceError')}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />}
            {t('issue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Retrasa un valor para no llamar al pre-cálculo en cada pulsación de tecla. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Preview fiscal en vivo: a medida que se editan las líneas, el servidor recalcula base/IVA/IRPF
 * (ES) o ITBIS (RD) con la MISMA matemática que la emisión real. La UI no calcula impuestos.
 */
function LivePreview({
  lines,
  withholdingTaxCode,
  currency,
  invoiceFormat,
}: {
  lines: InvoiceLineInput[];
  withholdingTaxCode?: string;
  currency?: string;
  invoiceFormat?: 'es' | 'do';
}) {
  const t = useTranslations('billing');
  const locale = useLocale();

  // Solo cuentan las líneas con cantidad y precio numéricos; la descripción no afecta a la matemática.
  const previewLines: PreviewLineInput[] = lines
    .filter(
      (l) =>
        Number.isFinite(Number(l.quantity)) &&
        l.unitPrice !== '' &&
        Number.isFinite(Number(l.unitPrice)),
    )
    .map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, taxCode: l.taxCode }));

  const debounced = useDebouncedValue(
    JSON.stringify({ previewLines, withholdingTaxCode: withholdingTaxCode ?? null }),
    300,
  );
  const parsed = JSON.parse(debounced) as {
    previewLines: PreviewLineInput[];
    withholdingTaxCode: string | null;
  };
  const { data, isFetching, isError } = useInvoicePreview(
    parsed.previewLines,
    parsed.withholdingTaxCode ?? undefined,
    parsed.previewLines.length > 0,
    invoiceFormat,
  );

  const money = (v: string) => (currency ? formatMoney(v, currency, locale) : v);
  const complianceLabel = data?.format === 'ECF' ? 'e-CF · DGII' : 'Verifactu · AEAT';

  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('livePreview')}
          {isFetching && <Loader2 className="size-3 animate-spin" />}
        </span>
        {data && (
          <Badge variant={data.format === 'ECF' ? 'violet' : 'info'}>{complianceLabel}</Badge>
        )}
      </div>

      {parsed.previewLines.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('previewHint')}</p>
      ) : isError ? (
        <p className="text-xs text-[var(--danger)]">{t('previewError')}</p>
      ) : data ? (
        <div className="space-y-1">
          <PreviewRow label={t('taxableBase')} value={money(data.totals.taxableBase)} />
          <PreviewRow label={t('taxAmount')} value={money(data.totals.taxAmount)} />
          {Number(data.totals.withholdingAmount) > 0 && (
            <PreviewRow
              label={t('withholding')}
              value={`− ${money(data.totals.withholdingAmount)}`}
            />
          )}
          <PreviewRow label={t('total')} value={money(data.totals.total)} strong />
        </div>
      ) : (
        <Skeleton className="h-16 w-full" />
      )}
    </div>
  );
}

function PreviewRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{value}</span>
    </div>
  );
}
