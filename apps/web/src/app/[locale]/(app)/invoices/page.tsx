'use client';

import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMatters } from '@/lib/hooks';
import { useRouter } from '@/i18n/navigation';
import { formatDate, formatMoney } from '@/lib/format';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Invoice, InvoiceStatus, Matter, MatterLedger } from '@/lib/types';

function statusVariant(status: InvoiceStatus): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'DRAFT':
      return 'secondary';
    case 'ISSUED':
    case 'SENT':
      return 'info';
    case 'PAID':
      return 'success';
    case 'CANCELLED':
      return 'danger';
  }
}

/**
 * Vista global de facturas. No hay endpoint firm-wide; reunimos los `invoiceId` de los apuntes INVOICE
 * de cada expediente (`GET /ledger/matter/:id`) y traemos cada factura (`GET /ledger/invoices/:id`).
 * Tanda A: solo frontend, sin mock. Cada fila enlaza al detalle de la factura.
 */
export default function InvoicesOverviewPage() {
  const t = useTranslations('invoicesOverview');
  const tStatus = useTranslations('billing.invoiceStatus');
  const locale = useLocale();
  const router = useRouter();

  const mattersQuery = useMatters({ pageSize: 100 });
  const matters = useMemo<Matter[]>(() => mattersQuery.data?.items ?? [], [mattersQuery.data]);

  const ledgerQueries = useQueries({
    queries: matters.map((m) => ({
      queryKey: ['ledger', m.id],
      queryFn: () => api.get<MatterLedger>(`/ledger/matter/${m.id}`),
      enabled: matters.length > 0,
    })),
  });

  // {invoiceId, matterId, matterRef} a partir de los apuntes INVOICE.
  const invoiceRefs = useMemo(() => {
    const out: { invoiceId: string; matterRef: string }[] = [];
    ledgerQueries.forEach((q, i) => {
      const matter = matters[i];
      if (!matter || !q.data) return;
      for (const e of q.data.entries) {
        if (e.type === 'INVOICE' && e.invoiceId) {
          out.push({ invoiceId: e.invoiceId, matterRef: matter.reference });
        }
      }
    });
    return out;
  }, [ledgerQueries, matters]);

  const invoiceQueries = useQueries({
    queries: invoiceRefs.map((r) => ({
      queryKey: ['invoice', r.invoiceId],
      queryFn: () => api.get<Invoice>(`/ledger/invoices/${r.invoiceId}`),
      enabled: invoiceRefs.length > 0,
    })),
  });

  const rows = useMemo(() => {
    return invoiceQueries
      .map((q, i) =>
        q.data ? { invoice: q.data, matterRef: invoiceRefs[i]?.matterRef ?? '' } : null,
      )
      .filter((r): r is { invoice: Invoice; matterRef: string } => r !== null)
      .sort((a, b) => b.invoice.issueDate.localeCompare(a.invoice.issueDate));
  }, [invoiceQueries, invoiceRefs]);

  const loading =
    mattersQuery.isLoading ||
    (matters.length > 0 && ledgerQueries.some((q) => q.isLoading)) ||
    (invoiceRefs.length > 0 && invoiceQueries.some((q) => q.isLoading));
  const isError = mattersQuery.isError;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
      </div>

      {loading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}

      {!loading && !isError && rows.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      )}

      {!loading && !isError && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid grid-cols-[1.1fr_1.4fr_0.9fr_0.9fr_auto] gap-3 border-b px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            <span>{t('colNumber')}</span>
            <span>{t('colClient')}</span>
            <span className="text-right">{t('colDate')}</span>
            <span className="text-right">{t('colTotal')}</span>
            <span className="text-right">{t('colStatus')}</span>
          </div>
          {rows.map(({ invoice, matterRef }) => (
            <button
              key={invoice.id}
              type="button"
              onClick={() => router.push(`/invoices/${invoice.id}`)}
              className="grid w-full grid-cols-[1.1fr_1.4fr_0.9fr_0.9fr_auto] items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-[12.5px] font-medium">{invoice.number}</div>
                <div className="font-mono text-[10.5px] text-[var(--text-subtle)]">{matterRef}</div>
              </div>
              <span className="truncate text-[12.5px] text-muted-foreground">
                {invoice.client?.name ?? '—'}
              </span>
              <span className="text-right text-[12px] tabular-nums text-muted-foreground">
                {formatDate(invoice.issueDate, locale)}
              </span>
              <span className="text-right text-[12.5px] font-semibold tabular-nums">
                {formatMoney(invoice.total, invoice.currency, locale)}
              </span>
              <span className="text-right">
                <Badge variant={statusVariant(invoice.status)}>{tStatus(invoice.status)}</Badge>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
