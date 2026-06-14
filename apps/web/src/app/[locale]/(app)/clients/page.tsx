'use client';

import { useTranslations } from 'next-intl';
import { Check, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useClients } from '@/lib/hooks';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export default function ClientsPage() {
  const t = useTranslations('clients');
  const { data, isLoading, isError, refetch } = useClients();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('name')}</th>
              <th className="px-4 py-3 font-medium">{t('fiscalId')}</th>
              <th className="px-4 py-3 font-medium">{t('email')}</th>
              <th className="px-4 py-3 text-center font-medium">{t('matters')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td colSpan={4} className="px-4 py-3">
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))}
            {!isLoading &&
              !isError &&
              data?.items.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-accent"
                >
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[10px] font-semibold text-[var(--brand)]">
                        {initials(c.name)}
                      </span>
                      <span className="font-medium hover:underline">{c.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{c.taxId}</span>
                      {c.taxIdKind && (
                        <Badge variant="success" className="gap-1 py-0">
                          <Check className="size-3" />
                          {c.taxIdKind}
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-center font-semibold tabular-nums">
                    {c._count?.matters ?? 0}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {isError && (
          <div className="space-y-2 p-8 text-center">
            <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          </div>
        )}
        {!isLoading && !isError && data?.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <Users className="size-6" />
            {t('empty')}
          </div>
        )}
      </Card>
    </div>
  );
}
