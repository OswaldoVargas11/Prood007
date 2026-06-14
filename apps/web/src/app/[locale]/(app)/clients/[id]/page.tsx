'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Mail, MapPin, Phone } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useClient, useMatters } from '@/lib/hooks';
import { StatusBadge } from '@/components/lexora/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export default function ClientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('clients');
  const tm = useTranslations('matters');
  const { data: client, isLoading } = useClient(id);
  const matters = useMatters({ clientId: id, pageSize: 100 });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!client) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {t('loadError')}
        <div className="mt-2">
          <Link href="/clients" className="text-[var(--brand)] hover:underline">
            ← {t('title')}
          </Link>
        </div>
      </div>
    );
  }

  const contact = [
    client.email && { icon: Mail, value: client.email },
    client.phone && { icon: Phone, value: client.phone },
    client.address && { icon: MapPin, value: client.address },
  ].filter(Boolean) as { icon: typeof Mail; value: string }[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground">
        ← {t('title')}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Resumen */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl bg-[var(--brand)] text-base font-semibold text-white">
                {initials(client.name)}
              </span>
              <div className="min-w-0">
                <div className="font-semibold leading-tight">{client.name}</div>
                <div className="text-xs text-muted-foreground">
                  {client.taxIdKind ?? t('client')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-border bg-[var(--surface-2)] px-3 py-2">
              <span className="font-mono text-xs text-muted-foreground">{client.taxId}</span>
              {client.taxIdKind && (
                <Badge variant="success" className="ml-auto gap-1 py-0">
                  <Check className="size-3" />
                  {t('validated')}
                </Badge>
              )}
            </div>

            {contact.length > 0 && (
              <div className="space-y-2">
                {contact.map((c, i) => {
                  const Icon = c.icon;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 text-sm text-muted-foreground"
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{c.value}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              className="rounded-lg border p-3"
              style={{
                background: client.userId ? 'var(--success-soft)' : 'var(--surface-2)',
                borderColor: client.userId ? 'var(--success)' : 'var(--border)',
              }}
            >
              <div
                className="flex items-center gap-2 text-xs font-semibold"
                style={{ color: client.userId ? 'var(--success)' : 'var(--text-subtle)' }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: client.userId ? 'var(--success)' : 'var(--text-subtle)' }}
                />
                {client.userId ? t('portalActive') : t('portalInactive')}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="matters">
          <TabsList className="w-full overflow-x-auto">
            <TabsTrigger value="matters">{tm('title')}</TabsTrigger>
            <TabsTrigger value="documents">{t('tabDocuments')}</TabsTrigger>
            <TabsTrigger value="invoices">{t('tabInvoices')}</TabsTrigger>
          </TabsList>

          <TabsContent value="matters">
            {matters.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : matters.data?.items.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {tm('empty')}
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="divide-y divide-border">
                  {matters.data?.items.map((m) => (
                    <Link
                      key={m.id}
                      href={`/matters/${m.id}`}
                      className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent"
                    >
                      <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                        {m.reference}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                      <StatusBadge status={m.status} />
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('docsHint')}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="invoices">
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('invoicesHint')}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
