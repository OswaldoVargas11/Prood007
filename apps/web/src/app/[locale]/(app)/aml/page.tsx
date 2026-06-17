'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useKycOverview, useKycSummary } from '@/lib/hooks';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { KycRisk, KycStatus } from '@/lib/types';

function statusVariant(s: KycStatus): 'success' | 'warning' | 'danger' | 'secondary' {
  if (s === 'APPROVED') return 'success';
  if (s === 'REJECTED') return 'danger';
  if (s === 'IN_REVIEW') return 'warning';
  return 'secondary';
}
function riskVariant(r: KycRisk | null): 'success' | 'warning' | 'danger' | 'secondary' {
  if (r === 'HIGH') return 'danger';
  if (r === 'MEDIUM') return 'warning';
  if (r === 'LOW') return 'success';
  return 'secondary';
}

export default function AmlPage() {
  const t = useTranslations('kyc');
  const overview = useKycOverview();
  const summary = useKycSummary();

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-6 text-[var(--brand)]" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('amlTitle')}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t('amlSubtitle')}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={t('total')} value={summary.data?.total} loading={summary.isLoading} />
        <Stat
          label={t('statuses.PENDING')}
          value={summary.data?.byStatus.PENDING}
          loading={summary.isLoading}
        />
        <Stat
          label={t('highRisk')}
          value={summary.data?.highRisk}
          loading={summary.isLoading}
          warn
        />
        <Stat label={t('pep')} value={summary.data?.pep} loading={summary.isLoading} warn />
      </div>

      {overview.isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
      {overview.data && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">{t('client')}</th>
                <th className="px-4 py-2.5">{t('status')}</th>
                <th className="px-4 py-2.5">{t('risk')}</th>
                <th className="px-4 py-2.5">{t('flags')}</th>
              </tr>
            </thead>
            <tbody>
              {overview.data.map((row) => (
                <tr key={row.clientId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/clients/${row.clientId}`}
                      className="font-medium hover:text-[var(--brand)] hover:underline"
                    >
                      {row.name}
                    </Link>
                    <div className="font-mono text-[11px] text-muted-foreground">{row.taxId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(row.status)}>{t(`statuses.${row.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {row.risk ? (
                      <Badge variant={riskVariant(row.risk)}>{t(`risks.${row.risk}`)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.isPep && (
                      <span className="inline-flex items-center gap-1 text-[12px] text-[var(--warning)]">
                        <AlertTriangle className="size-3.5" /> {t('pep')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {overview.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    {t('amlEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  loading,
  warn,
}: {
  label: string;
  value?: number;
  loading: boolean;
  warn?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-10" />
        ) : (
          <div
            className={`mt-0.5 text-2xl font-semibold tabular-nums ${
              warn && (value ?? 0) > 0 ? 'text-[var(--warning)]' : ''
            }`}
          >
            {value ?? 0}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
