'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Briefcase, Building2, ReceiptText, ShieldCheck, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useMatters, useResourceCount } from '@/lib/hooks';
import { jurisdictionCopy } from '@/lib/jurisdiction';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/lexora/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function Kpi({
  label,
  icon: Icon,
  resource,
}: {
  label: string;
  icon: typeof Users;
  resource: 'clients' | 'matters';
}) {
  const t = useTranslations('dashboard');
  const { data, isLoading, isError, refetch, isFetching } = useResourceCount(resource);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : isError ? (
          <div className="space-y-2">
            <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {t('retry')}
            </Button>
          </div>
        ) : (
          <div className="text-3xl font-semibold tabular-nums">{data?.total ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentMatters() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const { data, isLoading, isError } = useMatters({ page: 1, pageSize: 5 });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">{t('recentMatters')}</CardTitle>
        <Link href="/matters" className="text-xs text-[var(--brand)] hover:underline">
          {t('viewAll')}
        </Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}
        {!isLoading && !isError && data?.items.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('noMatters')}</p>
        )}
        {!isLoading &&
          !isError &&
          data?.items.map((m) => (
            <Link
              key={m.id}
              href={`/matters/${m.id}`}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
            >
              <span className="font-mono text-xs text-muted-foreground">{m.reference}</span>
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              <StatusBadge status={m.status} />
              <span className="hidden tabular-nums text-xs text-muted-foreground sm:inline">
                {formatDate(m.openedAt, locale)}
              </span>
            </Link>
          ))}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tNav = useTranslations('nav');
  const locale = useLocale();
  const { user } = useAuth();
  if (!user) return null;

  const copy = jurisdictionCopy(user.jurisdiction);
  const infoRows = [
    { icon: Building2, label: t('country'), value: copy.country },
    { icon: ReceiptText, label: t('eInvoice'), value: copy.eInvoice },
    { icon: ShieldCheck, label: t('taxes'), value: copy.taxes },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('welcome')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.email} · {copy.country} · {locale}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label={tNav('matters')} icon={Briefcase} resource="matters" />
        <Kpi label={tNav('clients')} icon={Users} resource="clients" />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('compliance')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {infoRows.map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center gap-2.5 text-sm">
                  <Icon className="size-4 text-[var(--brand)]" />
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="ml-auto text-right font-medium">{row.value}</span>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="info">{copy.taxIds}</Badge>
              <Badge variant="success">{copy.defaultCurrency}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <RecentMatters />
    </div>
  );
}
