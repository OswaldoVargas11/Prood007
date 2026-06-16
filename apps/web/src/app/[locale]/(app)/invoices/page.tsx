'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useInvoices } from '@/lib/hooks';
import { useRouter } from '@/i18n/navigation';
import { invoiceStatusVariant } from '@/lib/ledger';
import { formatDate, formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DunningRunButton } from '@/components/lexora/dunning';
import { cn } from '@/lib/utils';
import type { InvoiceStatus } from '@/lib/types';

type FilterKey = 'all' | 'overdue' | 'partial' | 'paid';

const FILTERS: { key: FilterKey; status?: InvoiceStatus; overdue?: boolean }[] = [
  { key: 'all' },
  { key: 'overdue', overdue: true },
  { key: 'partial', status: 'PARTIAL' },
  { key: 'paid', status: 'PAID' },
];

/**
 * Vista global de facturas sobre `GET /ledger/invoices` (listado real, acotado al tenant por RLS).
 * Filtros por estado y por vencimiento; la columna de estado muestra "Vencida" en lectura cuando la
 * factura superó su `dueDate` sin esperar al scheduler de dunning.
 */
export default function InvoicesOverviewPage() {
  const t = useTranslations('invoicesOverview');
  const tStatus = useTranslations('billing.invoiceStatus');
  const locale = useLocale();
  const router = useRouter();

  const [filter, setFilter] = useState<FilterKey>('all');
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const query = useInvoices({ status: active.status, overdue: active.overdue });
  const rows = query.data ?? [];

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
        </div>
        <DunningRunButton />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors',
              filter === f.key
                ? 'border-transparent bg-[var(--brand)] text-white'
                : 'bg-card text-muted-foreground hover:bg-accent/60',
            )}
          >
            {t(`filter.${f.key}`)}
          </button>
        ))}
      </div>

      {query.isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
      {query.isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}

      {!query.isLoading && !query.isError && rows.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          {filter === 'all' ? t('empty') : t('emptyFiltered')}
        </div>
      )}

      {!query.isLoading && !query.isError && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid grid-cols-[1.1fr_1.4fr_0.85fr_0.85fr_0.85fr_auto] gap-3 border-b px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            <span>{t('colNumber')}</span>
            <span>{t('colClient')}</span>
            <span className="text-right">{t('colDate')}</span>
            <span className="text-right">{t('colDue')}</span>
            <span className="text-right">{t('colTotal')}</span>
            <span className="text-right">{t('colStatus')}</span>
          </div>
          {rows.map((invoice) => {
            const displayStatus: InvoiceStatus = invoice.overdue ? 'OVERDUE' : invoice.status;
            return (
              <button
                key={invoice.id}
                type="button"
                onClick={() => router.push(`/invoices/${invoice.id}`)}
                className="grid w-full grid-cols-[1.1fr_1.4fr_0.85fr_0.85fr_0.85fr_auto] items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/60"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-[12.5px] font-medium">
                    {invoice.number}
                  </div>
                  <div className="font-mono text-[10.5px] text-[var(--text-subtle)]">
                    {invoice.matter?.reference ?? '—'}
                  </div>
                </div>
                <span className="truncate text-[12.5px] text-muted-foreground">
                  {invoice.client?.name ?? '—'}
                </span>
                <span className="text-right text-[12px] tabular-nums text-muted-foreground">
                  {formatDate(invoice.issueDate, locale)}
                </span>
                <span
                  className={cn(
                    'text-right text-[12px] tabular-nums',
                    invoice.overdue
                      ? 'font-semibold text-[var(--danger)]'
                      : 'text-muted-foreground',
                  )}
                >
                  {invoice.dueDate ? formatDate(invoice.dueDate, locale) : '—'}
                </span>
                <span className="text-right text-[12.5px] font-semibold tabular-nums">
                  {formatMoney(invoice.total, invoice.currency, locale)}
                </span>
                <span className="text-right">
                  <Badge variant={invoiceStatusVariant(displayStatus)}>
                    {tStatus(displayStatus)}
                  </Badge>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
