'use client';

import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useChangeMatterStatus, useMatter } from '@/lib/hooks';
import { nextStatuses } from '@/lib/matter-status';
import { formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/lexora/status-badge';
import { DocumentsTab } from '@/components/lexora/documents-tab';
import { TasksPanel } from '@/components/lexora/tasks-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function MatterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('matters');
  const tStatus = useTranslations('matters.status');
  const locale = useLocale();
  const { data: matter, isLoading, isError, refetch } = useMatter(id);
  const changeStatus = useChangeMatterStatus(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !matter) {
    return (
      <div className="mx-auto max-w-5xl space-y-3 py-12 text-center">
        <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          {t('retry')}
        </Button>
        <div>
          <Link href="/matters" className="text-sm text-[var(--brand)] hover:underline">
            ← {t('title')}
          </Link>
        </div>
      </div>
    );
  }

  const transitions = nextStatuses(matter.status);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/matters" className="text-sm text-muted-foreground hover:text-foreground">
        ← {t('title')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">{matter.reference}</span>
            <StatusBadge status={matter.status} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{matter.title}</h1>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={transitions.length === 0 || changeStatus.isPending}
            >
              {changeStatus.isPending ? <Loader2 className="animate-spin" /> : null}
              {t('changeStatus')}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {transitions.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => changeStatus.mutate(s)}>
                {tStatus(s)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {changeStatus.isError && <p className="text-sm text-[var(--danger)]">{t('statusError')}</p>}

      <Tabs defaultValue="overview">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
          <TabsTrigger value="documents">{t('tabs.documents')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('tabs.tasks')}</TabsTrigger>
          <TabsTrigger value="costs">{t('tabs.costs')}</TabsTrigger>
          <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
          <TabsTrigger value="activity">{t('tabs.activity')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
              <Field
                label={t('detail.client')}
                value={matter.client.name}
                hint={matter.client.taxId}
              />
              <Field label={t('detail.type')} value={matter.type} />
              <Field label={t('detail.opened')} value={formatDate(matter.openedAt, locale)} />
              <Field
                label={t('detail.closed')}
                value={matter.closedAt ? formatDate(matter.closedAt, locale) : '—'}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab matterId={id} />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksPanel matterId={id} />
        </TabsContent>

        {['costs', 'chat', 'activity'].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card>
              <CardContent className="p-12 text-center text-sm text-muted-foreground">
                {t('tabs.soon')}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
      {hint && <div className="font-mono text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
