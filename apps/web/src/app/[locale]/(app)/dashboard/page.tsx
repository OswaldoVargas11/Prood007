'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Building2, ReceiptText, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { jurisdictionCopy } from '@/lib/jurisdiction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function ClientsKpi() {
  const t = useTranslations('dashboard');
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['clients', 'count'],
    queryFn: () => api.get<Paginated<unknown>>('/clients?page=1&pageSize=1'),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{t('clients')}</CardTitle>
        <Users className="size-4 text-muted-foreground" />
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

export default function DashboardPage() {
  const t = useTranslations('dashboard');
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
        <ClientsKpi />

        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('compliance')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {infoRows.map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center gap-3 text-sm">
                  <Icon className="size-4 text-[var(--brand)]" />
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="ml-auto font-medium">{row.value}</span>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="info">{copy.taxIds}</Badge>
              <Badge variant="success">{copy.defaultCurrency}</Badge>
              {user.roles.map((r) => (
                <Badge key={r} variant="outline">
                  {r}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">{t('next')}</p>
    </div>
  );
}
