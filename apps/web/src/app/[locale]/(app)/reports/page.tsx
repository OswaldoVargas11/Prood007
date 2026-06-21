'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, BarChart3, Receipt } from 'lucide-react';
import { useAgedReceivables, useProfitability, useTaxSummary, useTimeByLawyer } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import type { TaxSummaryJurisdiction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Descarga un CSV a partir de filas (array de objetos planos). Comillas seguras. */
function downloadCsv(filename: string, rows: readonly object[]) {
  if (rows.length === 0) return;
  const data = rows as readonly Record<string, unknown>[];
  const headers = Object.keys(data[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    headers.join(','),
    ...data.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const t = useTranslations('reports');
  const locale = useLocale();
  const aged = useAgedReceivables();
  const time = useTimeByLawyer();
  const profit = useProfitability();
  const { user } = useAuth();

  const groups = aged.data?.byCurrency ?? [];
  const allItems = groups.flatMap((g) => g.items);
  // Honorarios por tiempo en la moneda BASE del despacho (no dependen de la moneda de cada factura).
  const cur = user?.tenant?.currency ?? 'EUR';

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="size-6 text-[var(--brand)]" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {/* Resumen fiscal para la gestoría */}
      <TaxSummaryCard />

      {/* Cartera vencida */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-[15px]">{t('aged.title')}</CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={allItems.length === 0}
            onClick={() => downloadCsv('cartera-vencida.csv', allItems)}
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {aged.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('aged.empty')}</p>
          ) : (
            groups.map((g) => (
              <div key={g.currency} className="space-y-4">
                {/* Encabezado de moneda (solo si hay más de una, para no añadir ruido). */}
                {groups.length > 1 && (
                  <div className="text-[13px] font-semibold text-muted-foreground">
                    {g.currency}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-4">
                  <Bucket
                    label={t('aged.current')}
                    value={g.buckets.current}
                    currency={g.currency}
                    locale={locale}
                  />
                  <Bucket
                    label={t('aged.d1_30')}
                    value={g.buckets.d1_30}
                    currency={g.currency}
                    locale={locale}
                  />
                  <Bucket
                    label={t('aged.d31_60')}
                    value={g.buckets.d31_60}
                    currency={g.currency}
                    locale={locale}
                  />
                  <Bucket
                    label={t('aged.d60plus')}
                    value={g.buckets.d60plus}
                    currency={g.currency}
                    locale={locale}
                    warn
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('aged.total')}:{' '}
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatMoney(g.totalOutstanding, g.currency, locale)}
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">{t('aged.invoice')}</th>
                        <th className="px-3 py-2">{t('client')}</th>
                        <th className="px-3 py-2 text-right">{t('aged.days')}</th>
                        <th className="px-3 py-2 text-right">{t('aged.outstanding')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it) => (
                        <tr key={it.number} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-mono text-xs">{it.number}</td>
                          <td className="px-3 py-2">{it.client}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.daysOverdue}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(it.outstanding, it.currency, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Tiempo por letrado */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-[15px]">{t('time.title')}</CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={!time.data || time.data.length === 0}
            onClick={() => downloadCsv('tiempo-por-letrado.csv', time.data ?? [])}
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {time.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (time.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('time.empty')}</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">{t('time.lawyer')}</th>
                    <th className="px-3 py-2 text-right">{t('time.hours')}</th>
                    <th className="px-3 py-2 text-right">{t('time.billedPct')}</th>
                    <th className="px-3 py-2 text-right">{t('time.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {time.data!.map((r) => (
                    <tr key={r.lawyerId} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.hours}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.billedPct}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(r.amount, cur, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rentabilidad por expediente */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-[15px]">{t('profit.title')}</CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={!profit.data?.matters.length}
            onClick={() => downloadCsv('rentabilidad.csv', profit.data?.matters ?? [])}
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {profit.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !profit.data?.matters.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('profit.empty')}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Kpi
                  label={t('profit.workValue')}
                  value={formatMoney(profit.data.totals.workValue, profit.data.currency, locale)}
                />
                <Kpi
                  label={t('profit.wip')}
                  value={formatMoney(profit.data.totals.wip, profit.data.currency, locale)}
                  hint={t('profit.wipHint')}
                />
                <Kpi
                  label={t('profit.billed')}
                  value={formatMoney(profit.data.totals.billed, profit.data.currency, locale)}
                />
                <Kpi
                  label={t('profit.collected')}
                  value={formatMoney(profit.data.totals.collected, profit.data.currency, locale)}
                />
              </div>
              {profit.data.costRatesSet ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Kpi
                    label={t('profit.cost')}
                    value={formatMoney(profit.data.totals.cost, profit.data.currency, locale)}
                    hint={t('profit.costHint')}
                  />
                  <Kpi
                    label={t('profit.margin')}
                    value={formatMoney(profit.data.totals.margin, profit.data.currency, locale)}
                    hint={`${profit.data.totals.marginPct ?? '—'}% · ${t('profit.marginHint')}`}
                  />
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground">
                  {t('profit.noCostRates')}
                </p>
              )}
              {profit.data.costRatesSet && profit.data.entriesMissingCost > 0 && (
                <p className="text-[12px] text-[var(--warning,#b45309)]">
                  {t('profit.missingCost', { n: profit.data.entriesMissingCost })}
                </p>
              )}
              <div className="flex flex-wrap gap-2 text-[12.5px]">
                <span className="rounded-md border border-border px-2.5 py-1">
                  {t('profit.realization')}:{' '}
                  <strong className="tabular-nums">
                    {profit.data.totals.realizationPct ?? '—'}%
                  </strong>
                </span>
                <span className="rounded-md border border-border px-2.5 py-1">
                  {t('profit.collection')}:{' '}
                  <strong className="tabular-nums">
                    {profit.data.totals.collectionPct ?? '—'}%
                  </strong>
                </span>
                {profit.data.costRatesSet && (
                  <span className="rounded-md border border-border px-2.5 py-1">
                    {t('profit.margin')}:{' '}
                    <strong className="tabular-nums">{profit.data.totals.marginPct ?? '—'}%</strong>
                  </span>
                )}
              </div>
              {profit.data.foreignInvoices > 0 && (
                <p className="text-[12px] text-muted-foreground">
                  {t('profit.foreignNote', { n: profit.data.foreignInvoices })}
                </p>
              )}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">{t('profit.matter')}</th>
                      <th className="px-3 py-2">{t('client')}</th>
                      <th className="px-3 py-2 text-right">{t('profit.hours')}</th>
                      <th className="px-3 py-2 text-right">{t('profit.workValue')}</th>
                      <th className="px-3 py-2 text-right">{t('profit.wip')}</th>
                      <th className="px-3 py-2 text-right">{t('profit.billed')}</th>
                      <th className="px-3 py-2 text-right">{t('profit.collected')}</th>
                      {profit.data.costRatesSet && (
                        <>
                          <th className="px-3 py-2 text-right">{t('profit.cost')}</th>
                          <th className="px-3 py-2 text-right">{t('profit.margin')}</th>
                        </>
                      )}
                      <th className="px-3 py-2 text-right">{t('profit.realization')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profit.data.matters.map((r) => (
                      <tr key={r.matterId} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
                        <td className="px-3 py-2">{r.client}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.hours}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(r.workValue, profit.data!.currency, locale)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(r.wip, profit.data!.currency, locale)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(r.billed, profit.data!.currency, locale)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(r.collected, profit.data!.currency, locale)}
                        </td>
                        {profit.data!.costRatesSet && (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatMoney(r.cost, profit.data!.currency, locale)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums ${r.margin < 0 ? 'text-[var(--danger)]' : ''}`}
                            >
                              {formatMoney(r.margin, profit.data!.currency, locale)}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.realizationPct ?? '—'}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Resumen fiscal por periodo para pasar a la gestoría (IVA/ITBIS repercutido, retención IRPF, 347). */
function TaxSummaryCard() {
  const t = useTranslations('reports');
  const locale = useLocale();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [quarter, setQuarter] = useState(0);
  const { data, isLoading } = useTaxSummary(year, quarter);
  const years = [thisYear, thisYear - 1, thisYear - 2];

  function taxLabel(j: TaxSummaryJurisdiction) {
    return j.jurisdiction === 'es' ? 'IVA' : 'ITBIS';
  }
  function exportCsv(j: TaxSummaryJurisdiction) {
    downloadCsv(
      `resumen-fiscal-${j.jurisdiction}-${year}${quarter ? `-T${quarter}` : ''}.csv`,
      j.byClient.map((c) => ({
        cliente: c.name,
        nif: c.taxId ?? '',
        base: c.base,
        [taxLabel(j).toLowerCase()]: c.tax,
        retencion_irpf: c.withheld,
        total: c.total,
      })),
    );
  }

  const jurisdictions = data?.jurisdictions ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Receipt className="size-5 text-[var(--brand)]" />
          <CardTitle className="text-[15px]">{t('tax.title')}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label={t('selectYear')}
            className="h-8 rounded-md border bg-[var(--surface-1)] px-2 text-[12.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={quarter}
            onChange={(e) => setQuarter(Number(e.target.value))}
            aria-label={t('selectQuarter')}
            className="h-8 rounded-md border bg-[var(--surface-1)] px-2 text-[12.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={0}>{t('tax.fullYear')}</option>
            <option value={1}>T1</option>
            <option value={2}>T2</option>
            <option value={3}>T3</option>
            <option value={4}>T4</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-[12.5px] text-muted-foreground">{t('tax.desc')}</p>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : jurisdictions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('tax.empty')}</p>
        ) : (
          jurisdictions.map((j) => (
            <div key={j.jurisdiction} className="space-y-4">
              {jurisdictions.length > 1 && (
                <div className="text-[13px] font-semibold text-muted-foreground">
                  {j.jurisdiction.toUpperCase()}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-4">
                <Kpi
                  label={t('tax.base')}
                  value={formatMoney(j.outputTax.base, j.currency, locale)}
                />
                <Kpi
                  label={`${taxLabel(j)} ${t('tax.output')}`}
                  value={formatMoney(j.outputTax.tax, j.currency, locale)}
                  hint={j.jurisdiction === 'es' ? t('tax.model303') : undefined}
                />
                <Kpi
                  label={t('tax.withholding')}
                  value={formatMoney(j.withholding.total, j.currency, locale)}
                  hint={j.jurisdiction === 'es' ? t('tax.model130') : undefined}
                />
                <Kpi label={t('tax.invoices')} value={String(j.outputTax.invoices)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-muted-foreground">{t('tax.byClient')}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={j.byClient.length === 0}
                  onClick={() => exportCsv(j)}
                >
                  <Download /> CSV
                </Button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">{t('client')}</th>
                      <th className="px-3 py-2">{t('tax.taxId')}</th>
                      <th className="px-3 py-2 text-right">{t('tax.base')}</th>
                      <th className="px-3 py-2 text-right">{taxLabel(j)}</th>
                      <th className="px-3 py-2 text-right">{t('tax.withholdingShort')}</th>
                      <th className="px-3 py-2 text-right">{t('tax.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {j.byClient.map((c) => {
                      const over347 =
                        j.jurisdiction === 'es' &&
                        quarter === 0 &&
                        c.total > (data?.threshold347 ?? Infinity);
                      return (
                        <tr key={c.clientId} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            {c.name}
                            {over347 && (
                              <span className="ml-2 rounded bg-[var(--brand-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--brand)]">
                                347
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {c.taxId ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(c.base, j.currency, locale)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(c.tax, j.currency, locale)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(c.withheld, j.currency, locale)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {formatMoney(c.total, j.currency, locale)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {j.jurisdiction === 'es' && quarter === 0 && (
                <p className="text-[11px] text-muted-foreground">{t('tax.note347')}</p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-[var(--surface-1)] p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Bucket({
  label,
  value,
  currency,
  locale,
  warn,
}: {
  label: string;
  value?: number;
  currency: string;
  locale: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-[var(--surface-1)] p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-[15px] font-semibold tabular-nums ${warn && (value ?? 0) > 0 ? 'text-[var(--danger)]' : ''}`}
      >
        {formatMoney(value ?? 0, currency, locale)}
      </div>
    </div>
  );
}
