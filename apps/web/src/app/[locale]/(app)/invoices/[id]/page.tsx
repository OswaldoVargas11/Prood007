'use client';

import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useInvoice, usePayInvoice } from '@/lib/hooks';
import { invoiceStatusVariant } from '@/lib/ledger';
import { formatMoney, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('billing');
  const locale = useLocale();
  const { data: inv, isLoading, isError, refetch } = useInvoice(id);
  const pay = usePayInvoice(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError || !inv) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 py-12 text-center">
        <p className="text-sm text-[var(--danger)]">{t('invoiceLoadError')}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const isVerifactu = inv.complianceFormat === 'VERIFACTU';
  const money = (v: string) => formatMoney(v, inv.currency, locale);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-medium">{inv.number}</span>
            <Badge variant={invoiceStatusVariant(inv.status)}>
              {t(`invoiceStatus.${inv.status}`)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('issued')}: {formatDate(inv.issueDate, locale)}
          </p>
        </div>
        {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
          <Button size="sm" onClick={() => pay.mutate()} disabled={pay.isPending}>
            {pay.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {t('markPaid')}
          </Button>
        )}
      </div>

      {inv.client && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t('buyer')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-medium">{inv.client.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{inv.client.taxId}</div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">{t('lineDescription')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('qty')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('unitPrice')}</th>
              <th className="px-4 py-2 text-right font-medium">{t('lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.quantity}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(l.unitPrice)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t border-border p-4 text-sm">
          <Row label={t('taxableBase')} value={money(inv.taxableBase)} />
          <Row label={t('taxAmount')} value={money(inv.taxAmount)} />
          {Number(inv.withholdingAmount) > 0 && (
            <Row label={t('withholding')} value={`− ${money(inv.withholdingAmount)}`} />
          )}
          <Row label={t('total')} value={money(inv.total)} strong />
        </div>
      </Card>

      {/* Bloque de cumplimiento real (Verifactu / e-CF) que devuelve el backend */}
      {inv.complianceFormat && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              {t('compliance')}
              <Badge variant={isVerifactu ? 'info' : 'violet'}>
                {isVerifactu ? 'Verifactu · AEAT' : 'e-CF · DGII'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {inv.recordHash && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('recordHash')}
                </div>
                <div className="break-all font-mono text-xs">{inv.recordHash}</div>
              </div>
            )}
            {inv.previousRecordHash && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('previousHash')}
                </div>
                <div className="break-all font-mono text-xs text-muted-foreground">
                  {inv.previousRecordHash}
                </div>
              </div>
            )}
            {inv.complianceRecord && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('record')}
                </div>
                <pre className="mt-1 max-h-72 overflow-auto rounded-md border border-border bg-[var(--surface-2)] p-3 font-mono text-[11px] leading-relaxed">
                  {JSON.stringify(inv.complianceRecord, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Link
        href="/dashboard"
        className="inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t('backDashboard')}
      </Link>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className={strong ? 'text-base font-semibold tabular-nums' : 'tabular-nums'}>
        {value}
      </span>
    </div>
  );
}
