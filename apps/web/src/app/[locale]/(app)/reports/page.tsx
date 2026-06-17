'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Download, BarChart3 } from 'lucide-react';
import { useAgedReceivables, useTimeByLawyer } from '@/lib/hooks';
import { formatMoney } from '@/lib/format';
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

  const cur = aged.data?.currency || 'EUR';

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="size-6 text-[var(--brand)]" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {/* Cartera vencida */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-[15px]">{t('aged.title')}</CardTitle>
          <Button
            size="sm"
            variant="outline"
            disabled={!aged.data || aged.data.items.length === 0}
            onClick={() => downloadCsv('cartera-vencida.csv', aged.data?.items ?? [])}
          >
            <Download /> CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {aged.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Bucket
                  label={t('aged.current')}
                  value={aged.data?.buckets.current}
                  currency={cur}
                  locale={locale}
                />
                <Bucket
                  label={t('aged.d1_30')}
                  value={aged.data?.buckets.d1_30}
                  currency={cur}
                  locale={locale}
                />
                <Bucket
                  label={t('aged.d31_60')}
                  value={aged.data?.buckets.d31_60}
                  currency={cur}
                  locale={locale}
                />
                <Bucket
                  label={t('aged.d60plus')}
                  value={aged.data?.buckets.d60plus}
                  currency={cur}
                  locale={locale}
                  warn
                />
              </div>
              <div className="text-sm text-muted-foreground">
                {t('aged.total')}:{' '}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatMoney(aged.data?.totalOutstanding ?? 0, cur, locale)}
                </span>
              </div>
              {(aged.data?.items.length ?? 0) > 0 && (
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
                      {aged.data!.items.map((it) => (
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
              )}
            </>
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
