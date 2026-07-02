'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Download } from 'lucide-react';
import { useFiscalReport, downloadFiscalReport } from '@/lib/hooks';
import { formatMoney } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import type { FiscalReportBlock } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

/** Etiqueta legible de un concepto fiscal a partir del código + tipo (agnóstica de i18n). */
function conceptLabel(code: string, ratePercent: string): string {
  const pct = `${ratePercent}%`;
  if (code.startsWith('IVA')) return `IVA ${pct}`;
  if (code.startsWith('ITBIS')) return `ITBIS ${pct}`;
  if (code.startsWith('IRPF')) return `IRPF ${pct}`;
  return `${code} ${pct}`;
}

function blockTitle(b: FiscalReportBlock): string {
  if (b.format === 'es') return `España · Verifactu (${b.currency})`;
  if (b.format === 'do') return `República Dominicana · e-CF (${b.currency})`;
  return `${b.format.toUpperCase()} · ${b.recordFormat} (${b.currency})`;
}

/**
 * Informe fiscal por periodo (sección Facturación): base, impuesto repercutido POR TIPO, retención IRPF
 * y desglose por serie, con selector de periodo (año · trimestre · mes) y export a PDF / Excel. Solo
 * lectura sobre las facturas emitidas del despacho. Precursor del modelo 303 (ES) y declaraciones DGII.
 */
export default function FiscalReportPage() {
  const t = useTranslations('fiscalReport');
  const locale = useLocale();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [quarter, setQuarter] = useState(0);
  const [month, setMonth] = useState(0);
  const [downloading, setDownloading] = useState<null | 'pdf' | 'xlsx'>(null);

  const { data, isLoading, isError } = useFiscalReport(year, month, quarter);
  const years = [thisYear, thisYear - 1, thisYear - 2];
  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(Date.UTC(2000, i, 1))));
  }, [locale]);

  const blocks = data?.blocks ?? [];

  async function onDownload(kind: 'pdf' | 'xlsx') {
    setDownloading(kind);
    try {
      await downloadFiscalReport(kind, { year, month, quarter });
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <Link
        href="/billing"
        className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> {t('back')}
      </Link>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <Card>
        <CardHeader className="flex-col items-stretch gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
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
              disabled={month !== 0}
              aria-label={t('selectQuarter')}
              className="h-8 rounded-md border bg-[var(--surface-1)] px-2 text-[12.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <option value={0}>{t('fullYear')}</option>
              <option value={1}>T1</option>
              <option value={2}>T2</option>
              <option value={3}>T3</option>
              <option value={4}>T4</option>
            </select>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              aria-label={t('selectMonth')}
              className="h-8 rounded-md border bg-[var(--surface-1)] px-2 text-[12.5px] capitalize text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value={0}>{t('allMonths')}</option>
              {monthNames.map((name, i) => (
                <option key={i} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={blocks.length === 0 || downloading !== null}
              onClick={() => onDownload('pdf')}
            >
              <Download /> {t('exportPdf')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={blocks.length === 0 || downloading !== null}
              onClick={() => onDownload('xlsx')}
            >
              <Download /> {t('exportExcel')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isError && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {t('loadError')}
            </p>
          )}
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : blocks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            blocks.map((b) => (
              <section key={b.format} className="space-y-4">
                <div className="text-[13px] font-semibold text-[var(--brand)]">{blockTitle(b)}</div>

                {/* Impuesto repercutido por tipo */}
                <TableCard
                  heading={t('outputTitle')}
                  head={[t('concept'), t('invoices'), t('base'), t('tax')]}
                  align={['left', 'right', 'right', 'right']}
                  rows={b.outputTax.map((r) => [
                    conceptLabel(r.code, r.ratePercent),
                    String(r.invoices),
                    formatMoney(r.base, b.currency, locale),
                    formatMoney(r.tax, b.currency, locale),
                  ])}
                />

                {/* Retención IRPF (solo si hay) */}
                {b.withholding.length > 0 && (
                  <TableCard
                    heading={t('withholdingTitle')}
                    head={[t('concept'), t('invoices'), t('base'), t('withholding')]}
                    align={['left', 'right', 'right', 'right']}
                    rows={b.withholding.map((r) => [
                      conceptLabel(r.code, r.ratePercent),
                      String(r.invoices),
                      formatMoney(r.base, b.currency, locale),
                      formatMoney(r.amount, b.currency, locale),
                    ])}
                  />
                )}

                {/* Por serie */}
                <TableCard
                  heading={t('seriesTitle')}
                  head={[
                    t('series'),
                    t('invoices'),
                    t('base'),
                    t('tax'),
                    t('withholding'),
                    t('total'),
                  ]}
                  align={['left', 'right', 'right', 'right', 'right', 'right']}
                  rows={b.bySeries.map((s) => [
                    s.series,
                    String(s.invoices),
                    formatMoney(s.base, b.currency, locale),
                    formatMoney(s.tax, b.currency, locale),
                    formatMoney(s.withholding, b.currency, locale),
                    formatMoney(s.total, b.currency, locale),
                  ])}
                />

                {/* Totales del bloque */}
                <div className="grid gap-3 sm:grid-cols-4">
                  <Kpi label={t('base')} value={formatMoney(b.totals.base, b.currency, locale)} />
                  <Kpi
                    label={t('tax')}
                    value={formatMoney(b.totals.tax, b.currency, locale)}
                    hint={b.format === 'es' ? t('model303') : undefined}
                  />
                  <Kpi
                    label={t('withholding')}
                    value={formatMoney(b.totals.withholding, b.currency, locale)}
                  />
                  <Kpi label={t('total')} value={formatMoney(b.totals.total, b.currency, locale)} />
                </div>
              </section>
            ))
          )}
          <p className="text-[11px] text-muted-foreground">{t('note')}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TableCard({
  heading,
  head,
  align,
  rows,
}: {
  heading: string;
  head: string[];
  align: ('left' | 'right')[];
  rows: string[][];
}) {
  return (
    <div className="space-y-2">
      <div className="text-[12.5px] font-semibold">{heading}</div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11.5px] uppercase tracking-wide text-muted-foreground">
              {head.map((h, i) => (
                <th
                  key={i}
                  className={`px-3 py-2 ${align[i] === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b border-border last:border-0">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-3 py-2 ${align[c] === 'right' ? 'text-right tabular-nums' : ''} ${c === 0 ? 'font-medium' : ''}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
