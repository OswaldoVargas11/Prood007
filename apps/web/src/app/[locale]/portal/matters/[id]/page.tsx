'use client';

import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePortalDocuments, usePortalLedger, usePortalMatter, usePortalTasks } from '@/lib/hooks';
import { docStatusVariant } from '@/lib/doc-status';
import { taskStatusVariant } from '@/lib/task-status';
import { BALANCE_SIGN, entryTypeVariant } from '@/lib/ledger';
import { formatDate, formatMoney } from '@/lib/format';
import { StatusBadge } from '@/components/lexora/status-badge';
import { ChatTab } from '@/components/lexora/chat-tab';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export default function PortalMatterPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('matters');
  const tp = useTranslations('portal');
  const { data: matter, isLoading } = usePortalMatter(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!matter) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {t('loadError')}
        <div className="mt-2">
          <Link href="/portal" className="text-[var(--brand)] hover:underline">
            ← {tp('back')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/portal" className="text-sm text-muted-foreground hover:text-foreground">
        ← {tp('back')}
      </Link>
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">{matter.reference}</span>
          <StatusBadge status={matter.status} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{matter.title}</h1>
      </div>

      <Tabs defaultValue="documents">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="documents">{t('tabs.documents')}</TabsTrigger>
          <TabsTrigger value="costs">{t('tabs.costs')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('tabs.tasks')}</TabsTrigger>
          <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
        </TabsList>
        <TabsContent value="documents">
          <PortalDocuments matterId={id} />
        </TabsContent>
        <TabsContent value="costs">
          <PortalLedger matterId={id} />
        </TabsContent>
        <TabsContent value="tasks">
          <PortalTasks matterId={id} />
        </TabsContent>
        <TabsContent value="chat">
          <ChatTab matterId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PortalDocuments({ matterId }: { matterId: string }) {
  const t = useTranslations('documents');
  const tStatus = useTranslations('documents.status');
  const { data, isLoading } = usePortalDocuments(matterId);
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data || data.length === 0) return <Empty>{t('empty')}</Empty>;
  return (
    <div className="space-y-2">
      {data.map((doc) => (
        <Card key={doc.id}>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="font-medium">{doc.name}</span>
            {doc.versions[0] && (
              <Badge variant={docStatusVariant(doc.versions[0].reviewStatus)}>
                {tStatus(doc.versions[0].reviewStatus)}
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {doc.versions.length} {t('newVersion')}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PortalLedger({ matterId }: { matterId: string }) {
  const t = useTranslations('billing');
  const tType = useTranslations('billing.type');
  const locale = useLocale();
  const { data, isLoading } = usePortalLedger(matterId);
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data) return <Empty>{t('empty')}</Empty>;
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <span className="text-sm text-muted-foreground">{t('balance')}</span>
          <span
            className={cn(
              'text-2xl font-semibold tabular-nums',
              Number(data.balance) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]',
            )}
          >
            {formatMoney(data.balance, data.currency, locale)}
          </span>
        </CardContent>
      </Card>
      {data.entries.length === 0 ? (
        <Empty>{t('empty')}</Empty>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {data.entries.map((e) => {
                const sign = BALANCE_SIGN[e.type];
                return (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <Badge variant={entryTypeVariant(e.type)}>{tType(e.type)}</Badge>
                    </td>
                    <td className="px-4 py-2">{e.description}</td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums',
                        sign > 0 && 'text-[var(--success)]',
                        sign < 0 && 'text-[var(--danger)]',
                      )}
                    >
                      {sign < 0 ? '−' : sign > 0 ? '+' : ''}
                      {formatMoney(e.amount, e.currency, locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function PortalTasks({ matterId }: { matterId: string }) {
  const t = useTranslations('tasks');
  const tStatus = useTranslations('tasks.status');
  const locale = useLocale();
  const { data, isLoading } = usePortalTasks(matterId);
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data || data.length === 0) return <Empty>{t('empty')}</Empty>;
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {data.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
            {task.dueDate && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatDate(task.dueDate, locale)}
              </span>
            )}
            <Badge variant={taskStatusVariant(task.status)}>{tStatus(task.status)}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}
